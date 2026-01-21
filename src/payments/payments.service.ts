import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model, Types } from 'mongoose';

import { Payment, PaymentDocument } from './payment.schema';
import { CreateVnpayDto } from './dto/create-vnpay.dto';
import { buildQuery, formatVnpDate, hmacSHA512, sortObject } from './vnpay.util';
import { Bill, BillDocument } from '../bills/bill.schema';
import { TableSession, TableSessionDocument } from '../table-sessions/table-session.schema';
import { Order, OrderDocument } from '../orders/order.schema';
import { pickVnpParams, verifyVnpaySecureHash } from './vnpay.verify';

import { OrdersGateway } from '../orders/orders.gateway';
import { PublicOrdersGateway } from '../orders/public-orders.gateway';
import { RESTAURANT_ID } from '../config/restaurant.config';

function centsToVnd(totalCents: number) {
  return Math.round(Number(totalCents || 0));
}

function asString(x: any) {
  if (x === undefined || x === null) return '';
  return String(x);
}

@Injectable()
export class PaymentsService {
  constructor(
    @InjectModel(Payment.name) private readonly paymentModel: Model<PaymentDocument>,
    @InjectModel(Bill.name) private readonly billModel: Model<BillDocument>,
    @InjectModel(TableSession.name) private readonly sessionModel: Model<TableSessionDocument>,
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
    private readonly config: ConfigService,

    private readonly ordersGateway: OrdersGateway,
    private readonly publicGateway: PublicOrdersGateway,
  ) {}

  private mustGetEnv(key: string) {
    const v = this.config.get<string>(key);
    if (!v) throw new BadRequestException(`Missing env: ${key}`);
    return v;
  }

  private parseObjectId(id: string, name: string) {
    try {
      return new Types.ObjectId(id);
    } catch {
      throw new BadRequestException(`Invalid ${name}`);
    }
  }

  private isObjectId(x: any): x is Types.ObjectId {
    return x instanceof Types.ObjectId;
  }

  private normalizeOrderIds(xs: any[]): Types.ObjectId[] {
    return (xs ?? [])
      .map((x: any) => {
        try {
          return new Types.ObjectId(x);
        } catch {
          return null;
        }
      })
      .filter(this.isObjectId);
  }

  private async markOrdersBilled(args: {
    sessionId: Types.ObjectId;
    billId: Types.ObjectId;
    orderIds: Types.ObjectId[];
    now: Date;
  }) {
    const { sessionId, billId, orderIds, now } = args;
    if (!orderIds.length) return;

    await this.orderModel.updateMany(
      {
        restaurantId: RESTAURANT_ID,
        sessionId,
        _id: { $in: orderIds },
        $or: [{ billId: null }, { billId: { $exists: false } }],
      },
      { $set: { billId, billedAt: now } },
    );
  }

  async createVnpayPayment(dto: CreateVnpayDto, ctx: { restaurantId: string; ipAddr: string }) {
    const tmnCode = this.mustGetEnv('VNP_TMN_CODE');
    const hashSecret = this.mustGetEnv('VNP_HASH_SECRET');
    const payUrl = this.mustGetEnv('VNP_PAY_URL');
    const returnUrl = this.mustGetEnv('VNP_RETURN_URL');

    const billId = this.parseObjectId(dto.billId, 'billId');

    const bill: any = await this.billModel.findOne({
      _id: billId,
      restaurantId: ctx.restaurantId,
    });

    if (!bill) throw new NotFoundException('Bill not found');
    if (bill.status === 'PAID') throw new ConflictException('Bill already paid');
    if (bill.status === 'CANCELLED') throw new ConflictException('Bill cancelled');

    const amountVnd = centsToVnd(bill.totalCents);
    if (!amountVnd || amountVnd <= 0) {
      throw new BadRequestException('Bill total is invalid');
    }

    const txnRef = `B${bill._id.toString()}_${Date.now()}`;
    const now = new Date();

    if (bill.status !== 'PAYMENT_PENDING' || bill.method !== 'ONLINE') {
      bill.status = 'PAYMENT_PENDING';
      bill.method = 'ONLINE';
      bill.requestedAt = bill.requestedAt ?? now;
      await bill.save();
    }

    await this.sessionModel.updateOne(
      { _id: bill.sessionId, restaurantId: ctx.restaurantId, status: { $ne: 'CLOSED' } },
      {
        $set: {
          status: 'PAYMENT_PENDING',
          activeBillId: bill._id,
          billRequestedAt: now,
        },
      },
    );

    this.ordersGateway.emitBillPaymentPending({
      billId: String(bill._id),
      sessionId: String(bill.sessionId),
      tableId: bill.tableId ? String(bill.tableId) : undefined,
      tableNumber: bill.tableNumberSnapshot,
      totalCents: Number(bill.totalCents || 0),
      note: bill.note ?? '',
      method: 'ONLINE',
    });

    await this.paymentModel.create({
      restaurantId: ctx.restaurantId,
      billId: bill._id,
      sessionId: bill.sessionId,
      tableId: bill.tableId,
      provider: 'VNPAY',
      txnRef,
      amountVnd,
      status: 'PENDING',
    });

    const vnpParams: Record<string, any> = {
      vnp_Version: '2.1.0',
      vnp_Command: 'pay',
      vnp_TmnCode: tmnCode,
      vnp_Locale: 'vn',
      vnp_CurrCode: 'VND',
      vnp_TxnRef: txnRef,
      vnp_OrderInfo: `Thanh toan bill ${bill._id.toString()} - Ban ${bill.tableNumberSnapshot}`,
      vnp_OrderType: 'other',
      vnp_Amount: Math.round(amountVnd * 100),
      vnp_ReturnUrl: returnUrl,
      vnp_IpAddr: ctx.ipAddr,
      vnp_CreateDate: formatVnpDate(),
    };

    const sorted = sortObject(vnpParams);
    const signData = buildQuery(sorted);
    const secureHash = hmacSHA512(hashSecret, signData);
    const paymentUrl = `${payUrl}?${buildQuery({ ...sorted, vnp_SecureHash: secureHash })}`;

    await this.paymentModel.updateOne(
      { restaurantId: ctx.restaurantId, txnRef },
      { $set: { rawCreateParams: { ...sorted, vnp_SecureHash: secureHash } } },
    );

    return {
      billId: bill._id.toString(),
      sessionId: bill.sessionId.toString(),
      tableId: bill.tableId.toString(),
      txnRef,
      amountVnd,
      paymentUrl,
    };
  }

  async handleVnpayReturn(rawQuery: Record<string, any>, ctx: { restaurantId: string }) {
    const hashSecret = this.mustGetEnv('VNP_HASH_SECRET');
    const vnp = pickVnpParams(rawQuery);

    const txnRef = asString(vnp['vnp_TxnRef']);
    const responseCode = asString(vnp['vnp_ResponseCode']);
    const transactionNo = asString(vnp['vnp_TransactionNo']);

    let verified = false;
    try {
      verified = verifyVnpaySecureHash(vnp, hashSecret).ok;
    } catch {
      verified = false;
    }

    if (txnRef) {
      await this.paymentModel.updateOne(
        { restaurantId: ctx.restaurantId, txnRef, provider: 'VNPAY' },
        {
          $set: {
            rawReturnParams: vnp,
            vnpResponseCode: responseCode || undefined,
            vnpTransactionNo: transactionNo || undefined,
          },
        },
      );
    }

    return {
      ok: true,
      verified,
      txnRef,
      responseCode,
      transactionNo,
      shouldPoll: true,
    };
  }

  async handleVnpayIpn(raw: Record<string, any>, ctx: { restaurantId: string }) {
    const hashSecret = this.mustGetEnv('VNP_HASH_SECRET');

    const vnp = pickVnpParams(raw);

    let v;
    try {
      v = verifyVnpaySecureHash(vnp, hashSecret);
    } catch {
      return { RspCode: '97', Message: 'Invalid signature' };
    }

    if (!v.ok) return { RspCode: '97', Message: 'Invalid signature' };

    const txnRef = asString(vnp['vnp_TxnRef']);
    const responseCode = asString(vnp['vnp_ResponseCode']);
    const transactionStatus = asString(vnp['vnp_TransactionStatus']);
    const transactionNo = asString(vnp['vnp_TransactionNo']);

    if (!txnRef) return { RspCode: '01', Message: 'Missing TxnRef' };

    const payment = await this.paymentModel.findOne({
      restaurantId: ctx.restaurantId,
      txnRef,
      provider: 'VNPAY',
    });

    if (!payment) return { RspCode: '01', Message: 'Payment not found' };
    if (payment.status === 'SUCCESS') return { RspCode: '00', Message: 'Already confirmed' };
    if (payment.status === 'FAILED') return { RspCode: '00', Message: 'Already failed' };

    const isSuccess =
      responseCode === '00' && (transactionStatus === '' || transactionStatus === '00');

    await this.paymentModel.updateOne(
      { _id: payment._id },
      {
        $set: {
          rawIpnParams: vnp,
          vnpResponseCode: responseCode || undefined,
          vnpTransactionNo: transactionNo || undefined,
        },
      },
    );

    const bill: any = await this.billModel.findOne({
      _id: payment.billId,
      restaurantId: ctx.restaurantId,
    });
    if (!bill) return { RspCode: '01', Message: 'Bill not found' };

    const session: any = await this.sessionModel.findOne({
      _id: payment.sessionId,
      restaurantId: ctx.restaurantId,
    });
    if (!session) return { RspCode: '01', Message: 'Session not found' };

    const now = new Date();

    if (!isSuccess) {
      await this.paymentModel.updateOne(
        { _id: payment._id, status: 'PENDING' },
        { $set: { status: 'FAILED' } },
      );
      return { RspCode: '00', Message: 'Confirm Failed' };
    }

    await this.paymentModel.updateOne(
      { _id: payment._id, status: 'PENDING' },
      { $set: { status: 'SUCCESS' } },
    );

    if (bill.status !== 'PAID') {
      bill.status = 'PAID';
      bill.method = 'ONLINE';
      bill.paidAt = now;
      await bill.save();
    }

    const orderIds = this.normalizeOrderIds(bill.orderIds ?? []);
    await this.markOrdersBilled({
      sessionId: bill.sessionId,
      billId: bill._id,
      orderIds,
      now,
    });

    await this.sessionModel.updateOne(
      { _id: bill.sessionId, restaurantId: ctx.restaurantId },
      { $set: { status: 'PAID', paidAt: now, activeBillId: bill._id } },
    );

    this.publicGateway.emitToSession(bill.sessionKey, 'bill.paid', {
      billId: String(bill._id),
      status: 'PAID',
      method: 'ONLINE',
      totalCents: Number(bill.totalCents || 0),
      paidAt: now.toISOString(),
    });

    this.ordersGateway.emitBillPaid({
      billId: String(bill._id),
      sessionId: String(bill.sessionId),
      tableNumber: bill.tableNumberSnapshot,
      method: 'ONLINE',
      totalCents: Number(bill.totalCents || 0),
      paidAt: now.toISOString(),
    });

    return { RspCode: '00', Message: 'Confirm Success' };
  }

  async getVnpayStatus(txnRef: string, ctx: { restaurantId: string }) {
    if (!txnRef) throw new BadRequestException('Missing txnRef');

    const payment: any = await this.paymentModel
      .findOne({ restaurantId: ctx.restaurantId, provider: 'VNPAY', txnRef })
      .select('status billId vnpResponseCode vnpTransactionNo createdAt updatedAt')
      .lean();

    if (!payment) throw new NotFoundException('Payment not found');

    const bill: any = await this.billModel
      .findOne({ _id: payment.billId, restaurantId: ctx.restaurantId })
      .select('status paidAt totalCents method')
      .lean();

    return {
      txnRef,
      paymentStatus: payment.status,
      vnpResponseCode: payment.vnpResponseCode ?? null,
      vnpTransactionNo: payment.vnpTransactionNo ?? null,
      bill: bill
        ? {
            billId: String(payment.billId),
            status: bill.status,
            method: bill.method,
            paidAt: bill.paidAt ?? null,
            totalCents: Number(bill.totalCents || 0),
          }
        : null,
    };
  }
}

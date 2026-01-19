import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { RESTAURANT_ID } from '../config/restaurant.config';
import { Payment, PaymentDocument, PaymentProvider } from './payment.schema';
import { Bill, BillDocument } from '../bills/bill.schema';
import { TableSession, TableSessionDocument } from '../table-sessions/table-session.schema';
import { BillsService } from '../bills/bills.service';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectModel(Payment.name) private readonly paymentModel: Model<PaymentDocument>,
    @InjectModel(Bill.name) private readonly billModel: Model<BillDocument>,
    @InjectModel(TableSession.name) private readonly sessionModel: Model<TableSessionDocument>,
    private readonly billsService: BillsService,
  ) {}

  /**
   * Create checkout (mock now, vnpay later)
   * POST /public/bills/:billId/payments
   */
  async createBillPayment(args: {
    billId: string;
    provider: PaymentProvider;
    amountCents?: number;
  }) {
    const { billId, provider } = args;

    let bid: Types.ObjectId;
    try {
      bid = new Types.ObjectId(billId);
    } catch {
      throw new BadRequestException('Invalid billId');
    }

    const bill: any = await this.billModel.findOne({ _id: bid, restaurantId: RESTAURANT_ID }).lean();
    if (!bill) throw new NotFoundException('Bill not found');

    if (String(bill.status).toUpperCase() === 'PAID') {
      throw new ConflictException('Bill already PAID');
    }

    const s: any = await this.sessionModel.findOne({ _id: bill.sessionId, restaurantId: RESTAURANT_ID }).lean();
    if (!s) throw new NotFoundException('Session not found');

    const amountCents = Number(args.amountCents ?? bill.totalCents ?? 0);
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      throw new BadRequestException('Invalid amountCents');
    }

    // Create payment pending
    const p: any = await this.paymentModel.create({
      restaurantId: RESTAURANT_ID,
      billId: bid,
      sessionId: bill.sessionId,
      provider,
      status: 'pending',
      amountCents,
    });

    // For mock: checkoutUrl points to FE route /mock-pay
    // NOTE: FE route depends on your router. Here use /mock-pay?pid=...&billId=...
    // If your FE is at same origin, this is ok. If not, set FRONTEND_URL env.
    const frontendBase = process.env.FRONTEND_URL || '';
    const checkoutUrl = `${frontendBase}/mock-pay?pid=${encodeURIComponent(String(p._id))}&billId=${encodeURIComponent(
      String(bid),
    )}`;

    await this.paymentModel.updateOne(
      { _id: p._id, restaurantId: RESTAURANT_ID },
      { $set: { checkoutUrl, providerRef: String(p._id) } },
    );

    return {
      ok: true,
      provider,
      billId: String(bid),
      paymentId: String(p._id),
      checkoutUrl,
    };
  }

  async getPayment(paymentId: string) {
    let pid: Types.ObjectId;
    try {
      pid = new Types.ObjectId(paymentId);
    } catch {
      throw new BadRequestException('Invalid paymentId');
    }

    const p: any = await this.paymentModel.findOne({ _id: pid, restaurantId: RESTAURANT_ID }).lean();
    if (!p) throw new NotFoundException('Payment not found');

    return {
      paymentId: String(p._id),
      billId: String(p.billId),
      amountCents: Number(p.amountCents || 0),
      provider: p.provider,
      status: p.status,
      createdAt: p.createdAt ? new Date(p.createdAt).toISOString() : undefined,
    };
  }

  /**
   * mock webhook success -> set payment succeeded -> mark bill PAID online
   */
  async mockSuccess(paymentId: string) {
    let pid: Types.ObjectId;
    try {
      pid = new Types.ObjectId(paymentId);
    } catch {
      throw new BadRequestException('Invalid paymentId');
    }

    const now = new Date();

    // atomic status change
    const p: any = await this.paymentModel.findOneAndUpdate(
      { _id: pid, restaurantId: RESTAURANT_ID, status: 'pending', provider: 'mock' },
      { $set: { status: 'succeeded', succeededAt: now } },
      { new: true },
    );

    if (!p) throw new ConflictException('Payment is not pending (or not found)');

    // Mark bill PAID via BillsService.payOnline (expects tableId+token) -> not suitable for webhook
    // => Call a new internal helper in BillsService that marks by billId directly.
    // If you don't have it yet, add method: payOnlineByBillId(billId)
    await this.billsService.payOnlineByBillId(String(p.billId));

    return { ok: true, paymentId: String(p._id), billId: String(p.billId) };
  }

  async mockFail(paymentId: string) {
    let pid: Types.ObjectId;
    try {
      pid = new Types.ObjectId(paymentId);
    } catch {
      throw new BadRequestException('Invalid paymentId');
    }

    const now = new Date();

    const p: any = await this.paymentModel.findOneAndUpdate(
      { _id: pid, restaurantId: RESTAURANT_ID, status: 'pending', provider: 'mock' },
      { $set: { status: 'failed', failedAt: now } },
      { new: true },
    );

    if (!p) throw new ConflictException('Payment is not pending (or not found)');

    return { ok: true, paymentId: String(p._id), status: 'failed' };
  }
}

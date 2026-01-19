import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { RESTAURANT_ID } from '../config/restaurant.config';
import { Table, TableDocument } from '../tables/table.schema';
import { TableSession, TableSessionDocument } from './table-session.schema';
import { PublicOrdersGateway } from '../orders/public-orders.gateway';
import { OrdersGateway } from '../orders/orders.gateway';
import { TablesGateway } from './tables.gateway';

@Injectable()
export class StaffTableSessionsService {
  constructor(
    @InjectModel(TableSession.name)
    private readonly sessionModel: Model<TableSessionDocument>,
    @InjectModel(Table.name)
    private readonly tableModel: Model<TableDocument>,
    private readonly publicGateway: PublicOrdersGateway,
    private readonly ordersGateway: OrdersGateway,
    private readonly tablesGateway: TablesGateway,
  ) {}

  async closeSession(sessionId: string) {
    let sid: Types.ObjectId;
    try {
      sid = new Types.ObjectId(sessionId);
    } catch {
      throw new BadRequestException('Invalid sessionId');
    }

    const s: any = await this.sessionModel.findOne({
      _id: sid,
      restaurantId: RESTAURANT_ID,
    });

    if (!s) throw new NotFoundException('Session not found');

    // ✅ idempotent first
    if (s.status === 'CLOSED') {
      return { ok: true, sessionId: String(s._id), status: s.status };
    }

    // ✅ Flow mới: chỉ waiter gọi close; không bắt buộc session phải PAID ở đây
    // (việc "bill đã PAID" đã được check ở acceptPaidBill)
    if (!['OPEN', 'BILL_REQUESTED', 'PAYMENT_PENDING', 'PAID'].includes(String(s.status))) {
      throw new ConflictException(`Cannot close session (current: ${s.status})`);
    }

    s.status = 'CLOSED';
    s.closedAt = new Date();
    await s.save();

    const tableUpdate = await this.tableModel.updateOne(
      { _id: s.tableId, restaurantId: RESTAURANT_ID, status: { $ne: 'active' } },
      { $set: { status: 'active' } },
    );

    const modified =
      (tableUpdate as any)?.modifiedCount ?? (tableUpdate as any)?.nModified ?? 0;

    if (modified > 0) {
      this.tablesGateway.emitTableStatusChanged({
        tableId: String(s.tableId),
        status: 'active',
        tableNumber: String(s.tableNumberSnapshot ?? ''),
      });
    }

    const payload = {
      sessionId: String(s._id),
      tableNumber: String(s.tableNumberSnapshot ?? ''),
      closedAt: s.closedAt.toISOString(),
    };

    // 1) public (customer)
    this.publicGateway.emitToSession(s.sessionKey, 'session.closed', {
      sessionId: payload.sessionId,
      status: 'CLOSED',
      closedAt: payload.closedAt,
    });

    // 2) staff (waiter dashboard)
    this.ordersGateway.emitSessionClosed(payload);

    return { ok: true, sessionId: String(s._id), status: s.status };
  }
}

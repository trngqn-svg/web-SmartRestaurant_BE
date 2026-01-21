import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { RESTAURANT_ID } from '../config/restaurant.config';

import { Order, OrderDocument } from '../orders/order.schema';
import { TableSession, TableSessionDocument } from '../table-sessions/table-session.schema';
import { Bill, BillDocument } from './bill.schema';

import { OrdersGateway } from '../orders/orders.gateway';
import { PublicOrdersGateway } from '../orders/public-orders.gateway';
import { TableSessionsService } from '../table-sessions/table-sessions.service';
import { StaffTableSessionsService } from '../table-sessions/staff-table-sessions.service';

import { ModifierGroup, ModifierGroupDocument } from '../menu/modifiers/modifier-group.schema';
import { ModifierOption, ModifierOptionDocument } from '../menu/modifiers/modifier-option.schema';
import { Table, TableDocument } from '../tables/table.schema';

type Actor = { subjectType: 'USER' | 'ACCOUNT'; subjectId: string } | null | undefined;
type BillTab = 'REQUESTED' | 'PAID' | 'DONE';

function toObjectId(id: string, name: string) {
  try {
    return new Types.ObjectId(id);
  } catch {
    throw new BadRequestException(`Invalid ${name}`);
  }
}

@Injectable()
export class BillsService {
  constructor(
    @InjectModel(Bill.name) private readonly billModel: Model<BillDocument>,
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
    @InjectModel(TableSession.name) private readonly sessionModel: Model<TableSessionDocument>,
    @InjectModel(ModifierGroup.name) private readonly modifierGroupModel: Model<ModifierGroupDocument>,
    @InjectModel(ModifierOption.name) private readonly modifierOptionModel: Model<ModifierOptionDocument>,
    @InjectModel(Table.name) private readonly tableModel: Model<TableDocument>,

    private readonly ordersGateway: OrdersGateway,
    private readonly publicGateway: PublicOrdersGateway,
    private readonly tableSessions: TableSessionsService,
    private readonly staffSessions: StaffTableSessionsService,
  ) {}

  private parsePaging(args?: { page?: any; limit?: any }) {
    const rawPage = Number(args?.page ?? 1);
    const rawLimit = Number(args?.limit ?? 20);

    const page = Number.isFinite(rawPage) ? Math.max(1, Math.floor(rawPage)) : 1;
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.floor(rawLimit)) : 20;

    if (limit <= 0 || limit > 100) throw new BadRequestException('Invalid limit (1..100)');
    return { page, limit, skip: (page - 1) * limit };
  }

  private parseDateRange(args?: { datePreset?: string; from?: string; to?: string }) {
    if (args?.from || args?.to) {
      const from = args?.from ? new Date(args.from) : null;
      const to = args?.to ? new Date(args.to) : null;

      if (from && isNaN(from.getTime())) throw new BadRequestException('Invalid from');
      if (to && isNaN(to.getTime())) throw new BadRequestException('Invalid to');

      const range: any = {};
      if (from) range.$gte = from;
      if (to) range.$lte = to;
      return Object.keys(range).length ? range : null;
    }

    const preset = String(args?.datePreset || '').toLowerCase();
    if (!preset || preset === 'all') return null;

    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    const start = new Date(startOfToday);
    const end = new Date(startOfToday);

    if (preset === 'today') {
      end.setDate(end.getDate() + 1);
      return { $gte: start, $lt: end };
    }

    if (preset === 'yesterday') {
      start.setDate(start.getDate() - 1);
      end.setDate(end.getDate());
      return { $gte: start, $lt: end };
    }

    if (preset === 'this_week') {
      const day = start.getDay();
      const diffToMon = (day + 6) % 7;
      start.setDate(start.getDate() - diffToMon);
      end.setDate(start.getDate() + 7);
      return { $gte: start, $lt: end };
    }

    if (preset === 'this_month') {
      start.setDate(1);
      end.setMonth(end.getMonth() + 1, 1);
      return { $gte: start, $lt: end };
    }

    throw new BadRequestException('Invalid datePreset');
  }

  private async computeUnbilledOrders(sessionId: Types.ObjectId) {
    const orders: any[] = await this.orderModel
      .find({
        restaurantId: RESTAURANT_ID,
        sessionId,
        status: { $nin: ['draft', 'cancelled'] },
        $or: [{ billId: null }, { billId: { $exists: false } }],
      })
      .select({ _id: 1, totalCents: 1, status: 1, createdAt: 1 })
      .lean();

    const totalCents = orders.reduce((sum, o) => sum + Number(o.totalCents || 0), 0);
    return { orders, orderIds: orders.map((o) => o._id), totalCents };
  }

  private async buildModifierNameMaps(orders: any[]) {
    const groupIds: Types.ObjectId[] = [];
    const optionIds: Types.ObjectId[] = [];

    for (const o of orders) {
      for (const it of o.items ?? []) {
        for (const m of it.modifiers ?? []) {
          if (m?.groupId) {
            try {
              groupIds.push(new Types.ObjectId(m.groupId));
            } catch {}
          }
          for (const oid of m?.optionIds ?? []) {
            try {
              optionIds.push(new Types.ObjectId(oid));
            } catch {}
          }
        }
      }
    }

    const uniq = <T,>(arr: T[]) => Array.from(new Set(arr.map((x) => String(x)))).map((s) => new Types.ObjectId(s));

    const gIds = uniq(groupIds);
    const oIds = uniq(optionIds);

    const [groups, options] = await Promise.all([
      gIds.length
        ? this.modifierGroupModel
            .find({ _id: { $in: gIds } })
            .select({ _id: 1, name: 1 })
            .lean()
        : Promise.resolve([]),
      oIds.length
        ? this.modifierOptionModel
            .find({ _id: { $in: oIds } })
            .select({ _id: 1, name: 1 })
            .lean()
        : Promise.resolve([]),
    ]);

    const groupNameMap = new Map<string, string>();
    for (const g of groups as any[]) groupNameMap.set(String(g._id), String(g.name || ''));

    const optionNameMap = new Map<string, string>();
    for (const op of options as any[]) optionNameMap.set(String(op._id), String(op.name || ''));

    return { groupNameMap, optionNameMap };
  }

  private splitAdjustment(totalAdj: number, n: number) {
    if (!n || n <= 0) return [];
    const base = Math.trunc(totalAdj / n);
    let rem = totalAdj - base * n;
    const xs = new Array(n).fill(base);
    for (let i = 0; i < n; i++) {
      if (rem === 0) break;
      xs[i] += rem > 0 ? 1 : -1;
      rem += rem > 0 ? -1 : 1;
    }
    return xs;
  }

  private toBillOrders(ordersById: Map<string, any>, bill: any, maps: { groupNameMap: Map<string, string>; optionNameMap: Map<string, string> }) {
    const { groupNameMap, optionNameMap } = maps;
    const xs: any[] = [];

    for (const oid of bill.orderIds ?? []) {
      const o = ordersById.get(String(oid));
      if (!o) continue;

      xs.push({
        orderId: String(o._id),
        createdAt: o.createdAt ? new Date(o.createdAt).toISOString() : null,
        status: o.status,
        totalCents: Number(o.totalCents || 0),
        note: o.orderNote ?? '',
        lines: (o.items ?? []).map((it: any) => {
          const mods: any[] = [];

          for (const m of it.modifiers ?? []) {
            const gid = String(m.groupId || '');
            const groupName = groupNameMap.get(gid) || '';

            const optionIds: any[] = (m.optionIds ?? []).map((x: any) => String(x));
            const perOptAdj = this.splitAdjustment(Number(m.priceAdjustmentCents || 0), optionIds.length);

            optionIds.forEach((optId, idx) => {
              mods.push({
                groupNameSnapshot: groupName || undefined,
                optionNameSnapshot: optionNameMap.get(optId) || undefined,
                priceAdjustmentCents: Number(perOptAdj[idx] || 0),
              });
            });

            if (optionIds.length === 0 && Number(m.priceAdjustmentCents || 0) !== 0) {
              mods.push({
                groupNameSnapshot: groupName || undefined,
                optionNameSnapshot: undefined,
                priceAdjustmentCents: Number(m.priceAdjustmentCents || 0),
              });
            }
          }

          return {
            lineId: String(it._id),
            nameSnapshot: it.nameSnapshot,
            qty: Number(it.qty || 0),
            unitPriceCents: Number(it.unitPriceCentsSnapshot || 0),
            lineTotalCents: Number(it.lineTotalCents || 0),
            status: it.status,
            note: it.note ?? '',
            modifiers: mods,
          };
        }),
      });
    }

    return xs;
  }

  async requestBill(sessionId: string, note: string, actor?: Actor) {
    const sid = toObjectId(sessionId, 'sessionId');

    const s: any = await this.sessionModel.findOne({ _id: sid, restaurantId: RESTAURANT_ID }).lean();
    if (!s) throw new NotFoundException('Session not found');

    if (!['OPEN', 'BILL_REQUESTED', 'PAYMENT_PENDING'].includes(String(s.status))) {
      throw new ConflictException(`Cannot request bill (current: ${s.status})`);
    }

    const blocking: any = await this.orderModel
      .findOne({
        restaurantId: RESTAURANT_ID,
        sessionId: sid,
        status: { $in: ['pending', 'accepted', 'preparing', 'ready', 'ready_to_service'] },
      })
      .select({ _id: 1, status: 1 })
      .lean();

    if (blocking) {
      throw new ConflictException(
        `Cannot request bill: there are unfinished orders. Please wait until all orders are served.`,
      );
    }

    const existing: any = await this.billModel
      .findOne({
        restaurantId: RESTAURANT_ID,
        sessionId: sid,
        status: { $in: ['REQUESTED', 'PAYMENT_PENDING'] },
      })
      .sort({ createdAt: -1 })
      .lean();

    if (existing) {
      const patch: any = {};
      if (s.status === 'OPEN') patch.status = 'BILL_REQUESTED';
      if (!s.billRequestedAt) patch.billRequestedAt = new Date();
      if (!s.activeBillId) patch.activeBillId = existing._id;

      if (Object.keys(patch).length) {
        await this.sessionModel.updateOne({ _id: sid, restaurantId: RESTAURANT_ID }, { $set: patch });
      }

      if (actor && (!existing.customerSubjectId || !existing.customerSubjectType)) {
        await this.billModel.updateOne(
          { _id: existing._id, restaurantId: RESTAURANT_ID },
          { $set: { customerSubjectType: actor.subjectType, customerSubjectId: actor.subjectId } },
        );
      }

      return {
        ok: true,
        billId: String(existing._id),
        status: existing.status,
        totalCents: Number(existing.totalCents || 0),
      };
    }

    const { orderIds, totalCents } = await this.computeUnbilledOrders(sid);
    if (totalCents <= 0) throw new BadRequestException('No billable orders');

    const now = new Date();

    const bill: any = await this.billModel.create({
      restaurantId: RESTAURANT_ID,
      sessionId: sid,
      sessionKey: s.sessionKey,
      tableId: s.tableId,
      tableNumberSnapshot: s.tableNumberSnapshot,
      status: 'REQUESTED',
      totalCents,
      note: note ?? '',
      orderIds,
      requestedAt: now,
      customerSubjectType: actor?.subjectType,
      customerSubjectId: actor?.subjectId,
    });

    await this.sessionModel.updateOne(
      { _id: sid, restaurantId: RESTAURANT_ID },
      { $set: { status: 'BILL_REQUESTED', billRequestedAt: now, activeBillId: bill._id } },
    );

    this.ordersGateway.emitBillRequested({
      billId: String(bill._id),
      sessionId: String(s._id),
      tableId: String(s.tableId),
      tableNumber: s.tableNumberSnapshot,
      totalCents,
      note: bill.note ?? '',
    });

    this.publicGateway.emitToSession(s.sessionKey, 'bill.requested', {
      billId: String(bill._id),
      totalCents,
      status: bill.status,
    });

    return { ok: true, billId: String(bill._id), status: bill.status, totalCents };
  }

  async markCashPaid(billId: string) {
    const bid = toObjectId(billId, 'billId');

    const b0: any = await this.billModel.findOne({ _id: bid, restaurantId: RESTAURANT_ID }).lean();
    if (!b0) throw new NotFoundException('Bill not found');

    const s0: any = await this.sessionModel.findOne({ _id: b0.sessionId, restaurantId: RESTAURANT_ID }).lean();
    if (!s0) throw new NotFoundException('Session not found');
    if (String(s0.status) === 'CLOSED') throw new ConflictException('Session already closed');

    const now = new Date();

    const b: any = await this.billModel.findOneAndUpdate(
      { _id: bid, restaurantId: RESTAURANT_ID, status: { $in: ['REQUESTED', 'PAYMENT_PENDING'] } },
      { $set: { status: 'PAID', method: 'CASH', paidAt: now } },
      { new: true },
    );

    if (!b) throw new ConflictException('Bill cannot be paid (already paid or cancelled)');

    const orderIds: Types.ObjectId[] = (b.orderIds ?? [])
      .map((x: any) => {
        try {
          return new Types.ObjectId(x);
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    if (orderIds.length) {
      await this.orderModel.updateMany(
        {
          restaurantId: RESTAURANT_ID,
          sessionId: b.sessionId,
          _id: { $in: orderIds },
          $or: [{ billId: null }, { billId: { $exists: false } }],
        },
        { $set: { billId: b._id, billedAt: now } },
      );
    }

    await this.sessionModel.updateOne(
      { _id: b.sessionId, restaurantId: RESTAURANT_ID },
      { $set: { status: 'PAID', paidAt: now, activeBillId: b._id } },
    );

    this.publicGateway.emitToSession(b.sessionKey, 'bill.paid', {
      billId: String(b._id),
      status: 'PAID',
      method: 'CASH',
      totalCents: Number(b.totalCents || 0),
      paidAt: now.toISOString(),
    });

    this.ordersGateway.emitBillPaid({
      billId: String(b._id),
      sessionId: String(b.sessionId),
      tableNumber: b.tableNumberSnapshot,
      method: 'CASH',
      totalCents: Number(b.totalCents || 0),
      paidAt: now.toISOString(),
    });

    return {
      ok: true,
      billId: String(b._id),
      status: 'PAID',
      method: 'CASH',
      totalCents: Number(b.totalCents || 0),
      paidAt: now.toISOString(),
    };
  }

  async payOnline(billId: string, tableId: string, token: string) {
    if (!tableId || !token) throw new BadRequestException('Invalid table/token');

    const bid = toObjectId(billId, 'billId');

    const cur = await this.tableSessions.openOrGetActive(tableId, token);
    const curSessionId = new Types.ObjectId(cur.sessionId);

    const s0: any = await this.sessionModel.findOne({ _id: curSessionId, restaurantId: RESTAURANT_ID }).lean();
    if (!s0) throw new NotFoundException('Session not found');
    if (String(s0.status) === 'CLOSED') throw new ConflictException('Session already closed');

    const now = new Date();

    const b: any = await this.billModel.findOneAndUpdate(
      {
        _id: bid,
        restaurantId: RESTAURANT_ID,
        sessionId: curSessionId,
        status: { $in: ['REQUESTED', 'PAYMENT_PENDING'] },
      },
      { $set: { status: 'PAID', method: 'ONLINE', paidAt: now } },
      { new: true },
    );

    if (!b) throw new ConflictException('Bill cannot be paid (already paid or cancelled)');

    const orderIds: Types.ObjectId[] = (b.orderIds ?? [])
      .map((x: any) => {
        try {
          return new Types.ObjectId(x);
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    if (orderIds.length) {
      await this.orderModel.updateMany(
        {
          restaurantId: RESTAURANT_ID,
          sessionId: b.sessionId,
          _id: { $in: orderIds },
          $or: [{ billId: null }, { billId: { $exists: false } }],
        },
        { $set: { billId: b._id, billedAt: now } },
      );
    }

    await this.sessionModel.updateOne(
      { _id: b.sessionId, restaurantId: RESTAURANT_ID },
      { $set: { status: 'PAID', paidAt: now, activeBillId: b._id } },
    );

    this.publicGateway.emitToSession(b.sessionKey, 'bill.paid', {
      billId: String(b._id),
      status: 'PAID',
      method: 'ONLINE',
      paidAt: now.toISOString(),
      totalCents: Number(b.totalCents || 0),
    });

    this.ordersGateway.emitBillPaid({
      billId: String(b._id),
      sessionId: String(b.sessionId),
      tableNumber: b.tableNumberSnapshot,
      method: 'ONLINE',
      totalCents: Number(b.totalCents || 0),
      paidAt: now.toISOString(),
    });

    return {
      ok: true,
      billId: String(b._id),
      status: 'PAID',
      method: 'ONLINE',
      totalCents: Number(b.totalCents || 0),
      paidAt: now.toISOString(),
    };
  }

  async getActiveBillForTable(tableId: string, token: string) {
    if (!tableId || !token) throw new BadRequestException('Invalid table/token');

    const s = await this.tableSessions.openOrGetActive(tableId, token);
    const sessionId = new Types.ObjectId(s.sessionId);

    const bill: any = await this.billModel
      .findOne({
        restaurantId: RESTAURANT_ID,
        sessionId,
        status: { $in: ['REQUESTED', 'PAYMENT_PENDING', 'PAID'] },
      })
      .sort({ createdAt: -1 })
      .lean();

    if (!bill) throw new NotFoundException('Bill not found');

    const billOrderIds: Types.ObjectId[] = (bill.orderIds ?? [])
      .map((x: any) => {
        try {
          return new Types.ObjectId(x);
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    const orders: any[] = billOrderIds.length
      ? await this.orderModel
          .find({
            restaurantId: RESTAURANT_ID,
            _id: { $in: billOrderIds },
            sessionId,
            status: { $nin: ['draft', 'cancelled'] },
          })
          .sort({ createdAt: -1 })
          .lean()
      : [];

    const servedLines: Array<{
      orderId: string;
      lineId: string;
      nameSnapshot: string;
      qty: number;
      lineTotalCents: number;
    }> = [];

    for (const o of orders) {
      for (const it of o.items ?? []) {
        if (String(it.status || '').toLowerCase() !== 'served') continue;
        servedLines.push({
          orderId: String(o._id),
          lineId: String(it._id),
          nameSnapshot: it.nameSnapshot,
          qty: Number(it.qty || 0),
          lineTotalCents: Number(it.lineTotalCents || 0),
        });
      }
    }

    return {
      ok: true,
      sessionId: String(s.sessionId),
      sessionKey: s.sessionKey,
      tableNumber: s.tableNumber,
      bill: {
        billId: String(bill._id),
        status: bill.status,
        totalCents: Number(bill.totalCents || 0),
        note: bill.note ?? '',
        method: bill.method,
        requestedAt: bill.requestedAt ? new Date(bill.requestedAt).toISOString() : undefined,
        paidAt: bill.paidAt ? new Date(bill.paidAt).toISOString() : undefined,
        createdAt: bill.createdAt ? new Date(bill.createdAt).toISOString() : undefined,
      },
      servedLines,
    };
  }

  async listStaffBills(args: {
    tab?: BillTab;
    page?: number;
    limit?: number;

    datePreset?: 'today' | 'yesterday' | 'this_week' | 'this_month';
    from?: string;
    to?: string;
  }) {
    const { page, limit, skip } = this.parsePaging(args);

    const tab = String(args.tab || 'REQUESTED').toUpperCase() as BillTab;
    const match: any = { restaurantId: RESTAURANT_ID };

    if (tab === 'REQUESTED') match.status = { $in: ['REQUESTED', 'PAYMENT_PENDING'] };
    else if (tab === 'PAID') match.status = 'PAID';
    else if (tab === 'DONE') match.status = 'CANCELLED';
    else throw new BadRequestException('Invalid tab');

    const createdAtRange = tab === 'DONE' ? this.parseDateRange(args) : null;
    if (createdAtRange) match.createdAt = createdAtRange;

    const [total, bills] = await Promise.all([
      this.billModel.countDocuments(match),
      this.billModel.find(match).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    ]);

    const sessionIds = bills
      .map((b: any) => b.sessionId)
      .filter(Boolean)
      .map((id: any) => String(id));

    const sessions = sessionIds.length
      ? await this.sessionModel
          .find({
            restaurantId: RESTAURANT_ID,
            _id: { $in: sessionIds.map((x) => new Types.ObjectId(x)) },
          })
          .lean()
      : [];

    const sMap = new Map(sessions.map((s: any) => [String(s._id), s]));

    const allOrderIds: Types.ObjectId[] = [];
    for (const b of bills as any[]) {
      for (const oid of b.orderIds ?? []) {
        try {
          allOrderIds.push(new Types.ObjectId(oid));
        } catch {}
      }
    }

    const orders = allOrderIds.length
      ? await this.orderModel
          .find({
            restaurantId: RESTAURANT_ID,
            _id: { $in: allOrderIds },
          })
          .sort({ createdAt: 1 })
          .lean()
      : [];

    const orderMap = new Map<string, any>();
    for (const o of orders) orderMap.set(String(o._id), o);

    const maps = await this.buildModifierNameMaps(orders);

    return {
      ok: true,
      total,
      page,
      limit,
      bills: (bills as any[]).map((b: any) => {
        const s = sMap.get(String(b.sessionId));
        return {
          billId: String(b._id),

          status: b.status,
          tab,

          method: b.method || null,
          totalCents: Number(b.totalCents || 0),
          note: b.note ?? '',

          tableId: b.tableId ? String(b.tableId) : undefined,
          tableNumber: b.tableNumberSnapshot,
          sessionId: String(b.sessionId),
          sessionStatus: s?.status || null,

          requestedAt: b.requestedAt || b.createdAt,
          paidAt: b.paidAt || null,
          cancelledAt: b.cancelledAt || null,
          createdAt: b.createdAt,
          updatedAt: b.updatedAt,
          orderIds: (b.orderIds ?? []).map((x: any) => String(x)),
          orders: this.toBillOrders(orderMap, b, maps),
        };
      }),
    };
  }

  async acceptPaidBill(billId: string) {
    const bid = toObjectId(billId, 'billId');

    const b0: any = await this.billModel.findOne({ _id: bid, restaurantId: RESTAURANT_ID }).lean();
    if (!b0) throw new NotFoundException('Bill not found');

    if (String(b0.status).toUpperCase() !== 'PAID') {
      throw new ConflictException(`Bill must be PAID to accept (current: ${b0.status})`);
    }

    const s0: any = await this.sessionModel.findOne({ _id: b0.sessionId, restaurantId: RESTAURANT_ID }).lean();
    if (!s0) throw new NotFoundException('Session not found');

    if (!['OPEN', 'BILL_REQUESTED', 'PAYMENT_PENDING', 'PAID'].includes(String(s0.status).toUpperCase())) {
      throw new ConflictException(`Session cannot be closed (current: ${s0.status})`);
    }

    // close session
    const closed = await this.staffSessions.closeSession(String(s0._id));
    await this.tableModel.updateOne(
      { _id: b0.tableId, status: { $ne: 'inactive' } },
      { $set: { status: 'active' } },
    );

    const now = new Date();
    await this.billModel.updateOne(
      { _id: bid, restaurantId: RESTAURANT_ID, status: 'PAID' },
      { $set: { status: 'CANCELLED', cancelledAt: now } },
    );

    this.ordersGateway.emitBillAccepted({
      billId: String(b0._id),
      sessionId: String(b0.sessionId),
      tableNumber: b0.tableNumberSnapshot,
      totalCents: Number(b0.totalCents || 0),
      method: b0.method || null,
      paidAt: b0.paidAt?.toISOString?.(),
    });

    return {
      ok: true,
      billId: String(b0._id),
      status: 'CANCELLED',
      totalCents: Number(b0.totalCents || 0),
      method: b0.method || null,
      paidAt: b0.paidAt?.toISOString?.(),
      cancelledAt: now.toISOString(),
      session: closed,
    };
  }

  async payCash(billId: string, tableId: string, token: string) {
    if (!tableId || !token) throw new BadRequestException('Invalid table/token');

    let bid: Types.ObjectId;
    try {
      bid = new Types.ObjectId(billId);
    } catch {
      throw new BadRequestException('Invalid billId');
    }

    const cur = await this.tableSessions.openOrGetActive(tableId, token);
    const curSessionId = new Types.ObjectId(cur.sessionId);

    const s0: any = await this.sessionModel
      .findOne({ _id: curSessionId, restaurantId: RESTAURANT_ID })
      .lean();

    if (!s0) throw new NotFoundException('Session not found');
    if (String(s0.status).toUpperCase() === 'CLOSED') {
      throw new ConflictException('Session already closed');
    }

    const now = new Date();

    const b: any = await this.billModel.findOneAndUpdate(
      {
        _id: bid,
        restaurantId: RESTAURANT_ID,
        sessionId: curSessionId,
        status: { $in: ['REQUESTED', 'PAYMENT_PENDING'] }, 
      },
      {
        $set: {
          status: 'PAID',
          method: 'CASH',
          paidAt: now,
        },
      },
      { new: true },
    );

    if (!b) {
      throw new ConflictException('Bill cannot be paid (already paid or not found)');
    }

    const totalCents = Number(b.totalCents || 0);

    const orderIds: Types.ObjectId[] = (b.orderIds ?? [])
      .map((x: any) => {
        try {
          return new Types.ObjectId(x);
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    if (orderIds.length) {
      await this.orderModel.updateMany(
        {
          restaurantId: RESTAURANT_ID,
          sessionId: b.sessionId,
          _id: { $in: orderIds },
          $or: [{ billId: null }, { billId: { $exists: false } }],
        },
        { $set: { billId: b._id, billedAt: now } },
      );
    }

    await this.sessionModel.updateOne(
      { _id: b.sessionId, restaurantId: RESTAURANT_ID },
      { $set: { status: 'PAID', paidAt: now, activeBillId: b._id } },
    );

    this.publicGateway.emitToSession(b.sessionKey, 'bill.paid', {
      billId: String(b._id),
      status: 'PAID',
      method: 'CASH',
      totalCents,
      paidAt: now.toISOString(),
    });

    this.ordersGateway.emitBillPaid({
      billId: String(b._id),
      sessionId: String(b.sessionId),
      tableNumber: b.tableNumberSnapshot,
      method: 'CASH',
      totalCents,
      paidAt: now.toISOString(),
    });

    return {
      ok: true,
      billId: String(b._id),
      status: 'PAID',
      method: 'CASH',
      totalCents,
      paidAt: now.toISOString(),
      sessionId: String(b.sessionId),
    };
  }

  async payOnlineByBillId(billId: string) {
    let bid: Types.ObjectId;
    try {
      bid = new Types.ObjectId(billId);
    } catch {
      throw new BadRequestException('Invalid billId');
    }

    const now = new Date();

    const b0: any = await this.billModel.findOne({ _id: bid, restaurantId: RESTAURANT_ID }).lean();
    if (!b0) throw new NotFoundException('Bill not found');

    const s0: any = await this.sessionModel.findOne({ _id: b0.sessionId, restaurantId: RESTAURANT_ID }).lean();
    if (!s0) throw new NotFoundException('Session not found');
    if (String(s0.status).toUpperCase() === 'CLOSED') throw new ConflictException('Session already closed');

    const b: any = await this.billModel.findOneAndUpdate(
      {
        _id: bid,
        restaurantId: RESTAURANT_ID,
        status: { $in: ['REQUESTED', 'PAYMENT_PENDING'] },
      },
      { $set: { status: 'PAID', method: 'ONLINE', paidAt: now } },
      { new: true },
    );

    if (!b) throw new ConflictException('Bill cannot be paid (already paid or cancelled)');

    const orderIds: Types.ObjectId[] = (b.orderIds ?? [])
      .map((x: any) => {
        try {
          return new Types.ObjectId(x);
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    if (orderIds.length) {
      await this.orderModel.updateMany(
        {
          restaurantId: RESTAURANT_ID,
          sessionId: b.sessionId,
          _id: { $in: orderIds },
          $or: [{ billId: null }, { billId: { $exists: false } }],
        },
        { $set: { billId: b._id, billedAt: now } },
      );
    }

    await this.sessionModel.updateOne(
      { _id: b.sessionId, restaurantId: RESTAURANT_ID },
      { $set: { status: 'PAID', paidAt: now, activeBillId: b._id } },
    );

    this.publicGateway.emitToSession(b.sessionKey, 'bill.paid', {
      billId: String(b._id),
      status: 'PAID',
      method: 'ONLINE',
      paidAt: now.toISOString(),
      totalCents: b.totalCents,
    });

    this.ordersGateway.emitBillPaid({
      billId: String(b._id),
      sessionId: String(b.sessionId),
      tableNumber: b.tableNumberSnapshot,
      method: 'ONLINE',
      totalCents: b.totalCents,
      paidAt: now.toISOString(),
    });

    return {
      ok: true,
      billId: String(b._id),
      status: 'PAID',
      method: 'ONLINE',
      totalCents: b.totalCents,
      paidAt: now.toISOString(),
    };
  }

  async listMyBills(
    actor: { subjectType: 'USER' | 'ACCOUNT'; subjectId: string } | null | undefined,
    args?: {
      page?: number;
      limit?: number;
      datePreset?: 'today' | 'yesterday' | 'this_week' | 'this_month';
      from?: string;
      to?: string;
    },
  ) {
    if (!actor?.subjectType || !actor?.subjectId) {
      throw new BadRequestException('Missing actor');
    }

    const { page, limit, skip } = this.parsePaging(args);
    const createdAtRange = this.parseDateRange(args);

    const match: any = {
      restaurantId: RESTAURANT_ID,
      customerSubjectType: actor.subjectType,
      customerSubjectId: String(actor.subjectId),
    };

    if (createdAtRange) match.createdAt = createdAtRange;

    const [total, bills] = await Promise.all([
      this.billModel.countDocuments(match),
      this.billModel.find(match).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    ]);

    const allOrderIds: Types.ObjectId[] = [];
    for (const b of bills as any[]) {
      for (const oid of b.orderIds ?? []) {
        try {
          allOrderIds.push(new Types.ObjectId(oid));
        } catch {}
      }
    }

    const orders = allOrderIds.length
      ? await this.orderModel
          .find({
            restaurantId: RESTAURANT_ID,
            _id: { $in: allOrderIds },
            status: { $nin: ['draft', 'cancelled'] },
          })
          .sort({ createdAt: 1 })
          .lean()
      : [];

    const orderMap = new Map<string, any>();
    for (const o of orders) orderMap.set(String(o._id), o);

    const maps = await this.buildModifierNameMaps(orders);

    return {
      ok: true,
      total,
      page,
      limit,
      bills: (bills as any[]).map((b: any) => ({
        billId: String(b._id),
        status: b.status,
        method: b.method ?? null,
        totalCents: Number(b.totalCents || 0),
        tableNumber: b.tableNumberSnapshot,
        sessionId: String(b.sessionId),
        note: b.note ?? '',

        requestedAt: b.requestedAt ? new Date(b.requestedAt).toISOString() : null,
        paidAt: b.paidAt ? new Date(b.paidAt).toISOString() : null,
        createdAt: b.createdAt ? new Date(b.createdAt).toISOString() : null,

        orderIds: (b.orderIds ?? []).map((x: any) => String(x)),
        orders: this.toBillOrders(orderMap, b, maps),
      })),
    };
  }
}

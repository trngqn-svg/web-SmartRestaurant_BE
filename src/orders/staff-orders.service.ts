import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Order, OrderDocument, OrderStatus } from './order.schema';
import { RESTAURANT_ID } from '../config/restaurant.config';
import { OrdersGateway } from './orders.gateway';
import { PublicOrdersGateway } from './public-orders.gateway';
import { ModifierGroup, ModifierGroupDocument } from '../menu/modifiers/modifier-group.schema';
import { ModifierOption, ModifierOptionDocument } from '../menu/modifiers/modifier-option.schema';
import { MenuItem, MenuItemDocument } from '../menu/items/item.schema';
import { TableSession, TableSessionDocument, TableSessionStatus } from '../table-sessions/table-session.schema';

type LineStatus = 'queued' | 'preparing' | 'ready' | 'served' | 'cancelled';

function computeOrderStatus(items: Array<{ status?: LineStatus }>): OrderStatus {
  const xs = (items ?? []).map((x) => (x.status as LineStatus) || 'queued');
  const active = xs.filter((s) => s !== 'cancelled');

  if (active.length === 0) return 'cancelled';
  if (active.every((s) => s === 'served')) return 'served';
  if (active.every((s) => s === 'ready' || s === 'served')) return 'ready';
  if (active.some((s) => s === 'preparing')) return 'preparing';
  const anyStarted = active.some((s) => s === "preparing" || s === "ready");
  if (anyStarted) return "preparing";
  return 'accepted';
}

@Injectable()
export class StaffOrdersService {
  constructor(
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
    @InjectModel(MenuItem.name) private readonly itemModel: Model<MenuItemDocument>,
    @InjectModel(ModifierGroup.name) private readonly modifierGroupModel: Model<ModifierGroupDocument>,
    @InjectModel(ModifierOption.name) private readonly modifierOptionModel: Model<ModifierOptionDocument>,
    @InjectModel(TableSession.name) private readonly sessionModel: Model<TableSessionDocument>,
    private readonly ordersGateway: OrdersGateway,
    private readonly publicGateway: PublicOrdersGateway,
  ) {}

  async list(args: {
  status?: string; // pending|accepted|...
  q?: string;      // search table/item/note
  datePreset?: 'today' | 'yesterday' | 'this_week' | 'this_month';
  from?: string;   // ISO date string
  to?: string;     // ISO date string
  page?: number;
  limit?: number;
}) {
  const {
    status,
    q,
    datePreset,
    from,
    to,
  } = args ?? {};

  // paging
  const rawPage = Number(args?.page ?? 1);
  const rawLimit = Number(args?.limit ?? 20);

  const page = Number.isFinite(rawPage) ? Math.floor(rawPage) : 1;
  const limit = Number.isFinite(rawLimit) ? Math.floor(rawLimit) : 20;

  if (page <= 0) throw new BadRequestException('Invalid page');
  if (limit <= 0 || limit > 100) throw new BadRequestException('Invalid limit (1..100)');

  const match: any = { restaurantId: RESTAURANT_ID };

  // status filter (all nếu không truyền)
  if (status && status !== 'all') {
    match.status = status;
  }

  // date filter: ưu tiên from/to, nếu không có thì dùng preset
  const now = new Date();
  const startOfDay = (d: Date) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  };
  const endOfDay = (d: Date) => {
    const x = new Date(d);
    x.setHours(23, 59, 59, 999);
    return x;
  };
  const startOfWeekMon = (d: Date) => {
    const x = startOfDay(d);
    const day = x.getDay(); // 0 Sun..6 Sat
    const diff = (day === 0 ? -6 : 1) - day; // Monday start
    x.setDate(x.getDate() + diff);
    return x;
  };
  const startOfMonth = (d: Date) => {
    const x = startOfDay(d);
    x.setDate(1);
    return x;
  };

  let dateFrom: Date | null = null;
  let dateTo: Date | null = null;

  if (from) {
    const d = new Date(from);
    if (Number.isNaN(d.getTime())) throw new BadRequestException('Invalid from');
    dateFrom = d;
  }
  if (to) {
    const d = new Date(to);
    if (Number.isNaN(d.getTime())) throw new BadRequestException('Invalid to');
    dateTo = d;
  }

  if (!dateFrom && !dateTo && datePreset) {
    if (datePreset === 'today') {
      dateFrom = startOfDay(now);
      dateTo = endOfDay(now);
    } else if (datePreset === 'yesterday') {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      dateFrom = startOfDay(y);
      dateTo = endOfDay(y);
    } else if (datePreset === 'this_week') {
      dateFrom = startOfWeekMon(now);
      dateTo = endOfDay(now);
    } else if (datePreset === 'this_month') {
      dateFrom = startOfMonth(now);
      dateTo = endOfDay(now);
    }
  }

  // lọc theo submittedAt (khuyến nghị). Nếu bạn muốn fallback createdAt thì thêm OR.
  if (dateFrom || dateTo) {
    match.submittedAt = {};
    if (dateFrom) match.submittedAt.$gte = dateFrom;
    if (dateTo) match.submittedAt.$lte = dateTo;
  }

  // search q: table number / note / item nameSnapshot
  const keyword = (q ?? '').trim();
  if (keyword) {
    const rx = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    match.$or = [
      { tableNumberSnapshot: rx },
      { orderNote: rx },
      { 'items.nameSnapshot': rx },
    ];
  }

  const skip = (page - 1) * limit;

  // ✅ query paging trước (không load hết)
  const [total, orders] = await Promise.all([
    this.orderModel.countDocuments(match),
    this.orderModel.find(match).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
  ]);

  // 1) collect sessionIds from paged orders
  const sessionIdsSet = new Set<string>();
  for (const o of orders as any[]) {
    if (o.sessionId) sessionIdsSet.add(String(o.sessionId));
  }
  const sessionIds = [...sessionIdsSet].map((id) => new Types.ObjectId(id));

  const sessions = sessionIds.length
    ? await this.sessionModel.find({ _id: { $in: sessionIds }, restaurantId: RESTAURANT_ID }).lean()
    : [];

  const sessionById = new Map<string, any>();
  for (const s of sessions as any[]) sessionById.set(String(s._id), s);

  // 2) collect modifier ids + item ids (trên page này thôi)
  const groupIdsSet = new Set<string>();
  const optionIdsSet = new Set<string>();
  const itemIdsSet = new Set<string>();

  for (const o of orders as any[]) {
    for (const it of o.items ?? []) {
      if (it.itemId) itemIdsSet.add(String(it.itemId));
      for (const m of it.modifiers ?? []) {
        if (m.groupId) groupIdsSet.add(String(m.groupId));
        for (const oid of m.optionIds ?? []) optionIdsSet.add(String(oid));
      }
    }
  }

  // 3) load prepTime for items
  const itemIds = [...itemIdsSet].map((id) => new Types.ObjectId(id));
  const items = itemIds.length
    ? await this.itemModel
        .find({ _id: { $in: itemIds }, restaurantId: RESTAURANT_ID, isDeleted: false })
        .select({ prepTimeMinutes: 1 })
        .lean()
    : [];

  const itemPrepMap = new Map(items.map((x: any) => [String(x._id), x.prepTimeMinutes ?? 0]));

  // 4) load modifier group/option names
  const groupIds = [...groupIdsSet].map((id) => new Types.ObjectId(id));
  const optionIds = [...optionIdsSet].map((id) => new Types.ObjectId(id));

  const groups = groupIds.length
    ? await this.modifierGroupModel
        .find({ _id: { $in: groupIds }, restaurantId: RESTAURANT_ID })
        .select({ name: 1 })
        .lean()
    : [];

  const options = optionIds.length
    ? await this.modifierOptionModel
        .find({ _id: { $in: optionIds }, status: 'active' })
        .select({ name: 1 })
        .lean()
    : [];

  const groupNameMap = new Map(groups.map((g: any) => [String(g._id), g.name]));
  const optionNameMap = new Map(options.map((op: any) => [String(op._id), op.name]));

  const mapped = (orders as any[]).map((o: any) => {
    const ses = o.sessionId ? sessionById.get(String(o.sessionId)) : null;

    return {
      orderId: String(o._id),
      tableId: String(o.tableId),
      tableNumber: o.tableNumberSnapshot,

      sessionId: ses ? String(ses._id) : null,
      sessionStatus: ses?.status ?? null,
      billId: ses?.activeBillId ? String(ses.activeBillId) : null,

      status: o.status,
      totalCents: o.totalCents,
      submittedAt: o.submittedAt,
      orderNote: o.orderNote ?? '',

      items: (o.items ?? []).map((it: any) => ({
        lineId: String(it._id),
        itemId: String(it.itemId),
        nameSnapshot: it.nameSnapshot,
        qty: it.qty,
        prepTimeMinutes: itemPrepMap.get(String(it.itemId)) ?? 0,
        note: it.note ?? '',
        lineTotalCents: it.lineTotalCents,
        status: (it.status as LineStatus) ?? 'queued',

        modifiers: (it.modifiers ?? []).map((m: any) => ({
          groupId: String(m.groupId),
          groupName: groupNameMap.get(String(m.groupId)) ?? '',
          options: (m.optionIds ?? []).map((oid: any) => ({
            optionId: String(oid),
            optionName: optionNameMap.get(String(oid)) ?? '',
          })),
          priceAdjustmentCents: m.priceAdjustmentCents ?? 0,
        })),
      })),
    };
  });

  return {
    ok: true,
    total,
    page,
    limit,
    orders: mapped,
  };
}


  async accept(orderId: string) {
    const order: any = await this.orderModel.findOne({
      _id: orderId,
      restaurantId: RESTAURANT_ID,
    });
    if (!order) throw new NotFoundException("Order not found");

    if (order.status !== "pending") {
      throw new ConflictException(`Order is not pending (current: ${order.status})`);
    }

    (order.items ?? []).forEach((it: any) => {
      if (!it.status) it.status = "queued";
    });

    order.status = "accepted";
    await order.save();

    const itemIdsSet = new Set<string>();
    for (const it of order.items ?? []) {
      if (it.itemId) itemIdsSet.add(String(it.itemId));
    }
    const itemIds = [...itemIdsSet].map((id) => new Types.ObjectId(id));

    const items = itemIds.length
      ? await this.itemModel
          .find({ _id: { $in: itemIds }, restaurantId: RESTAURANT_ID, isDeleted: false })
          .select({ prepTimeMinutes: 1 })
          .lean()
      : [];

    const itemPrepMap = new Map(items.map((x: any) => [String(x._id), x.prepTimeMinutes ?? 0]));

    const groupIdsSet = new Set<string>();
    const optionIdsSet = new Set<string>();

    for (const it of order.items ?? []) {
      for (const m of it.modifiers ?? []) {
        if (m.groupId) groupIdsSet.add(String(m.groupId));
        for (const oid of m.optionIds ?? []) optionIdsSet.add(String(oid));
      }
    }

    const groupIds = [...groupIdsSet].map((id) => new Types.ObjectId(id));
    const optionIds = [...optionIdsSet].map((id) => new Types.ObjectId(id));

    const groups = groupIds.length
      ? await this.modifierGroupModel
          .find({ _id: { $in: groupIds }, restaurantId: RESTAURANT_ID })
          .select({ name: 1 })
          .lean()
      : [];

    const options = optionIds.length
      ? await this.modifierOptionModel
          .find({ _id: { $in: optionIds }, status: "active" })
          .select({ name: 1 })
          .lean()
      : [];

    const groupNameMap = new Map(groups.map((g: any) => [String(g._id), g.name]));
    const optionNameMap = new Map(options.map((op: any) => [String(op._id), op.name]));

    const acceptedPayload = {
      orderId: String(order._id),
      tableId: String(order.tableId),
      tableNumber: order.tableNumberSnapshot,
      status: order.status,
      totalCents: order.totalCents,
      submittedAt: order.submittedAt,
      orderNote: order.orderNote ?? "",
      items: (order.items ?? []).map((it: any) => ({
        lineId: String(it._id),
        itemId: String(it.itemId),
        nameSnapshot: it.nameSnapshot,
        qty: it.qty,
        prepTimeMinutes: itemPrepMap.get(String(it.itemId)) ?? 0,
        note: it.note ?? "",
        lineTotalCents: it.lineTotalCents,
        status: (it.status as LineStatus) ?? "queued",
        modifiers: (it.modifiers ?? []).map((m: any) => ({
          groupId: String(m.groupId),
          groupName: groupNameMap.get(String(m.groupId)) ?? "",
          options: (m.optionIds ?? []).map((oid: any) => ({
            optionId: String(oid),
            optionName: optionNameMap.get(String(oid)) ?? "",
          })),
          priceAdjustmentCents: m.priceAdjustmentCents ?? 0,
        })),
      })),
    };

    this.ordersGateway.emitOrderStatusChanged({
      orderId: acceptedPayload.orderId,
      status: acceptedPayload.status,
    });
    this.ordersGateway.emitOrderAccepted?.(acceptedPayload);

    if (order.sessionKey) {
      this.publicGateway.emitOrderStatusChanged(order.sessionKey, {
        orderId: acceptedPayload.orderId,
        status: acceptedPayload.status,
      });
    }

    return { ok: true, orderId: String(order._id), status: order.status };
  }

  async reject(orderId: string) {
    const order: any = await this.orderModel.findOne({
      _id: orderId,
      restaurantId: RESTAURANT_ID,
    });
    if (!order) throw new NotFoundException('Order not found');

    if (order.status !== 'pending') {
      throw new ConflictException(`Order is not pending (current: ${order.status})`);
    }

    order.status = 'cancelled';
    const now = new Date();
    (order.items ?? []).forEach((it: any) => {
      it.status = 'cancelled';
      it.cancelledAt = now;
    });

    await order.save();

    const payload = { orderId: String(order._id), status: order.status };

    this.ordersGateway.emitOrderStatusChanged(payload);

    if (order.sessionKey) {
      this.publicGateway.emitOrderStatusChanged(order.sessionKey, payload);

      for (const line of order.items ?? []) {
      this.publicGateway.emitOrderLineStatusChanged(order.sessionKey, {
        orderId: String(order._id),
        lineId: String(line._id),
        status: line.status,
      });
    }
    }

    return { ok: true, orderId: String(order._id), status: order.status };
  }

  async startOrder(orderId: string) {
    const o: any = await this.orderModel.findOne({
      _id: orderId,
      restaurantId: RESTAURANT_ID,
    });
    if (!o) throw new NotFoundException("Order not found");

    if (o.status !== "accepted") {
      throw new BadRequestException(`Order is not accepted (current: ${o.status})`);
    }

    o.status = "preparing";
    await o.save();

    this.ordersGateway.emitOrderStatusChanged({ orderId: String(o._id), status: o.status });

    if (o.sessionKey) {
      this.publicGateway.emitOrderStatusChanged(o.sessionKey, {
        orderId: String(o._id),
        status: o.status,
      });
    }

    return { ok: true, orderId: String(o._id), status: o.status };
  }

  async startLine(orderId: string, lineId: string) {
    const o: any = await this.orderModel.findOne({
      _id: orderId,
      restaurantId: RESTAURANT_ID,
    });
    if (!o) throw new NotFoundException('Order not found');

    if (['draft', 'pending', 'cancelled', 'served'].includes(o.status)) {
      throw new BadRequestException(`Order cannot be started (current: ${o.status})`);
    }

    const line = (o.items ?? []).find((x: any) => String(x._id) === String(lineId));
    if (!line) throw new NotFoundException('Line not found');

    line.status = (line.status as LineStatus) ?? 'queued';
    if (line.status !== 'queued') throw new BadRequestException('Item is not queued');

    line.status = 'preparing';
    line.startedAt = new Date();

    const nextOrderStatus = computeOrderStatus(o.items ?? []);
    if (o.status !== nextOrderStatus) o.status = nextOrderStatus;

    await o.save();

    if (o.sessionKey) {
      this.publicGateway.emitOrderStatusChanged(o.sessionKey, {
        orderId: String(o._id),
        status: o.status,
      });
      this.publicGateway.emitOrderLineStatusChanged(o.sessionKey, {
        orderId: String(o._id),
        lineId: String(line._id),
        status: line.status,
        orderStatus: o.status,
      });
    }

    return {
      ok: true,
      orderId: String(o._id),
      lineId: String(line._id),
      status: line.status,
      orderStatus: o.status,
    };
  }

  async readyLine(orderId: string, lineId: string) {
    const o: any = await this.orderModel.findOne({
      _id: orderId,
      restaurantId: RESTAURANT_ID,
    });
    if (!o) throw new NotFoundException('Order not found');

    if (['draft', 'pending', 'cancelled', 'served'].includes(o.status)) {
      throw new BadRequestException(`Order cannot be marked ready (current: ${o.status})`);
    }

    const line = (o.items ?? []).find((x: any) => String(x._id) === String(lineId));
    if (!line) throw new NotFoundException('Line not found');

    line.status = (line.status as LineStatus) ?? 'queued';
    if (line.status !== 'preparing') throw new BadRequestException('Item is not preparing');

    line.status = 'ready';
    line.readyAt = new Date();

    const nextOrderStatus = computeOrderStatus(o.items ?? []);
    if (o.status !== nextOrderStatus) o.status = nextOrderStatus;

    await o.save();

    this.ordersGateway.emitOrderStatusChanged({ orderId: String(o._id), status: o.status });
    this.ordersGateway.emitOrderLineStatusChanged({
      orderId: String(o._id),
      lineId: String(line._id),
      status: line.status,
      orderStatus: o.status,
    });

    if (o.sessionKey) {
      this.publicGateway.emitOrderStatusChanged(o.sessionKey, {
        orderId: String(o._id),
        status: o.status,
      });
      this.publicGateway.emitOrderLineStatusChanged(o.sessionKey, {
        orderId: String(o._id),
        lineId: String(line._id),
        status: line.status,
        orderStatus: o.status,
      });
    }

    return {
      ok: true,
      orderId: String(o._id),
      lineId: String(line._id),
      status: line.status,
      orderStatus: o.status,
    };
  }

  async sendToWaiter(orderId: string) {
    const o: any = await this.orderModel.findOne({ _id: orderId, restaurantId: RESTAURANT_ID });
    if (!o) throw new NotFoundException("Order not found");

    if (o.status !== "ready") {
      throw new BadRequestException(`Order is not ready (current: ${o.status})`);
    }

    o.status = "ready_to_service";
    await o.save();

    this.ordersGateway.emitOrderStatusChanged({ orderId: String(o._id), status: o.status });

    return { ok: true, orderId: String(o._id), status: o.status };
  }

  async markServed(orderId: string) {
    const o: any = await this.orderModel.findOne({ _id: orderId, restaurantId: RESTAURANT_ID });
    if (!o) throw new NotFoundException("Order not found");

    if (o.status !== "ready_to_service") {
      throw new BadRequestException(`Order is not ready (current: ${o.status})`);
    }

    const now = new Date();

    // ✅ collect increments BEFORE changing? (được) - dựa trên items không cancelled
    const incByItemId = new Map<string, number>();

    (o.items ?? []).forEach((it: any) => {
      if (it.status !== "cancelled") {
        it.status = "served";
        it.servedAt = now;

        const key = String(it.itemId);
        const qty = Number(it.qty ?? 1);
        incByItemId.set(key, (incByItemId.get(key) ?? 0) + qty);
      }
    });

    o.status = "served";
    o.servedAt = now;
    await o.save();

    // ✅ update popularityCount for menu items
    if (incByItemId.size > 0) {
      const ops = [...incByItemId.entries()].map(([itemId, inc]) => ({
        updateOne: {
          filter: {
            _id: new Types.ObjectId(itemId),
            restaurantId: RESTAURANT_ID,
            isDeleted: false,
          },
          update: { $inc: { popularityCount: inc } },
        },
      }));

      await this.itemModel.bulkWrite(ops, { ordered: false });
    }

    const payload = { orderId: String(o._id), status: o.status };

    this.ordersGateway.emitOrderStatusChanged(payload);

    if (o.sessionKey) {
      this.publicGateway.emitToSession(o.sessionKey, "order.status_changed", payload);
      this.publicGateway.emitToSession(o.sessionKey, "order.updated", {
        orderId: payload.orderId,
        servedAt: o.servedAt.toISOString(),
      });
    }

    return { ok: true, ...payload };
  }

}

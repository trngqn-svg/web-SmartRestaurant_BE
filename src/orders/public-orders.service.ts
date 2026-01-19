import {
  Injectable,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { Model, Types } from 'mongoose';
import * as crypto from 'crypto';

import { RESTAURANT_ID } from '../config/restaurant.config';
import { Table, TableDocument } from '../tables/table.schema';
import { Order, OrderDocument } from './order.schema';
import { MenuItem, MenuItemDocument } from '../menu/items/item.schema';
import { ModifierOption, ModifierOptionDocument } from '../menu/modifiers/modifier-option.schema';
import { OrdersGateway } from './orders.gateway';
import { TableSessionsService } from '../table-sessions/table-sessions.service';

type QrPayload = { tableId: string; v: number; restaurantId?: string };

@Injectable()
export class PublicOrdersService {
  constructor(
    private readonly jwt: JwtService,
    @InjectModel(Table.name) private readonly tableModel: Model<TableDocument>,
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
    @InjectModel(MenuItem.name) private readonly itemModel: Model<MenuItemDocument>,
    @InjectModel(ModifierOption.name) private readonly optModel: Model<ModifierOptionDocument>,
    private readonly ordersGateway: OrdersGateway,
    private readonly tableSessions: TableSessionsService,
  ) {}

  private verifyQr(token: string): QrPayload {
    try {
      const p = this.jwt.verify(token, { secret: process.env.JWT_SECRET }) as any;
      if (!p?.tableId || typeof p?.v !== 'number') throw new Error();
      if (p.restaurantId && p.restaurantId !== RESTAURANT_ID) throw new Error();
      return p;
    } catch {
      throw new UnauthorizedException('QR không hợp lệ hoặc đã hết hạn');
    }
  }

  async openSession(tableId: string, token: string) {
  const { sessionId, sessionKey, tableNumber } =
    await this.tableSessions.openOrGetActive(tableId, token);

  const restaurantId = RESTAURANT_ID;

  const existing = await this.orderModel.findOne({
    restaurantId,
    tableId: new Types.ObjectId(tableId),
    status: "draft",
    sessionId: new Types.ObjectId(sessionId),
    sessionKey,
  }).lean();

  if (existing) {
    return {
      orderId: String(existing._id),
      status: existing.status,
      sessionId,
      sessionKey,
    };
  }

  const created = await this.orderModel.create({
    restaurantId,
    tableId: new Types.ObjectId(tableId),
    tableNumberSnapshot: tableNumber,
    status: "draft",
    items: [],
    subtotalCents: 0,
    totalCents: 0,
    sessionId: new Types.ObjectId(sessionId),
    sessionKey,
  });

  return {
    orderId: String(created._id),
    status: created.status,
    sessionId,
    sessionKey,
  };
}

  async updateDraftItems(orderId: string, tableId: string, token: string, dto: any) {
    const payload = this.verifyQr(token);
    if (payload.tableId !== tableId) throw new UnauthorizedException('Token invalid');

    const s = await this.tableSessions.openOrGetActive(tableId, token);
    const sessionKey = s.sessionKey;
    const sessionId = s.sessionId;
    const restaurantId = RESTAURANT_ID;

    const order: any = await this.orderModel.findOne({
      _id: orderId,
      restaurantId,
      tableId: new Types.ObjectId(tableId),
      sessionId: new Types.ObjectId(sessionId),
      status: 'draft',
      sessionKey,
    });
    if (!order) throw new NotFoundException('Order not found');

    if (!Array.isArray(dto?.items)) throw new BadRequestException('Invalid items');

    const itemIds = dto.items.map((x: any) => new Types.ObjectId(x.itemId));
    const menuItems = await this.itemModel
      .find({ _id: { $in: itemIds }, restaurantId, isDeleted: false })
      .lean();
    const itemMap = new Map(menuItems.map((it: any) => [String(it._id), it]));

    const optionIds = dto.items.flatMap((x: any) =>
      (x.modifiers ?? []).flatMap((m: any) => m.optionIds ?? []),
    );

    const optDocs = optionIds.length
      ? await this.optModel
          .find({
            _id: { $in: optionIds.map((id: string) => new Types.ObjectId(id)) },
            status: 'active',
          })
          .lean()
      : [];

    const optMap = new Map(optDocs.map((o: any) => [String(o._id), o]));

    let subtotal = 0;

    const lines = dto.items.map((x: any) => {
      const it = itemMap.get(String(x.itemId));
      if (!it) throw new BadRequestException(`Invalid itemId: ${x.itemId}`);

      const mods = (x.modifiers ?? []).map((m: any) => {
        const adj = (m.optionIds ?? []).reduce((sum: number, oid: string) => {
          const op = optMap.get(String(oid));
          return sum + (op?.priceAdjustmentCents ?? 0);
        }, 0);

        return {
          groupId: new Types.ObjectId(m.groupId),
          optionIds: (m.optionIds ?? []).map((oid: string) => new Types.ObjectId(oid)),
          priceAdjustmentCents: adj,
        };
      });

      const modAdj = mods.reduce((s: number, mm: any) => s + (mm.priceAdjustmentCents ?? 0), 0);
      const unit = it.priceCents + modAdj;
      const lineTotal = unit * x.qty;

      subtotal += lineTotal;

      return {
        itemId: new Types.ObjectId(x.itemId),
        nameSnapshot: it.name,
        unitPriceCentsSnapshot: it.priceCents,
        qty: x.qty,
        modifiers: mods,
        note: x.note ?? '',
        lineTotalCents: lineTotal,
        status: 'queued',
        startedAt: undefined,
        readyAt: undefined,
        servedAt: undefined,
        cancelledAt: undefined,
      };
    });

    order.items = lines;
    order.subtotalCents = subtotal;
    order.totalCents = subtotal;
    await order.save();

    return {
      ok: true,
      orderId: String(order._id),
      subtotalCents: subtotal,
      totalCents: subtotal,
    };
  }

  async submit(orderId: string, tableId: string, token: string, orderNote: string) {
    const payload = this.verifyQr(token);
    if (payload.tableId !== tableId) throw new UnauthorizedException('Token invalid');

    const s = await this.tableSessions.openOrGetActive(tableId, token);
    const sessionKey = s.sessionKey;
    const sessionId = s.sessionId;
    const restaurantId = RESTAURANT_ID;

    const order: any = await this.orderModel.findOne({
      _id: orderId,
      restaurantId,
      tableId: new Types.ObjectId(tableId),
      sessionId: new Types.ObjectId(sessionId),
      status: 'draft',
      sessionKey,
    });

    if (!order) throw new NotFoundException('Order not found');
    if (!order.items?.length) throw new BadRequestException('Cart is empty');

    (order.items ?? []).forEach((it: any) => {
      if (!it.status) it.status = 'queued';
    });

    order.status = 'pending';
    order.submittedAt = new Date();
    order.orderNote = orderNote;
    await order.save();

    this.ordersGateway.emitOrderSubmitted({
      orderId: String(order._id),
      tableId: String(order.tableId),
      tableNumber: order.tableNumberSnapshot,
      totalCents: order.totalCents,
      submittedAt: order.submittedAt,
      status: order.status,
    });

    return { ok: true, orderId: String(order._id), status: order.status };
  }

  async listMyOrders(tableId: string, token: string) {
    const payload = this.verifyQr(token);
    if (payload.tableId !== tableId) throw new UnauthorizedException('Token invalid');

    const s = await this.tableSessions.openOrGetActive(tableId, token);
    const sessionKey = s.sessionKey;
    const sessionId = s.sessionId;
    const restaurantId = RESTAURANT_ID;

    const orders = await this.orderModel.find({
      restaurantId,
      tableId: new Types.ObjectId(tableId),
      sessionId: new Types.ObjectId(sessionId),
      status: { $ne: 'draft' },
    }).sort({ createdAt: -1 }).lean();

    return orders.map((o: any) => ({
      orderId: String(o._id),
      status: o.status,
      tableNumberSnapshot: o.tableNumberSnapshot,
      items: (o.items ?? []).map((it: any) => ({
        lineId: String(it._id),
        itemId: String(it.itemId),
        nameSnapshot: it.nameSnapshot,
        unitPriceCentsSnapshot: it.unitPriceCentsSnapshot,
        qty: it.qty,
        modifiers: it.modifiers,
        note: it.note,
        lineTotalCents: it.lineTotalCents,
        status: it.status ?? 'queued',
        startedAt: it.startedAt,
        readyAt: it.readyAt,
        servedAt: it.servedAt,
        cancelledAt: it.cancelledAt,
      })),
      subtotalCents: o.subtotalCents,
      totalCents: o.totalCents,
      submittedAt: o.submittedAt,
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
    }));
  }

  async getMyOrder(orderId: string, tableId: string, token: string) {
  const payload = this.verifyQr(token);
  if (payload.tableId !== tableId) throw new UnauthorizedException('Token invalid');

  // ✅ đồng bộ session theo TableSessionsService
  const s = await this.tableSessions.openOrGetActive(tableId, token);
  const restaurantId = RESTAURANT_ID;

  const o = await this.orderModel
    .findOne({
      _id: orderId,
      restaurantId,
      tableId: new Types.ObjectId(tableId),
      sessionId: new Types.ObjectId(s.sessionId),
      sessionKey: s.sessionKey,
      status: { $ne: 'draft' },
    })
    .lean();

  if (!o) throw new NotFoundException('Order not found');

  return {
    orderId: String(o._id),
    status: o.status,
    tableNumberSnapshot: o.tableNumberSnapshot,
    items: (o.items ?? []).map((it: any) => ({
      lineId: String(it._id),
      itemId: String(it.itemId),
      nameSnapshot: it.nameSnapshot,
      unitPriceCentsSnapshot: it.unitPriceCentsSnapshot,
      qty: it.qty,
      modifiers: it.modifiers,
      note: it.note,
      lineTotalCents: it.lineTotalCents,
      status: it.status ?? 'queued',
      startedAt: it.startedAt,
      readyAt: it.readyAt,
      servedAt: it.servedAt,
      cancelledAt: it.cancelledAt,
    })),
    subtotalCents: o.subtotalCents,
    totalCents: o.totalCents,
    submittedAt: o.submittedAt,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

}

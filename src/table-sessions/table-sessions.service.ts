import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { Model, Types } from 'mongoose';
import { RESTAURANT_ID } from '../config/restaurant.config';
import { Table, TableDocument } from '../tables/table.schema';
import { TableSession, TableSessionDocument } from './table-session.schema';
import * as crypto from 'crypto';
import { TablesGateway } from './tables.gateway';

type QrPayload = { tableId: string; v: number; restaurantId?: string };

function genSessionKey() {
  return crypto.randomBytes(16).toString('hex');
}

function toPublicSession(x: any) {
  if (!x) return null;
  return {
    sessionId: String(x._id),
    tableId: String(x.tableId),
    sessionKey: String(x.sessionKey),
    status: x.status,
    openedAt: x.openedAt ? new Date(x.openedAt).toISOString() : undefined,
    billRequestedAt: x.billRequestedAt ? new Date(x.billRequestedAt).toISOString() : undefined,
    paidAt: x.paidAt ? new Date(x.paidAt).toISOString() : undefined,
    closedAt: x.closedAt ? new Date(x.closedAt).toISOString() : undefined,
    activeBillId: x.activeBillId ? String(x.activeBillId) : null,
  };
}

@Injectable()
export class TableSessionsService {
  constructor(
    private readonly jwt: JwtService,
    @InjectModel(Table.name) private readonly tableModel: Model<TableDocument>,
    @InjectModel(TableSession.name) private readonly sessionModel: Model<TableSessionDocument>,
    private readonly tablesGateway: TablesGateway, // ✅ add
  ) {}

  private verifyQr(token: string): QrPayload {
    try {
      const p = this.jwt.verify(token, { secret: process.env.JWT_SECRET }) as any;
      if (!p?.tableId || typeof p?.v !== 'number') throw new Error();
      if (p.restaurantId && p.restaurantId !== RESTAURANT_ID) throw new Error();
      return p;
    } catch {
      throw new UnauthorizedException('QR invalid or is expired');
    }
  }

  private mustObjectId(id: string, name: string) {
    try {
      return new Types.ObjectId(id);
    } catch {
      throw new BadRequestException(`Invalid ${name}`);
    }
  }

  async openOrGetActive(tableId: string, token: string) {
    const payload = this.verifyQr(token);
    if (payload.tableId !== tableId) throw new UnauthorizedException('Token invalid');

    const tid = this.mustObjectId(tableId, 'table');

    const table: any = await this.tableModel.findById(tid).lean();
    if (!table) throw new NotFoundException('Cannot find table');
    if (table.status === 'inactive') throw new ForbiddenException('Table is inactive');
    if ((table.qrTokenVersion ?? 0) !== payload.v) throw new UnauthorizedException('QR is expired');

    const active: any = await this.sessionModel
      .findOne({
        restaurantId: RESTAURANT_ID,
        tableId: tid,
        status: { $in: ['OPEN', 'BILL_REQUESTED', 'PAYMENT_PENDING', 'PAID'] },
      })
      .sort({ createdAt: -1 })
      .lean();

    // ✅ CASE 1: đã có session active -> đảm bảo table occupied + realtime nếu vừa đổi
    if (active) {
      if (table.status !== 'occupied') {
        await this.tableModel.updateOne({ _id: tid }, { $set: { status: 'occupied' } });

        // ✅ realtime: table status changed
        this.tablesGateway.emitTableStatusChanged({
          tableId: String(tid),
          status: 'occupied',
          tableNumber: String(active.tableNumberSnapshot ?? table.tableNumber ?? ''),
          sessionId: String(active._id),
        });
      }

      return {
        ...toPublicSession(active),
        tableNumber: String(active.tableNumberSnapshot ?? table.tableNumber ?? ''),
      };
    }

    // ✅ CASE 2: chưa có session active -> tạo mới
    const created: any = await this.sessionModel.create({
      restaurantId: RESTAURANT_ID,
      tableId: tid,
      tableNumberSnapshot: table.tableNumber,
      sessionKey: genSessionKey(),
      status: 'OPEN',
      openedAt: new Date(),
      activeBillId: null,
    });

    // update table to occupied
    const wasOccupied = table.status === 'occupied';
    await this.tableModel.updateOne({ _id: tid }, { $set: { status: 'occupied' } });

    const createdObj = created?.toObject?.() ?? created;

    // ✅ realtime: status changed (chỉ khi trước đó chưa occupied)
    if (!wasOccupied) {
      this.tablesGateway.emitTableStatusChanged({
        tableId: String(tid),
        status: 'occupied',
        tableNumber: String(table.tableNumber ?? ''),
        sessionId: String(createdObj._id),
      });
    }

    return {
      ...toPublicSession(createdObj),
      tableNumber: String(table.tableNumber ?? ''),
    };
  }

  async getActiveByTableId(tableId: string, token: string) {
    const payload = this.verifyQr(token);
    if (payload.tableId !== tableId) throw new UnauthorizedException('Token invalid');

    const tid = this.mustObjectId(tableId, 'table');

    const table: any = await this.tableModel.findById(tid).lean();
    if (!table) throw new NotFoundException('Cannot find table');
    if (table.status === 'inactive') throw new ForbiddenException('Table is inactive');
    if ((table.qrTokenVersion ?? 0) !== payload.v) throw new UnauthorizedException('QR is expired');

    const s = await this.sessionModel
      .findOne({
        restaurantId: RESTAURANT_ID,
        tableId: tid,
        status: { $in: ['OPEN', 'BILL_REQUESTED', 'PAYMENT_PENDING', 'PAID'] },
      })
      .sort({ createdAt: -1 })
      .lean();

    return s ? toPublicSession(s) : null;
  }
}

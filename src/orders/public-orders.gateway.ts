import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { RESTAURANT_ID } from '../config/restaurant.config';
import { TableSessionsService } from '../table-sessions/table-sessions.service';

type QrPayload = { tableId: string; v: number; restaurantId?: string };

@WebSocketGateway({
  cors: { origin: true, credentials: true },
  namespace: '/pws',
})
export class PublicOrdersGateway implements OnGatewayConnection {
  @WebSocketServer() server: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly tableSessions: TableSessionsService,
  ) {}

  async handleConnection(socket: Socket) {
    const table = socket.handshake.auth?.table as string | undefined;
    const token = socket.handshake.auth?.token as string | undefined;
    if (!table || !token) return socket.disconnect(true);

    try {
      const payload = this.jwt.verify(token, {
        secret: process.env.JWT_SECRET,
      }) as QrPayload;

      if (!payload?.tableId || typeof payload?.v !== 'number') throw new Error();
      if (payload.restaurantId && payload.restaurantId !== RESTAURANT_ID) throw new Error();
      if (payload.tableId !== table) throw new Error();

      const s = await this.tableSessions.openOrGetActive(table, token);
      socket.join(`session:${s.sessionKey}`);
    } catch {
      return socket.disconnect(true);
    }
  }

  emitToSession(sessionKey: string, event: string, data: any) {
    this.server.to(`session:${sessionKey}`).emit(event, data);
  }

  emitOrderStatusChanged(sessionKey: string, data: { orderId: string; status: string }) {
    this.emitToSession(sessionKey, 'order.status_changed', data);
  }

  emitOrderLineStatusChanged(sessionKey: string, data: {
    orderId: string;
    lineId: string;
    status: string;
    orderStatus?: string;
  }) {
    this.emitToSession(sessionKey, 'order.line_status_changed', data);
  }

  emitOrderUpdated(sessionKey: string, data: any) {
    this.emitToSession(sessionKey, 'order.updated', data);
  }

  emitSessionClosed(sessionKey: string, data: {
    sessionId: string;
    status: 'CLOSED';
    closedAt: string;
  }) {
    this.emitToSession(sessionKey, 'session.closed', data);
  }

  emitBillRequested(sessionKey: string, data: any) {
    this.emitToSession(sessionKey, 'bill.requested', data);
  }

  emitBillPaid(sessionKey: string, data: any) {
    this.emitToSession(sessionKey, 'bill.paid', data);
  }
}

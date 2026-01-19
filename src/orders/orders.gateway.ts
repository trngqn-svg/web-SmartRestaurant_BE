import { WebSocketGateway, WebSocketServer, OnGatewayConnection } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { RESTAURANT_ID } from '../config/restaurant.config';

@WebSocketGateway({
  cors: { origin: true, credentials: true },
  namespace: '/ws',
})
export class OrdersGateway implements OnGatewayConnection {
  @WebSocketServer() server: Server;

  constructor(private readonly jwt: JwtService) {}

  async handleConnection(socket: Socket) {
    const token = socket.handshake.auth?.token;
    if (!token) return socket.disconnect(true);

    try {
      const payload: any = this.jwt.verify(token, {
        secret: process.env.JWT_ACCESS_SECRET,
      });

      const role = String(payload.role || '').toUpperCase().trim();
      const rid = String(payload.restaurantId || RESTAURANT_ID);

      if (rid !== RESTAURANT_ID) return socket.disconnect(true);

      const isAdmin = role === 'ADMIN' || role === 'SUPER_ADMIN';

      if (role === 'WAITER' || isAdmin) socket.join(`restaurant:${rid}:waiter`);
      if (role === 'KDS' || isAdmin) socket.join(`restaurant:${rid}:kds`);

      if (!(role === 'WAITER' || role === 'KDS' || isAdmin)) {
        socket.disconnect(true);
        return;
      }
    } catch {
      return socket.disconnect(true);
    }
  }

  emitOrderSubmitted(data: any) {
    const rid = RESTAURANT_ID;
    this.server.to(`restaurant:${rid}:waiter`).emit('order.submitted', data);
  }

  emitOrderAccepted(data: any) {
    const rid = RESTAURANT_ID;
    this.server.to(`restaurant:${rid}:kds`).emit('order.accepted', data);
  }

  emitOrderStatusChanged(data: any) {
    const rid = RESTAURANT_ID;
    this.server.to(`restaurant:${rid}:waiter`).emit('order.status_changed', data);
    this.server.to(`restaurant:${rid}:kds`).emit('order.status_changed', data);
  }

  emitOrderLineStatusChanged(data: {
    orderId: string;
    lineId: string;
    status: string;
    orderStatus?: string;
  }) {
    const rid = RESTAURANT_ID;
    this.server.to(`restaurant:${rid}:waiter`).emit('order.line_status_changed', data);
    this.server.to(`restaurant:${rid}:kds`).emit('order.line_status_changed', data);
  }

  emitBillRequested(data: {
    billId: string;
    sessionId: string;
    tableId?: string;
    tableNumber: string;
    totalCents: number;
    note?: string;
  }) {
    const rid = RESTAURANT_ID;
    this.server.to(`restaurant:${rid}:waiter`).emit('bill.requested', data);
  }

  emitBillPaymentPending(data: {
    billId: string;
    sessionId: string;
    tableId?: string;
    tableNumber: string;
    totalCents: number;
    note?: string;
    method: 'CASH';
  }) {
    const rid = RESTAURANT_ID;
    this.server.to(`restaurant:${rid}:waiter`).emit('bill.payment_pending', data);
  }

  emitBillAccepted(data: {
    billId: string;
    sessionId: string;
    tableNumber: string;
    totalCents: number;
    method?: 'CASH' | 'ONLINE' | null;
    paidAt?: string;
  }) {
    const rid = RESTAURANT_ID;
    this.server.to(`restaurant:${rid}:waiter`).emit('bill.accepted', data);
  }

  emitBillPaid(data: {
    billId: string;
    sessionId: string;
    tableNumber: string;
    totalCents: number;
    method: 'CASH' | 'ONLINE';
    paidAt?: string;
  }) {
    const rid = RESTAURANT_ID;
    this.server.to(`restaurant:${rid}:waiter`).emit('bill.paid', data);
  }

  emitSessionClosed(data: {
    sessionId: string;
    tableNumber: string;
    closedAt?: string;
  }) {
    const rid = RESTAURANT_ID;
    this.server.to(`restaurant:${rid}:waiter`).emit('session.closed', data);
  }

  emitToStaff(event: string, data: any) {
    const rid = RESTAURANT_ID;
    this.server.to(`restaurant:${rid}:waiter`).emit(event, data);
  }
}

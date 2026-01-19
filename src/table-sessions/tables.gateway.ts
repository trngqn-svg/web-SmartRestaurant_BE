import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';

@WebSocketGateway({ namespace: '/ws' })
export class TablesGateway {
  @WebSocketServer() server: Server;

  emitTableStatusChanged(payload: {
    tableId: string;
    status: string;
    tableNumber?: string;
    sessionId?: string;
  }) {
    this.server.emit('table.status_changed', payload);
  }
}

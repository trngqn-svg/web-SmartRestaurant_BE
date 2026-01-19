import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';

import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { Payment, PaymentSchema } from './payment.schema';

import { Bill, BillSchema } from '../bills/bill.schema';
import { TableSession, TableSessionSchema } from '../table-sessions/table-session.schema';
import { Order, OrderSchema } from '../orders/order.schema';

import { OrdersModule } from '../orders/orders.module';

@Module({
  imports: [
    ConfigModule,
    OrdersModule,
    MongooseModule.forFeature([
      { name: Payment.name, schema: PaymentSchema },
      { name: Bill.name, schema: BillSchema },
      { name: TableSession.name, schema: TableSessionSchema },
      { name: Order.name, schema: OrderSchema },
    ]),
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}

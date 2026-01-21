import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { BillsService } from './bills.service';
import { PublicBillsController } from './public-bills.controller';
import { StaffBillsController } from './staff-bills.controller';
import { Bill, BillSchema } from './bill.schema';
import { Table, TableSchema } from '../tables/table.schema';
import { OrdersModule } from '../orders/orders.module';
import { Order, OrderSchema } from '../orders/order.schema';
import { TableSession, TableSessionSchema } from '../table-sessions/table-session.schema';
import { TableSessionsModule } from '../table-sessions/table-sessions.module';
import { ModifierGroup, ModifierGroupSchema } from 'src/menu/modifiers/modifier-group.schema';
import { ModifierOption, ModifierOptionSchema } from 'src/menu/modifiers/modifier-option.schema';

@Module({
  imports: [
    OrdersModule,
    TableSessionsModule,
    MongooseModule.forFeature([
      { name: Bill.name, schema: BillSchema },
      { name: Order.name, schema: OrderSchema },
      { name: TableSession.name, schema: TableSessionSchema },
      { name: ModifierGroup.name, schema: ModifierGroupSchema },
      { name: ModifierOption.name, schema: ModifierOptionSchema },
      { name: ModifierOption.name, schema: ModifierOptionSchema },
    ]),
  ],
  providers: [BillsService],
  controllers: [PublicBillsController, StaffBillsController],
  exports: [BillsService]
})
export class BillsModule {}

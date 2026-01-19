import { forwardRef, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';

import { TableSessionsModule } from '../table-sessions/table-sessions.module';

import { Order, OrderSchema } from './order.schema';
import { Table, TableSchema } from '../tables/table.schema';

import { MenuItem, MenuItemSchema } from '../menu/items/item.schema';
import { ModifierOption, ModifierOptionSchema } from '../menu/modifiers/modifier-option.schema';
import { ModifierGroup, ModifierGroupSchema } from '../menu/modifiers/modifier-group.schema';

import { OrdersGateway } from './orders.gateway';
import { PublicOrdersGateway } from './public-orders.gateway';

import { PublicOrdersController } from './public-orders.controller';
import { StaffOrdersController } from './staff-orders.controller';

import { PublicOrdersService } from './public-orders.service';
import { StaffOrdersService } from './staff-orders.service';

@Module({
  imports: [
    JwtModule.register({ secret: process.env.JWT_SECRET }),
    forwardRef(() => TableSessionsModule),
    MongooseModule.forFeature([
      { name: Order.name, schema: OrderSchema },
      { name: Table.name, schema: TableSchema },
      { name: MenuItem.name, schema: MenuItemSchema },
      { name: ModifierOption.name, schema: ModifierOptionSchema },
      { name: ModifierGroup.name, schema: ModifierGroupSchema },
    ]),
  ],
  controllers: [PublicOrdersController, StaffOrdersController],
  providers: [PublicOrdersService, StaffOrdersService, OrdersGateway, PublicOrdersGateway],
  exports: [
    OrdersGateway,
    PublicOrdersGateway,
    PublicOrdersService,
    StaffOrdersService,
  ],
})
export class OrdersModule {}

import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';

import { PublicOrdersController } from './public-orders.controller';
import { PublicOrdersService } from './public-orders.service';

import { Table, TableSchema } from '../tables/table.schema';
import { Order, OrderSchema } from './order.schema';
import { MenuItem, MenuItemSchema } from '../menu/items/item.schema';
import { ModifierOption, ModifierOptionSchema } from '../menu/modifiers/modifier-option.schema';
import { ModifierGroup, ModifierGroupSchema } from '../menu/modifiers/modifier-group.schema';
import { OrdersGateway } from './orders.gateway';
import { StaffOrdersController } from './staff-orders.controller';
import { StaffOrdersService } from './staff-orders.service';
import { PublicOrdersGateway } from './public-orders.gateway';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.QR_JWT_SECRET,
    }),

    MongooseModule.forFeature([
      { name: Table.name, schema: TableSchema },
      { name: Order.name, schema: OrderSchema },
      { name: MenuItem.name, schema: MenuItemSchema },
      { name: ModifierOption.name, schema: ModifierOptionSchema },
      { name: ModifierGroup.name, schema: ModifierGroupSchema },
    ]),
  ],
  controllers: [PublicOrdersController, StaffOrdersController],
  providers: [PublicOrdersService, OrdersGateway, StaffOrdersService, PublicOrdersGateway],
})
export class PublicOrdersModule {}

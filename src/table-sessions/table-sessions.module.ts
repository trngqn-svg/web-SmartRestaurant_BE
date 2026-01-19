import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';

import { Table, TableSchema } from '../tables/table.schema';
import { TableSession, TableSessionSchema } from './table-session.schema';

import { TableSessionsService } from './table-sessions.service';
import { StaffTableSessionsController } from './staff-table-sessions.controller';
import { StaffTableSessionsService } from './staff-table-sessions.service';
import { PublicTableSessionsController } from './public-table-sessions.controller';

import { OrdersModule } from '../orders/orders.module';
import { TablesGateway } from './tables.gateway';

@Module({
  imports: [
    JwtModule.register({}),
    MongooseModule.forFeature([
      { name: Table.name, schema: TableSchema },
      { name: TableSession.name, schema: TableSessionSchema },
    ]),
    forwardRef(() => OrdersModule),
  ],
  controllers: [PublicTableSessionsController, StaffTableSessionsController],
  providers: [TableSessionsService, StaffTableSessionsService, TablesGateway],
  exports: [TableSessionsService, StaffTableSessionsService, MongooseModule],
})
export class TableSessionsModule {}

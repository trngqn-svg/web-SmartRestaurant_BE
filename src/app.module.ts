import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import envConfig from './config/env';
import { MongooseModule } from '@nestjs/mongoose';
import { ServeStaticModule } from '@nestjs/serve-static';
import * as path from 'path';

import { AccountsModule } from './accounts/accounts.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { PublicMenuModule } from './menu/public/public-menu.module';
import { BillsModule } from './bills/bills.module';
import { OrdersModule } from './orders/orders.module';
import { ItemReviewsModule } from './menu/reviews/item-reviews.module';
import { PaymentsModule } from './payments/payments.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [envConfig],
    }),

    ServeStaticModule.forRoot({
      rootPath: path.join(process.cwd(), 'uploads'),
      serveRoot: '/uploads',
    }),

    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('MONGO_URI')!,
      }),
    }),

    AccountsModule,
    UsersModule,
    AuthModule,
    PublicMenuModule,
    BillsModule,
    OrdersModule,
    ItemReviewsModule,
    PaymentsModule,
  ],
})
export class AppModule {}

import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import envConfig from './config/env';
import { MongooseModule } from '@nestjs/mongoose';

import { AccountsModule } from './accounts/accounts.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { PublicMenuModule } from './menu/public/public-menu.module';
import { PublicOrdersModule } from './orders/public-orders.module';


@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [envConfig],
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
    PublicOrdersModule,
  ],
})
export class AppModule {}

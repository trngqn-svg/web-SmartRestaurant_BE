import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

import { AccountsModule } from '../accounts/accounts.module';
import { UsersModule } from '../users/users.module';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAccessStrategy } from '../common/strategies/jwt-access.strategy';
import { CookieUtil } from '../common/utils/cookie.util';
import { GoogleStrategy } from '../common/strategies/google.strategy';
import { PasswordResetModule } from './password-reset/password-reset.module';

@Module({
  imports: [
    AccountsModule,
    UsersModule,
    PasswordResetModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_ACCESS_SECRET')!,
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAccessStrategy, CookieUtil, GoogleStrategy],
})
export class AuthModule {}

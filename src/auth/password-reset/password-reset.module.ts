import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';

import { PasswordReset, PasswordResetSchema } from './password-reset.schema';
import { PasswordResetService } from './password-reset.service';
import { PasswordResetController } from './password-reset.controller';
import { UsersModule } from '../../users/users.module';
import { EmailModule } from '../../common/email/email.module';

@Module({
  imports: [
    UsersModule,
    EmailModule,
    JwtModule.register({}),
    MongooseModule.forFeature([
      { name: PasswordReset.name, schema: PasswordResetSchema },
    ]),
  ],
  providers: [PasswordResetService],
  controllers: [PasswordResetController],
})
export class PasswordResetModule {}

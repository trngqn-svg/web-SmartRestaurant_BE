import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Payment, PaymentSchema } from './payment.schema';
import { PaymentsService } from './payments.service';
import { PublicPaymentsController } from './public-payments.controller';
import { MockPaymentsWebhookController } from './mock-webhook.controller';

import { Bill, BillSchema } from '../bills/bill.schema';
import { TableSession, TableSessionSchema } from '../table-sessions/table-session.schema';
import { BillsModule } from '../bills/bills.module';

@Module({
  imports: [
    forwardRef(() => BillsModule),
    MongooseModule.forFeature([
      { name: Payment.name, schema: PaymentSchema },
      { name: Bill.name, schema: BillSchema },
      { name: TableSession.name, schema: TableSessionSchema },
    ]),
  ],
  providers: [PaymentsService],
  controllers: [PublicPaymentsController, MockPaymentsWebhookController],
  exports: [PaymentsService],
})
export class PaymentsModule {}

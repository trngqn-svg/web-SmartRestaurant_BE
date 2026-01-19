import { Controller, Param, Post, UseGuards } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { OptionalJwtAuthGuard } from 'src/common/guards/optional-jwt-auth.guard';

@Controller('/webhooks/mock-payments')
@UseGuards(OptionalJwtAuthGuard)
export class MockPaymentsWebhookController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('/:paymentId/success')
  success(@Param('paymentId') paymentId: string) {
    return this.payments.mockSuccess(paymentId);
  }

  @Post('/:paymentId/fail')
  fail(@Param('paymentId') paymentId: string) {
    return this.payments.mockFail(paymentId);
  }
}

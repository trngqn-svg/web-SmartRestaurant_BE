import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { OptionalJwtAuthGuard } from 'src/common/guards/optional-jwt-auth.guard';

@Controller('/public')
@UseGuards(OptionalJwtAuthGuard)
export class PublicPaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('/bills/:billId/payments')
  create(
    @Param('billId') billId: string,
    @Body() body: { provider: 'mock' | 'vnpay'; amountCents?: number },
  ) {
    return this.payments.createBillPayment({
      billId,
      provider: body.provider,
      amountCents: body.amountCents,
    });
  }

  @Get('/payments/:paymentId')
  get(@Param('paymentId') paymentId: string) {
    return this.payments.getPayment(paymentId);
  }
}

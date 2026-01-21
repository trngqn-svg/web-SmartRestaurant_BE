import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { PaymentsService } from './payments.service';
import { CreateVnpayDto } from './dto/create-vnpay.dto';
import { RESTAURANT_ID } from '../config/restaurant.config';

function getClientIp(req: Request) {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length > 0) return xf.split(',')[0].trim();
  return req.ip || '127.0.0.1';
}

@Controller('/api')
export class PaymentsController {
  constructor(private readonly svc: PaymentsService) {}

  @Post('/payments/vnpay/create')
  async create(@Body() dto: CreateVnpayDto, @Req() req: Request) {
    return this.svc.createVnpayPayment(dto, {
      restaurantId: RESTAURANT_ID,
      ipAddr: getClientIp(req),
    });
  }

  @Get('/payment/vnpay-return')
  async vnpReturn(@Query() query: any) {
    return this.svc.handleVnpayReturn(query, { restaurantId: RESTAURANT_ID });
  }

  @Get('/payments/vnpay/ipn')
  async ipnGet(@Query() query: any) {
    return this.svc.handleVnpayIpn(query, { restaurantId: RESTAURANT_ID });
  }

  @Post('/payments/vnpay/ipn')
  async ipnPost(@Body() body: any) {
    return this.svc.handleVnpayIpn(body, { restaurantId: RESTAURANT_ID });
  }

  @Get('/payments/vnpay/status')
  async status(@Query('txnRef') txnRef: string) {
    return this.svc.getVnpayStatus(txnRef, { restaurantId: RESTAURANT_ID });
  }
}

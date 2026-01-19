import { Controller, Get, Post, Body, Query, Param, Req } from '@nestjs/common';
import { BillsService } from './bills.service';
import { OptionalJwtAuthGuard } from 'src/common/guards/optional-jwt-auth.guard';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { UseGuards } from '@nestjs/common';

@Controller('/public/bills')
@UseGuards(OptionalJwtAuthGuard)
export class PublicBillsController {
  constructor(private readonly service: BillsService) {}

  @Post('/request')
  request(@Body() b: { sessionId: string; note?: string }) {
    return this.service.requestBill(b.sessionId, b.note ?? '');
  }

  @Get('/active')
  active(@Query('table') tableId: string, @Query('token') token: string) {
    return this.service.getActiveBillForTable(tableId, token);
  }

  @Post('/:billId/pay-cash')
  payCash(
    @Param('billId') billId: string,
    @Query('table') tableId: string,
    @Query('token') token: string,
  ) {
    return this.service.payCash(billId, tableId, token);
  }

  @Post('/:billId/pay-online')
  payOnline(
    @Param('billId') billId: string,
    @Query('table') tableId: string,
    @Query('token') token: string,
  ) {
    return this.service.payOnline(billId, tableId, token);
  }

@UseGuards(JwtAuthGuard)
@Get('mine')
listMine(
  @Req() req: any,
  @Query('datePreset') datePreset?: any,
  @Query('from') from?: string,
  @Query('to') to?: string,
  @Query('page') page?: string,
  @Query('limit') limit?: string,
) {
  return this.service.listMyBills(req , {
    datePreset,
    from,
    to,
    page: page ? Number(page) : undefined,
    limit: limit ? Number(limit) : undefined,
  });
}

}

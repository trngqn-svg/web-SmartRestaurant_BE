import { Controller, Get, Post, Body, Query, Param, Req } from '@nestjs/common';
import { BillsService } from './bills.service';
import { OptionalJwtAuthGuard } from 'src/common/guards/optional-jwt-auth.guard';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { UseGuards } from '@nestjs/common';

@Controller('/public/bills')
export class PublicBillsController {
  constructor(private readonly service: BillsService) {}

  @UseGuards(OptionalJwtAuthGuard)
  @Post('/request')
  request(@Req() req: any, @Body() b: { sessionId: string; note?: string }) {
    return this.service.requestBill(b.sessionId, b.note ?? '', req.user);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get('/active')
  active(@Query('table') tableId: string, @Query('token') token: string) {
    return this.service.getActiveBillForTable(tableId, token);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Post('/:billId/pay-cash')
  payCash(
    @Param('billId') billId: string,
    @Query('table') tableId: string,
    @Query('token') token: string,
  ) {
    return this.service.payCash(billId, tableId, token);
  }

  @UseGuards(OptionalJwtAuthGuard)
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
    return this.service.listMyBills(req.user , {
      datePreset,
      from,
      to,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }
}

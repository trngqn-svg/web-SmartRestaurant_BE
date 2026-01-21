import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { BillsService } from './bills.service';

@Controller('/staff/bills')
export class StaffBillsController {
  constructor(private readonly service: BillsService) {}

@Get()
listStaffBills(
  @Query('tab') tab?: 'REQUESTED' | 'PAID' | 'DONE',
  @Query('datePreset') datePreset?: any,
  @Query('from') from?: string,
  @Query('to') to?: string,
  @Query('page') page?: string,
  @Query('limit') limit?: string,
) {
  return this.service.listStaffBills({
    tab: (tab as any) || 'REQUESTED',
    datePreset,
    from,
    to,
    page: page ? Number(page) : undefined,
    limit: limit ? Number(limit) : undefined,
  });
}

  @Post('/:billId/accept')
  accept(@Param('billId') billId: string) {
    return this.service.acceptPaidBill(billId);
  }
}

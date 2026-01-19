import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { TableSessionsService } from './table-sessions.service';
import { OptionalJwtAuthGuard } from 'src/common/guards/optional-jwt-auth.guard';

@Controller('/public/sessions')
@UseGuards(OptionalJwtAuthGuard)
export class PublicTableSessionsController {
  constructor(private readonly service: TableSessionsService) {}

  @Get('/open')
  open(@Query('table') tableId: string, @Query('token') token: string) {
    return this.service.openOrGetActive(tableId, token);
  }

  @Get('/active')
  active(@Query('table') tableId: string, @Query('token') token: string) {
    return this.service.getActiveByTableId(tableId, token);
  }
}

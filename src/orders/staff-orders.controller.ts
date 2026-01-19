import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { StaffOrdersService } from './staff-orders.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('/staff/orders')
export class StaffOrdersController {
  constructor(private readonly service: StaffOrdersService) {}

  @Roles('WAITER', 'ADMIN', 'SUPER_ADMIN', 'KDS')
  @Get()
  list(
    @Query('status') status?: string,
    @Query('q') q?: string,
    @Query('datePreset') datePreset?: 'today' | 'yesterday' | 'this_week' | 'this_month',
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.list({
      status,
      q,
      datePreset,
      from,
      to,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Roles('WAITER', 'ADMIN', 'SUPER_ADMIN')
  @Post('/:id/accept')
  accept(@Param('id') id: string) {
    return this.service.accept(id);
  }

  @Roles('WAITER', 'ADMIN', 'SUPER_ADMIN')
  @Post('/:id/reject')
  reject(@Param('id') id: string) {
    return this.service.reject(id);
  }

  @Roles('KDS','ADMIN','SUPER_ADMIN')
  @Post('/:id/start')
  startOrder(@Param('id') id: string) {
    return this.service.startOrder(id);
  }

  @Roles('KDS', 'ADMIN', 'SUPER_ADMIN')
  @Post('/:orderId/lines/:lineId/start')
  startLine(@Param('orderId') orderId: string, @Param('lineId') lineId: string) {
    return this.service.startLine(orderId, lineId);
  }

  @Roles('KDS', 'ADMIN', 'SUPER_ADMIN')
  @Post('/:orderId/lines/:lineId/ready')
  readyLine(@Param('orderId') orderId: string, @Param('lineId') lineId: string) {
    return this.service.readyLine(orderId, lineId);
  }

  @Roles("KDS", "ADMIN", "SUPER_ADMIN")
  @Post("/:id/send-to-waiter")
  sendToWaiter(@Param("id") id: string) {
    return this.service.sendToWaiter(id);
  }

  @Roles("WAITER", "ADMIN", "SUPER_ADMIN")
  @Post("/:id/served")
  served(@Param("id") id: string) {
    return this.service.markServed(id);
  }
}

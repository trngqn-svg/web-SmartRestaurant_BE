import { Controller, Param, Post, UseGuards } from '@nestjs/common';
import { StaffTableSessionsService } from './staff-table-sessions.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('WAITER', 'ADMIN', 'SUPER_ADMIN')
@Controller('/staff/sessions')
export class StaffTableSessionsController {
  constructor(private readonly staffSessionsService: StaffTableSessionsService) {}

  @Post('/:sessionId/close')
  async close(@Param('sessionId') sessionId: string) {
    return this.staffSessionsService.closeSession(sessionId);
  }
}

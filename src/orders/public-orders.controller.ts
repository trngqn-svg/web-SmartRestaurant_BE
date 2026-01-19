import { Controller, Get, Post, Query, Param, Body, UseGuards } from '@nestjs/common';
import { OpenSessionQueryDto } from './dto/open-session.dto';
import { PublicOrdersService } from './public-orders.service';
import { UpdateOrderItemsDto } from './dto/update-order-items.dto';
import { OptionalJwtAuthGuard } from 'src/common/guards/optional-jwt-auth.guard';

@Controller('/public/orders')
@UseGuards(OptionalJwtAuthGuard)
export class PublicOrdersController {
  constructor(private readonly service: PublicOrdersService) {}

  @Get('/open-session')
  openSession(@Query() q: OpenSessionQueryDto) {
    return this.service.openSession(q.table, q.token);
  }

  @Get('')
  listMyOrders(@Query() q: OpenSessionQueryDto) {
    return this.service.listMyOrders(q.table, q.token);
  }

  @Get('/:orderId')
  getOne(@Param('orderId') orderId: string, @Query() q: OpenSessionQueryDto) {
    return this.service.getMyOrder(orderId, q.table, q.token);
  }

  @Post('/:orderId/items')
  updateItems(
    @Param('orderId') orderId: string,
    @Query() q: OpenSessionQueryDto,
    @Body() dto: UpdateOrderItemsDto,
  ) {
    return this.service.updateDraftItems(orderId, q.table, q.token, dto);
  }

  @Post('/:orderId/submit')
  submit(
    @Param('orderId') orderId: string,
    @Query() q: OpenSessionQueryDto,
    @Body() b: { orderNote?: string },
  ) {
    return this.service.submit(orderId, q.table, q.token, b.orderNote || "");
  }
}

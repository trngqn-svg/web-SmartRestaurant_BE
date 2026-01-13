import { Controller, Get, Query, Param } from '@nestjs/common';
import { PublicMenuQueryDto } from './dto/public-menu.dto';
import { PublicMenuService } from './public-menu.service';
import { PublicItemReviewsQueryDto } from './dto/public-item-reviews.dto';

@Controller('/public')
export class PublicMenuController {
  constructor(private readonly service: PublicMenuService) {}

  @Get('/menu')
  getMenu(@Query() q: PublicMenuQueryDto) {
    return this.service.getPublicMenu(q.table, q.token);
  }

  @Get('/menu/items/:itemId/reviews')
  getItemReviews(
    @Param('itemId') itemId: string,
    @Query() q: PublicItemReviewsQueryDto,
  ) {
    return this.service.getItemReviews({
      tableId: q.table,
      token: q.token,
      itemId,
      page: q.page,
      limit: q.limit,
    });
  }
}

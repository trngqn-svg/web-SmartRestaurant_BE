import { Controller, Get, Query, Param, UseGuards } from '@nestjs/common';
import { PublicMenuQueryDto } from './dto/public-menu.dto';
import { PublicMenuService } from './public-menu.service';
import { PublicItemReviewsQueryDto } from './dto/public-item-reviews.dto';
import { OptionalJwtAuthGuard } from 'src/common/guards/optional-jwt-auth.guard';
import { PublicMenuItemQueryDto } from './dto/public-menu-item.dto';

@Controller('/public')
@UseGuards(OptionalJwtAuthGuard)
export class PublicMenuController {
  constructor(private readonly service: PublicMenuService) {}

  @Get('/menu')
  getMenu(@Query() q: PublicMenuQueryDto) {
    return this.service.getPublicMenu({
      tableId: q.table,
      token: q.token,
      page: q.page,
      limit: q.limit,
      q: q.q,
      categoryId: q.categoryId,
    });
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

  @Get('/menu/items/:itemId')
  getMenuItem(
    @Param('itemId') itemId: string,
    @Query() q: PublicMenuItemQueryDto,
  ) {
    return this.service.getPublicMenuItem({
      tableId: q.table,
      token: q.token,
      itemId,
    });
  }
}

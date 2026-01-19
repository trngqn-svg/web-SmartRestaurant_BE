import { Body, Controller, Delete, Get, Param, Patch, Post, Req, Query, UseGuards } from '@nestjs/common';
import { ItemReviewsService } from './item-reviews.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CreateItemReviewDto } from './dto/create-item-review.dto';
import { UpdateItemReviewDto } from './dto/update-item-review.dto';

@Controller('/api')
export class ItemReviewsController {
  constructor(private readonly reviews: ItemReviewsService) {}

  // public list reviews for an item
  @Get('/items/:itemId/reviews')
  list(
    @Param('itemId') itemId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.reviews.listForItem(itemId, { page: Number(page), limit: Number(limit) });
  }

  // my reviews
  @UseGuards(JwtAuthGuard)
  @Get('/reviews/me')
  listMine(@Req() req: any) {
    return this.reviews.listMine({
      subjectType: req.user.subjectType,
      subjectId: req.user.subjectId,
      role: req.user.role,
    });
  }

  // create review
  @UseGuards(JwtAuthGuard)
  @Post('/items/:itemId/reviews')
  create(@Param('itemId') itemId: string, @Req() req: any, @Body() dto: CreateItemReviewDto) {
    return this.reviews.create(
      itemId,
      { rating: dto.rating, comment: dto.comment },
      { subjectType: req.user.subjectType, subjectId: req.user.subjectId, role: req.user.role },
    );
  }

  // update review
  @UseGuards(JwtAuthGuard)
  @Patch('/reviews/:reviewId')
  update(@Param('reviewId') reviewId: string, @Req() req: any, @Body() dto: UpdateItemReviewDto) {
    return this.reviews.update(
      reviewId,
      { rating: dto.rating, comment: dto.comment, status: dto.status },
      { subjectType: req.user.subjectType, subjectId: req.user.subjectId, role: req.user.role },
    );
  }

  // delete review (soft)
  @UseGuards(JwtAuthGuard)
  @Delete('/reviews/:reviewId')
  remove(@Param('reviewId') reviewId: string, @Req() req: any) {
    return this.reviews.remove(
      reviewId,
      { subjectType: req.user.subjectType, subjectId: req.user.subjectId, role: req.user.role },
    );
  }
}

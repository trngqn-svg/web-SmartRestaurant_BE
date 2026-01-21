import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ItemReviewsService } from './item-reviews.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CreateItemReviewDto } from './dto/create-item-review.dto';
import { UpdateItemReviewDto } from './dto/update-item-review.dto';
import { imageFileFilter, reviewPhotoStorage } from './reviews.upload';

@Controller('/api')
export class ItemReviewsController {
  constructor(private readonly reviews: ItemReviewsService) {}

  @Get('/items/:itemId/reviews')
  list(
    @Param('itemId') itemId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.reviews.listForItem(itemId, { page: Number(page), limit: Number(limit) });
  }

  @UseGuards(JwtAuthGuard)
  @Get('/reviews/me')
  listMine(@Req() req: any) {
    return this.reviews.listMine({
      subjectType: req.user.subjectType,
      subjectId: req.user.subjectId,
      role: req.user.role,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Post('/items/:itemId/reviews')
  @UseInterceptors(
    FileFieldsInterceptor(
      [{ name: 'photos', maxCount: 6 }],
      {
        storage: reviewPhotoStorage(),
        fileFilter: imageFileFilter,
        limits: { fileSize: 5 * 1024 * 1024 },
      },
    ),
  )
  create(
    @Param('itemId') itemId: string,
    @Req() req: any,
    @Body() dto: CreateItemReviewDto,
    @UploadedFiles() files?: { photos?: Express.Multer.File[] },
  ) {
    const photoUrls = (files?.photos ?? []).map((f) => `/uploads/review-photos/${f.filename}`);

    return this.reviews.create(
      itemId,
      {
        rating: Number(dto.rating),
        comment: dto.comment,
        photoUrls,
      },
      { subjectType: req.user.subjectType, subjectId: req.user.subjectId, role: req.user.role },
    );
  }

  @UseGuards(JwtAuthGuard)
  @Patch('/reviews/:reviewId')
  @UseInterceptors(
    FileFieldsInterceptor(
      [{ name: 'photos', maxCount: 6 }],
      {
        storage: reviewPhotoStorage(),
        fileFilter: imageFileFilter,
        limits: { fileSize: 5 * 1024 * 1024 },
      },
    ),
  )
  update(
    @Param('reviewId') reviewId: string,
    @Req() req: any,
    @Body() dto: UpdateItemReviewDto,
    @UploadedFiles() files?: { photos?: Express.Multer.File[] },
  ) {
    const newPhotoUrls = (files?.photos ?? []).map((f) => `/uploads/review-photos/${f.filename}`);

    return this.reviews.update(
      reviewId,
      {
        rating: dto.rating !== undefined ? Number(dto.rating) : undefined,
        comment: dto.comment,
        appendPhotoUrls: newPhotoUrls,
      },
      { subjectType: req.user.subjectType, subjectId: req.user.subjectId, role: req.user.role },
    );
  }

  @UseGuards(JwtAuthGuard)
  @Delete('/reviews/:reviewId')
  remove(@Param('reviewId') reviewId: string, @Req() req: any) {
    return this.reviews.remove(
      reviewId,
      { subjectType: req.user.subjectType, subjectId: req.user.subjectId, role: req.user.role },
    );
  }
}

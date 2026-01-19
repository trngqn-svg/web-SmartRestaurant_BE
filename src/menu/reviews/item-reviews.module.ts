import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ItemReview, ItemReviewSchema } from './item-review.schema';
import { ItemReviewsService } from './item-reviews.service';
import { ItemReviewsController } from './item-reviews.controller';
import { MenuItem, MenuItemSchema } from '../../menu/items/item.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ItemReview.name, schema: ItemReviewSchema },
      { name: MenuItem.name, schema: MenuItemSchema },
    ])
  ],
  providers: [ItemReviewsService],
  controllers: [ItemReviewsController],
})
export class ItemReviewsModule {}

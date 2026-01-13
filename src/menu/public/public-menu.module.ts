import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';

import { PublicMenuController } from './public-menu.controller';
import { PublicMenuService } from './public-menu.service';

import { Table, TableSchema } from '../../tables/table.schema';
import { MenuCategory, MenuCategorySchema } from '../categories/category.schema';
import { MenuItem, MenuItemSchema } from '../items/item.schema';
import { MenuItemPhoto, MenuItemPhotoSchema } from '../photos/photo.schema';
import { ModifierGroup, ModifierGroupSchema } from '../modifiers/modifier-group.schema';
import { ModifierOption, ModifierOptionSchema } from '../modifiers/modifier-option.schema';
import { ItemReview, ItemReviewSchema } from '../reviews/item-review.schema'; 

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET,
    }),
    MongooseModule.forFeature([
      { name: Table.name, schema: TableSchema },
      { name: MenuCategory.name, schema: MenuCategorySchema },
      { name: MenuItem.name, schema: MenuItemSchema },
      { name: MenuItemPhoto.name, schema: MenuItemPhotoSchema },
      { name: ModifierGroup.name, schema: ModifierGroupSchema },
      { name: ModifierOption.name, schema: ModifierOptionSchema },
      { name: ItemReview.name, schema: ItemReviewSchema },
    ]),
  ],
  controllers: [PublicMenuController],
  providers: [PublicMenuService],
})
export class PublicMenuModule {}

import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { Model, Types } from 'mongoose';

import { Table, TableDocument } from '../../tables/table.schema';
import { MenuCategory, MenuCategoryDocument } from '../categories/category.schema';
import { MenuItem, MenuItemDocument } from '../items/item.schema';
import { MenuItemPhoto, MenuItemPhotoDocument } from '../photos/photo.schema';
import { ModifierGroup, ModifierGroupDocument } from '../modifiers/modifier-group.schema';
import { ModifierOption, ModifierOptionDocument } from '../modifiers/modifier-option.schema';
import { ItemReview, ItemReviewDocument } from '../reviews/item-review.schema';

type QrPayload = {
  tableId: string;
  restaurantId: string;
  v: number;
  createdAt: Date,
};

@Injectable()
export class PublicMenuService {
  constructor(
    private readonly jwt: JwtService,

    @InjectModel(Table.name) private readonly tableModel: Model<TableDocument>,
    @InjectModel(MenuCategory.name) private readonly catModel: Model<MenuCategoryDocument>,
    @InjectModel(MenuItem.name) private readonly itemModel: Model<MenuItemDocument>,
    @InjectModel(MenuItemPhoto.name) private readonly photoModel: Model<MenuItemPhotoDocument>,
    @InjectModel(ModifierGroup.name) private readonly groupModel: Model<ModifierGroupDocument>,
    @InjectModel(ModifierOption.name) private readonly optModel: Model<ModifierOptionDocument>,
    @InjectModel(ItemReview.name) private readonly reviewModel: Model<ItemReviewDocument>,
  ) {}

  async getPublicMenu(tableId: string, token: string) {
    const payload = this.verifyQrToken(token);

    if (payload.tableId !== tableId) {
      throw new UnauthorizedException('Token invalid');
    }

    const table = await this.tableModel.findById(tableId).lean();
    if (!table) throw new NotFoundException('Cannot find table');

    if (table.status === 'inactive') {
      throw new ForbiddenException('Table is inactive');
    }

    if ((table.qrTokenVersion ?? 0) !== payload.v) {
      throw new UnauthorizedException('QR is expirated');
    }

    const restaurantId = payload.restaurantId;

    const categories = await this.catModel
      .find({ restaurantId, status: 'active', isDeleted: false })
      .sort({ displayOrder: 1, name: 1, createdAt: -1 })
      .lean();

    const items = await this.itemModel
      .find({
        restaurantId,
        isDeleted: false,
        status: { $in: ['available', 'sold_out'] },
      })
      .sort({ popularityCount: -1, createdAt: -1 })
      .lean();

    const itemObjectIds = items.map((it) => new Types.ObjectId(it._id));
    const photos = itemObjectIds.length
      ? await this.photoModel.find({ menuItemId: { $in: itemObjectIds } }).lean()
      : [];

    const photosByItem = new Map<string, any[]>();
    for (const p of photos) {
      const k = String(p.menuItemId);
      const arr = photosByItem.get(k) ?? [];
      arr.push(p);
      photosByItem.set(k, arr);
    }

    const groupIdSet = new Set<string>();
    for (const it of items) {
      for (const gid of it.modifierGroupIds ?? []) groupIdSet.add(String(gid));
    }

    const groupIds = [...groupIdSet].map((id) => new Types.ObjectId(id));

    const groups = groupIds.length
      ? await this.groupModel
          .find({ _id: { $in: groupIds }, restaurantId, status: 'active' })
          .sort({ displayOrder: 1, name: 1 })
          .lean()
      : [];

    const options = groupIds.length
      ? await this.optModel
          .find({ groupId: { $in: groupIds }, status: 'active' })
          .sort({ displayOrder: 1, name: 1 })
          .lean()
      : [];

    const optionsByGroup = new Map<string, any[]>();
    for (const op of options) {
      const k = String(op.groupId);
      const arr = optionsByGroup.get(k) ?? [];
      arr.push(op);
      optionsByGroup.set(k, arr);
    }

    const groupsById = new Map<string, any>();
    for (const g of groups) {
      groupsById.set(String(g._id), {
        ...g,
        options: optionsByGroup.get(String(g._id)) ?? [],
      });
    }

    const enrichedItems = items.map((it) => {
      const id = String(it._id);

      const itemPhotos = (photosByItem.get(id) ?? []).sort((a, b) => {
        if (a.isPrimary === b.isPrimary) return 0;
        return a.isPrimary ? -1 : 1;
      });

      const modifierGroups = (it.modifierGroupIds ?? [])
        .map((gid) => groupsById.get(String(gid)))
        .filter(Boolean);

      return {
        _id: String(it._id),
        restaurantId: it.restaurantId,
        categoryId: String(it.categoryId),
        name: it.name,
        description: it.description,
        priceCents: it.priceCents,
        prepTimeMinutes: it.prepTimeMinutes,
        status: it.status,
        isChefRecommended: it.isChefRecommended,
        popularityCount: it.popularityCount,
        ratingAvg: it.ratingAvg,
        ratingCount: it.ratingCount,
        ratingBreakdown: it.ratingBreakdown,

        photos: itemPhotos.map((p) => ({
          _id: String(p._id),
          url: `${process.env.ADMIN_URL}${p.url}`,
          isPrimary: p.isPrimary,
        })),

        modifierGroups: modifierGroups.map((g: any) => ({
          _id: String(g._id),
          name: g.name,
          selectionType: g.selectionType,
          isRequired: g.isRequired,
          minSelections: g.minSelections,
          maxSelections: g.maxSelections,
          displayOrder: g.displayOrder,
          options: (g.options ?? []).map((op: any) => ({
            _id: String(op._id),
            name: op.name,
            priceAdjustmentCents: op.priceAdjustmentCents,
            displayOrder: op.displayOrder,
          })),
        })),
      };
    });

    return {
      table: {
        _id: String(table._id),
        tableNumber: table.tableNumber,
        capacity: table.capacity,
        location: table.location,
        description: table.description,
        status: table.status,
      },
      restaurantId,
      categories: categories.map((c) => ({
        _id: String(c._id),
        name: c.name,
        description: c.description,
        displayOrder: c.displayOrder,
      })),
      items: enrichedItems,
    };
  }

  private verifyQrToken(token: string): QrPayload {
    try {
      const p = this.jwt.verify(token, { secret: process.env.JWT_SECRET }) as Partial<QrPayload>;
      if (!p?.tableId || !p?.restaurantId || typeof p?.v !== 'number') {
        throw new Error('Bad payload');
      }
      return p as QrPayload;
    } catch {
      throw new UnauthorizedException('QR không hợp lệ hoặc đã hết hạn');
    }
  }

  async getItemReviews(args: {
    tableId: string;
    token: string;
    itemId: string;
    page?: number;
    limit?: number;
  }) {
    const { tableId, token, itemId } = args;

    const payload = this.verifyQrToken(token);
    if (payload.tableId !== tableId) throw new UnauthorizedException("Token invalid");

    const table = await this.tableModel.findById(tableId).lean();
    if (!table) throw new NotFoundException("Cannot find table");
    if (table.status === "inactive") throw new ForbiddenException("Table is inactive");
    if ((table.qrTokenVersion ?? 0) !== payload.v) throw new UnauthorizedException("QR is expirated");

    const restaurantId = payload.restaurantId;

    const pageNum = Math.max(1, Number(args.page || 1));
    const limitNum = Math.min(50, Math.max(1, Number(args.limit || 10)));
    const skip = (pageNum - 1) * limitNum;

    const iid = new Types.ObjectId(itemId);

    const match = {
      restaurantId,
      itemId: iid,
      status: "published" as const,
      isDeleted: false,
    };

    const [total, rows] = await Promise.all([
      this.reviewModel.countDocuments(match),
      this.reviewModel
        .find(match)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
    ]);

    return {
      itemId,
      page: pageNum,
      limit: limitNum,
      total,
      reviews: rows.map((r) => ({
        _id: String(r._id),
        rating: r.rating,
        comment: r.comment,
        photoUrls: r.photoUrls ?? [],
        createdAt: r.createdAt,
      })),
    };
  }
}

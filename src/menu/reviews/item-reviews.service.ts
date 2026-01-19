// item-reviews.service.ts
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { RESTAURANT_ID } from '../../config/restaurant.config';
import { ItemReview, ItemReviewDocument, ReviewStatus } from './item-review.schema';
import { MenuItem, MenuItemDocument } from '../../menu/items/item.schema';

type Actor = { subjectType: 'USER' | 'ACCOUNT'; subjectId: string; role?: string };

function mustBeUser(actor: Actor) {
  if (!actor || actor.subjectType !== 'USER') {
    throw new ForbiddenException('Only USER can write reviews');
  }
}

function toObjectId(id: string, name: string) {
  try {
    return new Types.ObjectId(id);
  } catch {
    throw new BadRequestException(`Invalid ${name}`);
  }
}

function clampInt(n: any, fallback: number) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.floor(x);
}

function validateRating(r: any) {
  const x = Number(r);
  if (!Number.isFinite(x) || x < 1 || x > 5) {
    throw new BadRequestException('Invalid rating (1..5)');
  }
  return Math.floor(x);
}

function normalizeComment(s: any) {
  return String(s ?? '').trim();
}

@Injectable()
export class ItemReviewsService {
  constructor(
    @InjectModel(ItemReview.name) private readonly reviewModel: Model<ItemReviewDocument>,
    @InjectModel(MenuItem.name) private readonly itemModel: Model<MenuItemDocument>,
  ) {}

  /** Recompute from published + not deleted reviews and sync into MenuItem. */
  private async syncItemRating(itemId: Types.ObjectId) {
    const filter = {
      restaurantId: RESTAURANT_ID,
      itemId,
      isDeleted: false,
      status: 'published' as const,
    };

    const rows = await this.reviewModel.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$itemId',
          count: { $sum: 1 },
          sum: { $sum: '$rating' },
          b1: { $sum: { $cond: [{ $eq: ['$rating', 1] }, 1, 0] } },
          b2: { $sum: { $cond: [{ $eq: ['$rating', 2] }, 1, 0] } },
          b3: { $sum: { $cond: [{ $eq: ['$rating', 3] }, 1, 0] } },
          b4: { $sum: { $cond: [{ $eq: ['$rating', 4] }, 1, 0] } },
          b5: { $sum: { $cond: [{ $eq: ['$rating', 5] }, 1, 0] } },
        },
      },
    ]);

    const row = rows?.[0];

    const ratingCount = row?.count ? Number(row.count) : 0;
    const sum = row?.sum ? Number(row.sum) : 0;

    // round to 2 decimals
    const ratingAvg =
      ratingCount > 0 ? Math.round((sum / ratingCount) * 100) / 100 : 0;

    const ratingBreakdown: Record<'1' | '2' | '3' | '4' | '5', number> = {
      '1': row?.b1 ? Number(row.b1) : 0,
      '2': row?.b2 ? Number(row.b2) : 0,
      '3': row?.b3 ? Number(row.b3) : 0,
      '4': row?.b4 ? Number(row.b4) : 0,
      '5': row?.b5 ? Number(row.b5) : 0,
    };

    await this.itemModel.updateOne(
      { _id: itemId, restaurantId: RESTAURANT_ID, isDeleted: false },
      { $set: { ratingAvg, ratingCount, ratingBreakdown } },
    );
  }

  async listForItem(itemId: string, args?: { page?: number; limit?: number }) {
    const iid = toObjectId(itemId, 'itemId');

    const page = clampInt(args?.page ?? 1, 1);
    const limit = clampInt(args?.limit ?? 10, 10);

    if (page <= 0) throw new BadRequestException('Invalid page');
    if (limit <= 0 || limit > 50) throw new BadRequestException('Invalid limit (1..50)');

    const filter = {
      restaurantId: RESTAURANT_ID,
      itemId: iid,
      isDeleted: false,
      status: 'published' as const,
    };

    const skip = (page - 1) * limit;

    const [total, xs] = await Promise.all([
      this.reviewModel.countDocuments(filter),
      this.reviewModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    return {
      ok: true,
      total,
      page,
      limit,
      reviews: xs.map((r: any) => ({
        reviewId: String(r._id),
        itemId: String(r.itemId),
        userId: r.userId ? String(r.userId) : null,
        rating: r.rating,
        comment: r.comment ?? '',
        createdAt: r.createdAt?.toISOString?.(),
      })),
    };
  }

  async listMine(actor: Actor) {
    mustBeUser(actor);
    const uid = toObjectId(actor.subjectId, 'subjectId');

    const xs: any[] = await this.reviewModel
      .find({
        restaurantId: RESTAURANT_ID,
        userId: uid,
        isDeleted: false,
      })
      .sort({ createdAt: -1 })
      .lean();

    return {
      ok: true,
      reviews: xs.map((r) => ({
        reviewId: String(r._id),
        itemId: String(r.itemId),
        rating: r.rating,
        comment: r.comment ?? '',
        status: r.status,
        createdAt: r.createdAt?.toISOString?.(),
        updatedAt: r.updatedAt?.toISOString?.(),
      })),
    };
  }

  async create(itemId: string, dto: { rating: number; comment?: string }, actor: Actor) {
    mustBeUser(actor);

    const iid = toObjectId(itemId, 'itemId');
    const uid = toObjectId(actor.subjectId, 'subjectId');

    const rating = validateRating(dto.rating);
    const comment = normalizeComment(dto.comment);

    try {
      const r: any = await this.reviewModel.create({
        restaurantId: RESTAURANT_ID,
        itemId: iid,
        userId: uid,
        rating,
        comment,
        status: 'published' as const,
        isDeleted: false,
      });

      await this.syncItemRating(iid);

      return {
        ok: true,
        review: {
          reviewId: String(r._id),
          itemId: String(r.itemId),
          userId: String(r.userId),
          rating: r.rating,
          comment: r.comment ?? '',
          status: r.status,
          createdAt: r.createdAt?.toISOString?.(),
        },
      };
    } catch (e: any) {
      if (String(e?.code) === '11000') {
        throw new ConflictException('You already reviewed this item. Please edit your review.');
      }
      throw e;
    }
  }

  async update(
    reviewId: string,
    dto: { rating?: number; comment?: string; status?: ReviewStatus },
    actor: Actor,
  ) {
    mustBeUser(actor);
    const rid = toObjectId(reviewId, 'reviewId');
    const uid = toObjectId(actor.subjectId, 'subjectId');

    const existing: any = await this.reviewModel
      .findOne({ _id: rid, restaurantId: RESTAURANT_ID, isDeleted: false })
      .lean();

    if (!existing) throw new NotFoundException('Review not found');

    if (String(existing.userId) !== String(uid)) {
      throw new ForbiddenException('You can only edit your own review');
    }

    const patch: any = {};

    if (dto.rating !== undefined) patch.rating = validateRating(dto.rating);
    if (dto.comment !== undefined) patch.comment = normalizeComment(dto.comment);
    if (dto.status !== undefined) patch.status = dto.status;

    if (!Object.keys(patch).length) {
      throw new BadRequestException('No changes');
    }

    const r: any = await this.reviewModel
      .findOneAndUpdate(
        { _id: rid, restaurantId: RESTAURANT_ID, isDeleted: false },
        { $set: patch },
        { new: true },
      )
      .lean();

    // rating stats may change when rating OR status changes
    await this.syncItemRating(r.itemId);

    return {
      ok: true,
      review: {
        reviewId: String(r._id),
        itemId: String(r.itemId),
        rating: r.rating,
        comment: r.comment ?? '',
        status: r.status,
        updatedAt: r.updatedAt?.toISOString?.(),
      },
    };
  }

  async remove(reviewId: string, actor: Actor) {
    mustBeUser(actor);
    const rid = toObjectId(reviewId, 'reviewId');
    const uid = toObjectId(actor.subjectId, 'subjectId');

    const existing: any = await this.reviewModel
      .findOne({ _id: rid, restaurantId: RESTAURANT_ID })
      .lean();

    if (!existing || existing.isDeleted) {
      return { ok: true, reviewId };
    }

    if (String(existing.userId) !== String(uid)) {
      throw new ForbiddenException('You can only delete your own review');
    }

    await this.reviewModel.updateOne(
      { _id: rid, restaurantId: RESTAURANT_ID },
      { $set: { isDeleted: true, status: 'hidden' as const } },
    );

    await this.syncItemRating(existing.itemId);

    return { ok: true, reviewId };
  }
}

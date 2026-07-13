// src/common/repositories/base.repository.ts
import { Injectable } from '@nestjs/common';
import {
  FilterQuery,
  Model,
  SortOrder,
  UpdateQuery,
  UpdateWriteOpResult,
  FlattenMaps,
  Require_id,
  HydratedDocument,
} from 'mongoose';
import { RecordsDto } from './records.dto';

/**
 * Lean mapped type for Mongoose v7+ / v8
 * Equivalent to the plain object you get from .lean()
 */
export type Lean<T> = FlattenMaps<Require_id<T>>;

/**
 * BaseRepository
 *
 * T = interface that describes the schema (POJO shape)
 *
 * Note: we use a focused cast at the .lean().exec() sites to align
 * Mongoose's complex inferred types with the Lean<T> we want to return.
 */
@Injectable()
export abstract class BaseRepository<T> {
  constructor(protected readonly model: Model<any>) {}

  /**
   * Find one document and return a plain object (lean).
   */
  async getRecord(filter: FilterQuery<T>): Promise<Lean<T> | null> {
    const result = await this.model.findOne(filter).lean().exec();
    return result as unknown as Lean<T> | null;
  }

  /**
   * Find one document by ID and return a plain object (lean).
   */
  async getRecordById(
    id: string,
    filter?: FilterQuery<Omit<T, '_id'>>
  ): Promise<Lean<T> | null> {
    const result = await this.model
      .findOne({ _id: id, ...(filter || {}) })
      .lean()
      .exec();
    return result as unknown as Lean<T> | null;
  }

  /**
   * Find many with pagination, sorting and optional search across fields.
   */
  async getRecords(
    filter: FilterQuery<T> = {},
    page: number = 1,
    limit: number = 10,
    sortMode: SortOrder = 'desc',
    sortField: string = '_id',
  ): Promise<RecordsDto<Lean<T>>> {
    const searchConditions: any[] = [];

    let query: any = {};

    if (filter && searchConditions.length) {
      query = { $and: [{ ...filter }, { $or: searchConditions }] };
    } else if (filter) {
      query = { ...filter };
    } else if (searchConditions.length) {
      query = { $or: searchConditions };
    }

    const sort = { [sortField]: sortMode };

    const [itemsRaw, total] = await Promise.all([
      this.model
        .find(query)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      this.model.countDocuments(query).exec(),
    ]);

    const items = itemsRaw as unknown as Lean<T>[];

    return {
      items,
      pagination: {
        page: total ? page : 0,
        per_page: limit,
        last_page: total ? Math.ceil(total / limit) : 0,
        total_rows: total,
      },
    };
  }

  /**
   * Insert one record. Returns a plain object representation of the created doc.
   */
  async insertRecord(data: T): Promise<Lean<T>> {
    const doc = (await new this.model(data).save()) as HydratedDocument<T>;
    // toObject() gives a plain JS object; cast to Lean<T> for return type
    return doc.toObject() as unknown as Lean<T>;
  }

  /**
   * Update a single record and return the updated plain object (lean).
   */
  async updateRecord(
    filter: FilterQuery<T>,
    update: UpdateQuery<T>
  ): Promise<Lean<T> | null> {
    const result = await this.model
      .findOneAndUpdate(filter, update, { new: true })
      .lean()
      .exec();
    return result as unknown as Lean<T> | null;
  }

  /**
   * Update many records; returns the raw UpdateWriteOpResult.
   */
  async updateRecords(
    filter: FilterQuery<T>,
    update: UpdateQuery<T>
  ): Promise<UpdateWriteOpResult> {
    return this.model.updateMany(filter, update).exec();
  }

  // Soft delete
  async softDelete(
    filter: FilterQuery<T>,
    deletedField: string = 'deleted'
  ): Promise<UpdateWriteOpResult> {
    return this.model.updateMany(filter, { [deletedField]: true }).exec();
  }

  // Hard delete
  async deleteRecord(filter: FilterQuery<T>): Promise<{ deletedCount?: number }> {
    const result = await this.model.deleteMany(filter).exec();
    return { deletedCount: result.deletedCount };
  }
}

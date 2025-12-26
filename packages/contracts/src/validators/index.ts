import * as v from 'valibot';
import { BUCKETS, type Bucket } from '../types';

export const BucketSchema = v.picklist(BUCKETS);
export const BucketArraySchema = v.array(BucketSchema);

export const parseBucket = (value: unknown): Bucket => v.parse(BucketSchema, value);
export const safeParseBucket = (value: unknown) => v.safeParse(BucketSchema, value);

export const parseBucketArray = (value: unknown): Bucket[] => v.parse(BucketArraySchema, value);
export const safeParseBucketArray = (value: unknown) => v.safeParse(BucketArraySchema, value);

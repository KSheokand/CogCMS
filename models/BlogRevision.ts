import mongoose, { Document, Model, Schema, Types } from 'mongoose';
import type { IBlog } from '@/models/Blog';

export interface IBlogRevisionSnapshot {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  imageUrl: string;
  tag?: string;
  authorId: Types.ObjectId | null;
  category?: string;
  tags: string[];
  faqs: { question: string; answer: string }[];
  keyTakeaways: string[];
  relatedSlugs: string[];
  tocOverrides: { id: string; label?: string; hidden?: boolean }[];
  status: 'draft' | 'publish';
  publishedAt: Date | null;
  metaTitle?: string;
  metaDescription?: string;
  keywords?: string;
  isFeatured: boolean;
  rendered: IBlog['rendered'];
}

export interface IBlogRevision extends Document<Types.ObjectId> {
  blogId: Types.ObjectId;
  siteId: Types.ObjectId;
  version: number;
  snapshot: IBlogRevisionSnapshot;
  createdBy: Types.ObjectId | null;
  createdAt: Date;
}

const TocOverrideSchema = new Schema(
  {
    id: { type: String, required: true },
    label: { type: String },
    hidden: { type: Boolean },
  },
  { _id: false },
);

const FaqSchema = new Schema(
  {
    question: { type: String, required: true },
    answer: { type: String, required: true },
  },
  { _id: false },
);

const TocEntrySchema = new Schema(
  {
    id: { type: String, required: true },
    text: { type: String, required: true },
    level: { type: Number, required: true },
  },
  { _id: false },
);

const RenderedBlogSchema = new Schema(
  {
    html: { type: String, default: '' },
    toc: { type: [TocEntrySchema], default: [] },
    wordCount: { type: Number, required: true, min: 0 },
    readingTime: { type: Number, required: true, min: 0 },
    pipelineVersion: { type: Number, required: true, min: 1 },
    renderedAt: { type: Date, required: true },
  },
  { _id: false },
);

const BlogRevisionSnapshotSchema = new Schema(
  {
    title: { type: String, required: true },
    slug: { type: String, required: true },
    excerpt: { type: String, default: '' },
    content: { type: String, required: true },
    imageUrl: { type: String, default: '' },
    tag: { type: String },
    authorId: { type: Schema.Types.ObjectId, ref: 'Author', default: null },
    category: { type: String },
    tags: { type: [String], default: [] },
    faqs: { type: [FaqSchema], default: [] },
    keyTakeaways: { type: [String], default: [] },
    relatedSlugs: { type: [String], default: [] },
    tocOverrides: { type: [TocOverrideSchema], default: [] },
    status: { type: String, enum: ['draft', 'publish'], required: true },
    publishedAt: { type: Date, default: null },
    metaTitle: { type: String },
    metaDescription: { type: String },
    keywords: { type: String },
    isFeatured: { type: Boolean, default: false },
    rendered: { type: RenderedBlogSchema, required: true },
  },
  { _id: false },
);

const BlogRevisionSchema = new Schema<IBlogRevision>(
  {
    blogId: { type: Schema.Types.ObjectId, ref: 'Blog', required: true },
    siteId: { type: Schema.Types.ObjectId, ref: 'Site', required: true },
    version: { type: Number, required: true, min: 1 },
    snapshot: { type: BlogRevisionSnapshotSchema, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'blog_revisions',
  },
);

BlogRevisionSchema.index({ blogId: 1, version: 1 }, { unique: true });
BlogRevisionSchema.index({ siteId: 1, blogId: 1, createdAt: -1 });

const BlogRevision: Model<IBlogRevision> =
  mongoose.models.BlogRevision ||
  mongoose.model<IBlogRevision>('BlogRevision', BlogRevisionSchema);

export default BlogRevision;

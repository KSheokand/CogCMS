import type { IBlog, PublicationStatus } from '@/models/Blog';
import BlogRevision, {
  type IBlogRevision,
  type IBlogRevisionSnapshot,
} from '@/models/BlogRevision';
import { Types } from 'mongoose';

type RevisionActor = Types.ObjectId | string | null;

function buildBlogRevisionSnapshot(blog: IBlog): IBlogRevisionSnapshot {
  return {
    title: blog.title,
    slug: blog.slug,
    excerpt: blog.excerpt,
    content: blog.content,
    imageUrl: blog.imageUrl,
    tag: blog.tag,
    authorId: blog.authorId,
    category: blog.category,
    tags: [...blog.tags],
    faqs: blog.faqs.map(({ question, answer }) => ({
      question,
      answer,
    })),
    keyTakeaways: [...blog.keyTakeaways],
    relatedSlugs: [...blog.relatedSlugs],
    tocOverrides: blog.tocOverrides.map(({ id, label, hidden }) => ({
      id,
      ...(label !== undefined ? { label } : {}),
      ...(hidden !== undefined ? { hidden } : {}),
    })),
    status: blog.status as PublicationStatus,
    publishedAt: blog.publishedAt,
    metaTitle: blog.metaTitle,
    metaDescription: blog.metaDescription,
    keywords: blog.keywords,
    isFeatured: blog.isFeatured,
    rendered: {
      html: blog.rendered.html,
      toc: blog.rendered.toc.map(({ id, text, level }) => ({
        id,
        text,
        level,
      })),
      wordCount: blog.rendered.wordCount,
      readingTime: blog.rendered.readingTime,
      pipelineVersion: blog.rendered.pipelineVersion,
      renderedAt: blog.rendered.renderedAt,
    },
  };
}

function snapshotsEqual(left: IBlogRevisionSnapshot, right: IBlogRevisionSnapshot): boolean {
  const normalize = (snapshot: IBlogRevisionSnapshot) => ({
    ...snapshot,
    rendered: {
      ...snapshot.rendered,
      renderedAt: undefined,
    },
  });

  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}

async function persistBlogRevision(
  blog: IBlog,
  createdBy: RevisionActor,
  version: number,
): Promise<IBlogRevision> {
  return BlogRevision.create({
    blogId: blog._id,
    siteId: blog.siteId,
    version,
    snapshot: buildBlogRevisionSnapshot(blog),
    createdBy: createdBy ? new Types.ObjectId(createdBy) : null,
  });
}

export async function createBlogRevision(
  blog: IBlog,
  createdBy: RevisionActor,
): Promise<{
  revision: IBlogRevision | null;
  created: boolean;
}> {
  const snapshot = buildBlogRevisionSnapshot(blog);

  const latest = await BlogRevision.findOne({
    blogId: blog._id,
    siteId: blog.siteId,
  })
    .sort({ version: -1 })
    .exec();

  if (latest && snapshotsEqual(latest.snapshot, snapshot)) {
    return {
      revision: null,
      created: false,
    };
  }

  const nextVersion = (latest?.version ?? 0) + 1;
  const revision = await persistBlogRevision(blog, createdBy, nextVersion);

  return {
    revision,
    created: true,
  };
}

export async function createBlogRevisionSnapshot(
  blog: IBlog,
  createdBy: RevisionActor,
): Promise<IBlogRevision> {
  const latest = await BlogRevision.findOne({
    blogId: blog._id,
    siteId: blog.siteId,
  })
    .sort({ version: -1 })
    .exec();

  const nextVersion = (latest?.version ?? 0) + 1;

  return persistBlogRevision(blog, createdBy, nextVersion);
}

export async function ensureBlogRevisionBaseline(
  blog: IBlog,
  createdBy: RevisionActor,
): Promise<{
  revision: IBlogRevision | null;
  created: boolean;
}> {
  const existing = await BlogRevision.findOne({
    blogId: blog._id,
    siteId: blog.siteId,
  })
    .select({ _id: 1 })
    .lean()
    .exec();

  if (existing) {
    return {
      revision: null,
      created: false,
    };
  }

  const revision = await BlogRevision.create({
    blogId: blog._id,
    siteId: blog.siteId,
    version: 1,
    snapshot: buildBlogRevisionSnapshot(blog),
    createdBy: createdBy ? new Types.ObjectId(createdBy) : null,
  });

  return {
    revision,
    created: true,
  };
}

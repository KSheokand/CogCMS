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

function snapshotsEqual(
  left: IBlogRevisionSnapshot,
  right: IBlogRevisionSnapshot,
): boolean {
  const normalize = (snapshot: IBlogRevisionSnapshot) => ({
    ...snapshot,
    rendered: {
      ...snapshot.rendered,
      renderedAt: undefined,
    },
  });

  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
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

  const revision = await BlogRevision.create({
    blogId: blog._id,
    siteId: blog.siteId,
    version: nextVersion,
    snapshot,
    createdBy: createdBy ? new Types.ObjectId(createdBy) : null,
  });

  return {
    revision,
    created: true,
  };
}

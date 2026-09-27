import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import Blog from '@/models/Blog';
import BlogRevision from '@/models/BlogRevision';
import { withAdmin } from '@/lib/http/admin-handler';
import { notFound, validationError } from '@/lib/http/errors';
import { assertBlogAuthorIsUsable } from '@/lib/admin/blog-author';
import { invalidateRelatedPosts } from '@/lib/blog-content/related-index';
import { deliveryEventType, notifySiteWebhook } from '@/lib/webhook';
import { Types } from 'mongoose';
import { createBlogRevisionSnapshot } from '@/lib/blog-revisions';

type Params = {
  slug: string;
  version: string;
};

export const dynamic = 'force-dynamic';

export const POST = withAdmin<Params>(async (_req, { params, user, site }) => {
  const { slug, version } = await params;
  const versionNumber = Number(version);

  if (!Number.isInteger(versionNumber) || versionNumber < 1) {
    throw validationError(
      { version: ['Version must be a positive integer'] },
      'Invalid revision version',
    );
  }

  await connectToDatabase();

  const blog = await Blog.findOne({
    slug,
    siteId: site.id,
  }).exec();

  if (!blog) throw notFound('Blog');

  const revision = await BlogRevision.findOne({
    blogId: blog._id,
    siteId: site.id,
    version: versionNumber,
  }).exec();

  if (!revision) throw notFound('Blog revision');

  const snapshot = revision.snapshot;

  await assertBlogAuthorIsUsable({
    authorId: snapshot.authorId?.toString() ?? undefined,
    siteId: site.id,
    blogStatus: snapshot.status,
  });

  const previousStatus = blog.status;

  const restoredBlog = await Blog.findOneAndUpdate(
    {
      _id: blog._id,
      siteId: site.id,
    },
    {
      $set: {
        title: snapshot.title,
        slug: snapshot.slug,
        excerpt: snapshot.excerpt,
        content: snapshot.content,
        imageUrl: snapshot.imageUrl,
        tag: snapshot.tag,
        authorId: snapshot.authorId,
        category: snapshot.category,
        tags: snapshot.tags,
        faqs: snapshot.faqs,
        keyTakeaways: snapshot.keyTakeaways,
        relatedSlugs: snapshot.relatedSlugs,
        tocOverrides: snapshot.tocOverrides,
        status: snapshot.status,
        publishedAt: snapshot.publishedAt,
        metaTitle: snapshot.metaTitle,
        metaDescription: snapshot.metaDescription,
        keywords: snapshot.keywords,
        isFeatured: snapshot.isFeatured,
        rendered: snapshot.rendered,
        updatedBy: new Types.ObjectId(user.id),
      },
    },
    {
      returnDocument: 'after',
      runValidators: true,
    },
  ).exec();

  if (!restoredBlog) throw notFound('Blog');

  const restoredRevision = await createBlogRevisionSnapshot(restoredBlog, user.id);

  invalidateRelatedPosts(site.id);

  const eventType = deliveryEventType(previousStatus, restoredBlog.status);

  if (eventType) {
    notifySiteWebhook(site.id, {
      type: eventType,
      contentType: 'post',
      slug: restoredBlog.slug,
      id: restoredBlog._id.toString(),
    });
  }

  return NextResponse.json({
    blog: restoredBlog,
    revision: restoredRevision,
  });
});

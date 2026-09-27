import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import Blog from '@/models/Blog';
import { createBlogRevision } from '@/lib/blog-revisions';
import { sanitizeBlogHtml } from '@/lib/sanitize-blog-html';
import { blogInputSchema } from '@/lib/validation/blog';
import { readJson, withAdmin } from '@/lib/http/admin-handler';
import { validationError } from '@/lib/http/errors';
import { renderBlogSnapshot } from '@/lib/render/blog';
import { invalidateRelatedPosts } from '@/lib/blog-content/related-index';
import { notifySiteWebhook } from '@/lib/webhook';
import { assertBlogAuthorIsUsable } from '@/lib/admin/blog-author';

export const dynamic = 'force-dynamic';

export const GET = withAdmin(async (_req, { site }) => {
  await connectToDatabase();
  const blogs = await Blog.find({ siteId: site.id }).sort({ createdAt: -1, _id: -1 }).exec();
  return NextResponse.json(blogs);
});

export const POST = withAdmin(async (req, { user, site }) => {
  const parsed = blogInputSchema.safeParse(await readJson(req));
  if (!parsed.success) throw validationError(parsed.error.flatten(), 'Invalid blog payload');

  const data = { ...parsed.data };
  delete data.createdAt;
  const status = data.status ?? 'publish';
  const content = sanitizeBlogHtml(data.content);
  const rendered = await renderBlogSnapshot(content);

  await connectToDatabase();
  await assertBlogAuthorIsUsable({
    authorId: data.authorId,
    siteId: site.id,
    blogStatus: status,
  });
  const blog = await Blog.create({
    ...data,
    content,
    rendered,
    status,
    publishedAt: status === 'publish' ? new Date() : null,
    siteId: site.id,
    createdBy: user.id,
    updatedBy: user.id,
  });
  await createBlogRevision(blog, user.id);

  invalidateRelatedPosts(site.id);
  if (blog.status === 'publish') {
    notifySiteWebhook(site.id, {
      type: 'content.published',
      contentType: 'post',
      slug: blog.slug,
      id: blog._id.toString(),
    });
  }
  return NextResponse.json(blog, { status: 201 });
});

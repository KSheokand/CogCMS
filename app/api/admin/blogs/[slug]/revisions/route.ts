import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import Blog from '@/models/Blog';
import BlogRevision from '@/models/BlogRevision';
import { notFound } from '@/lib/http/errors';
import { withAdmin } from '@/lib/http/admin-handler';

export const dynamic = 'force-dynamic';

type Params = { slug: string };

export const GET = withAdmin<Params>(async (_req, { params, site }) => {
  const { slug } = await params;

  await connectToDatabase();

  const blog = await Blog.findOne({
    slug,
    siteId: site.id,
  })
    .select({ _id: 1 })
    .lean()
    .exec();

  if (!blog) throw notFound('Blog');

  const revisions = await BlogRevision.find({
    blogId: blog._id,
    siteId: site.id,
  })
    .sort({ version: -1 })
    .exec();

  return NextResponse.json(revisions);
});

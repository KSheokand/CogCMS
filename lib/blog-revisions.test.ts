import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';

const { findOne, create } = vi.hoisted(() => ({
  findOne: vi.fn(),
  create: vi.fn(),
}));

vi.mock('@/models/BlogRevision', () => ({
  default: {
    findOne,
    create,
  },
}));

import { createBlogRevision } from '@/lib/blog-revisions';

const blogId = new Types.ObjectId();
const siteId = new Types.ObjectId();
const userId = new Types.ObjectId();
const authorId = new Types.ObjectId();

function makeBlog(overrides: Record<string, unknown> = {}) {
  return {
    _id: blogId,
    siteId,
    title: 'Test Blog',
    slug: 'test-blog',
    excerpt: 'Test excerpt',
    content: '<p>Hello world</p>',
    imageUrl: '/test.jpg',
    tag: 'Insights',
    authorId,
    category: 'Insights',
    tags: ['testing', 'cms'],
    faqs: [{ question: 'Question?', answer: 'Answer.' }],
    keyTakeaways: ['Takeaway one'],
    relatedSlugs: ['another-blog'],
    tocOverrides: [{ id: 'intro', label: 'Introduction', hidden: false }],
    status: 'draft' as const,
    publishedAt: null,
    metaTitle: 'Test Blog',
    metaDescription: 'Test description',
    keywords: 'test,cms',
    isFeatured: false,
    rendered: {
      html: '<p>Hello world</p>',
      toc: [{ id: 'intro', text: 'Introduction', level: 2 }],
      wordCount: 2,
      readingTime: 1,
      pipelineVersion: 1,
      renderedAt: new Date('2026-09-27T10:00:00.000Z'),
    },
    ...overrides,
  };
}

function mockLatestRevision(revision: unknown) {
  findOne.mockReturnValue({
    sort: vi.fn().mockReturnValue({
      exec: vi.fn().mockResolvedValue(revision),
    }),
  });
}

describe('createBlogRevision', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates the first revision as version 1', async () => {
    mockLatestRevision(null);

    const revision = {
      _id: new Types.ObjectId(),
      version: 1,
    };

    create.mockResolvedValue(revision);

    const blog = makeBlog();

    const result = await createBlogRevision(blog as any, userId);

    expect(result.created).toBe(true);
    expect(result.revision).toBe(revision);

    expect(findOne).toHaveBeenCalledWith({
      blogId,
      siteId,
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        blogId,
        siteId,
        version: 1,
        createdBy: userId,
        snapshot: expect.objectContaining({
          title: 'Test Blog',
          slug: 'test-blog',
          content: '<p>Hello world</p>',
          status: 'draft',
        }),
      }),
    );
  });

  it('increments the version from the latest revision', async () => {
    mockLatestRevision({
      version: 3,
      snapshot: {
        title: 'Older version',
      },
    });

    create.mockResolvedValue({
      _id: new Types.ObjectId(),
      version: 4,
    });

    const result = await createBlogRevision(makeBlog() as any, userId);

    expect(result.created).toBe(true);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        version: 4,
      }),
    );
  });

  it('does not create a duplicate revision when nothing changed', async () => {
    const blog = makeBlog();

    mockLatestRevision({
      version: 2,
      snapshot: {
        title: blog.title,
        slug: blog.slug,
        excerpt: blog.excerpt,
        content: blog.content,
        imageUrl: blog.imageUrl,
        tag: blog.tag,
        authorId: blog.authorId,
        category: blog.category,
        tags: [...blog.tags],
        faqs: [...blog.faqs],
        keyTakeaways: [...blog.keyTakeaways],
        relatedSlugs: [...blog.relatedSlugs],
        tocOverrides: [...blog.tocOverrides],
        status: blog.status,
        publishedAt: blog.publishedAt,
        metaTitle: blog.metaTitle,
        metaDescription: blog.metaDescription,
        keywords: blog.keywords,
        isFeatured: blog.isFeatured,
        rendered: blog.rendered,
      },
    });
    const result = await createBlogRevision(blog as any, userId);

    expect(result.created).toBe(false);
    expect(result.revision).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });

  it('ignores renderedAt changes when checking for duplicate revisions', async () => {
  const blog = makeBlog();

  mockLatestRevision({
    version: 2,
    snapshot: {
      title: blog.title,
      slug: blog.slug,
      excerpt: blog.excerpt,
      content: blog.content,
      imageUrl: blog.imageUrl,
      tag: blog.tag,
      authorId: blog.authorId,
      category: blog.category,
      tags: [...blog.tags],
      faqs: [...blog.faqs],
      keyTakeaways: [...blog.keyTakeaways],
      relatedSlugs: [...blog.relatedSlugs],
      tocOverrides: [...blog.tocOverrides],
      status: blog.status,
      publishedAt: blog.publishedAt,
      metaTitle: blog.metaTitle,
      metaDescription: blog.metaDescription,
      keywords: blog.keywords,
      isFeatured: blog.isFeatured,
      rendered: {
        ...blog.rendered,
        renderedAt: new Date('2026-09-27T11:00:00.000Z'),
      },
    },
  });

  const result = await createBlogRevision(blog as any, userId);

  expect(result.created).toBe(false);
  expect(result.revision).toBeNull();
  expect(create).not.toHaveBeenCalled();
});

  it('creates a new revision when the blog changes', async () => {
    const blog = makeBlog();

    mockLatestRevision({
      version: 2,
      snapshot: {
        title: 'Old title',
        slug: blog.slug,
        excerpt: blog.excerpt,
        content: blog.content,
        imageUrl: blog.imageUrl,
        tag: blog.tag,
        authorId: blog.authorId,
        category: blog.category,
        tags: [...blog.tags],
        faqs: [...blog.faqs],
        keyTakeaways: [...blog.keyTakeaways],
        relatedSlugs: [...blog.relatedSlugs],
        tocOverrides: [...blog.tocOverrides],
        status: blog.status,
        publishedAt: blog.publishedAt,
        metaTitle: blog.metaTitle,
        metaDescription: blog.metaDescription,
        keywords: blog.keywords,
        isFeatured: blog.isFeatured,
        rendered: blog.rendered,
      },
    });

    create.mockResolvedValue({
      _id: new Types.ObjectId(),
      version: 3,
    });

    const result = await createBlogRevision(
      makeBlog({ title: 'New title' }) as any,
      userId,
    );

    expect(result.created).toBe(true);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        version: 3,
        snapshot: expect.objectContaining({
          title: 'New title',
        }),
      }),
    );
  });

  it('keeps revisions scoped to the current site', async () => {
    mockLatestRevision(null);
    create.mockResolvedValue({
      _id: new Types.ObjectId(),
      version: 1,
    });

    await createBlogRevision(makeBlog() as any, userId);

    expect(findOne).toHaveBeenCalledWith({
      blogId,
      siteId,
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        siteId,
      }),
    );
  });
});

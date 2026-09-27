import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetEnvCache } from '@/lib/env';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  resolveSite: vi.fn(),
  connectToDatabase: vi.fn(),
  blogFindOne: vi.fn(),
  blogFindOneAndUpdate: vi.fn(),
  revisionFindOne: vi.fn(),
  assertBlogAuthorIsUsable: vi.fn(),
  createBlogRevisionSnapshot: vi.fn(),
  invalidateRelatedPosts: vi.fn(),
  deliveryEventType: vi.fn(),
  notifySiteWebhook: vi.fn(),
}));

vi.mock('@/lib/auth/require', async (original) => ({
  ...(await original<typeof import('@/lib/auth/require')>()),
  requireUser: mocks.requireUser,
}));

vi.mock('@/lib/site/context', () => ({
  resolveSite: mocks.resolveSite,
}));

vi.mock('@/lib/mongodb', () => ({
  default: mocks.connectToDatabase,
}));

vi.mock('@/models/Blog', () => ({
  default: {
    findOne: mocks.blogFindOne,
    findOneAndUpdate: mocks.blogFindOneAndUpdate,
  },
}));

vi.mock('@/models/BlogRevision', () => ({
  default: {
    findOne: mocks.revisionFindOne,
  },
}));

vi.mock('@/lib/admin/blog-author', () => ({
  assertBlogAuthorIsUsable: mocks.assertBlogAuthorIsUsable,
}));

vi.mock('@/lib/blog-revisions', () => ({
  createBlogRevisionSnapshot: mocks.createBlogRevisionSnapshot,
}));

vi.mock('@/lib/blog-content/related-index', () => ({
  invalidateRelatedPosts: mocks.invalidateRelatedPosts,
}));

vi.mock('@/lib/webhook', () => ({
  deliveryEventType: mocks.deliveryEventType,
  notifySiteWebhook: mocks.notifySiteWebhook,
}));

import { POST } from './route';

const siteId = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const userId = 'cccccccccccccccccccccccc';
const blogId = 'dddddddddddddddddddddddd';

const site = {
  id: siteId,
};

const user = {
  id: userId,
  email: 'admin@example.com',
  name: 'Admin',
  role: 'admin' as const,
  siteIds: [siteId],
};

const ctx = {
  params: Promise.resolve({
    slug: 'test-blog',
    version: '1',
  }),
};

function request() {
  return new NextRequest('https://cms.example/api/admin/blogs/test-blog/revisions/1/restore', {
    method: 'POST',
    headers: {
      origin: 'https://cms.example',
      'content-type': 'application/json',
    },
  });
}

function mockBlogFindOne(blog: unknown) {
  mocks.blogFindOne.mockReturnValueOnce({
    exec: vi.fn().mockResolvedValue(blog),
  });
}

function mockRevisionFindOne(revision: unknown) {
  mocks.revisionFindOne.mockReturnValueOnce({
    exec: vi.fn().mockResolvedValue(revision),
  });
}

beforeEach(() => {
  vi.stubEnv('MONGODB_URI', 'mongodb://localhost/test');
  vi.stubEnv('CMS_JWT_SECRET', 'x'.repeat(32));
  resetEnvCache();
  vi.clearAllMocks();

  mocks.requireUser.mockResolvedValue(user);
  mocks.resolveSite.mockResolvedValue(site);
  mocks.connectToDatabase.mockResolvedValue(undefined);

  mocks.assertBlogAuthorIsUsable.mockResolvedValue(undefined);
  mocks.invalidateRelatedPosts.mockReturnValue(undefined);
  mocks.deliveryEventType.mockReturnValue(null);
  mocks.notifySiteWebhook.mockReturnValue(undefined);
});

describe('POST /api/admin/blogs/[slug]/revisions/[version]/restore', () => {
  it('rejects an invalid revision version', async () => {
    const invalidCtx = {
      params: Promise.resolve({
        slug: 'test-blog',
        version: 'abc',
      }),
    };

    const response = await POST(request(), invalidCtx);

    expect(response.status).toBe(400);

    const body = await response.json();

    expect(body.code).toBe('VALIDATION_ERROR');
    expect(mocks.connectToDatabase).not.toHaveBeenCalled();
    expect(mocks.blogFindOne).not.toHaveBeenCalled();
  });

  it('returns 404 when the blog does not exist', async () => {
    mockBlogFindOne(null);

    const response = await POST(request(), ctx);

    expect(response.status).toBe(404);
    expect((await response.json()).code).toBe('NOT_FOUND');

    expect(mocks.revisionFindOne).not.toHaveBeenCalled();
  });

  it('returns 404 when the requested revision does not exist', async () => {
    const blog = {
      _id: blogId,
      siteId,
      status: 'draft',
    };

    mockBlogFindOne(blog);
    mockRevisionFindOne(null);

    const response = await POST(request(), ctx);

    expect(response.status).toBe(404);
    expect((await response.json()).code).toBe('NOT_FOUND');

    expect(mocks.blogFindOneAndUpdate).not.toHaveBeenCalled();
    expect(mocks.createBlogRevisionSnapshot).not.toHaveBeenCalled();
  });

  it('restores the selected revision and creates a new revision', async () => {
    const blog = {
      _id: blogId,
      siteId,
      status: 'draft',
      slug: 'test-blog',
    };

    const revision = {
      _id: 'revision-1',
      blogId,
      siteId,
      version: 1,
      snapshot: {
        title: 'Original title',
        slug: 'test-blog',
        excerpt: 'Original excerpt',
        content: '<p>Original content</p>',
        imageUrl: '/original.jpg',
        tag: 'Insights',
        authorId: null,
        category: 'Insights',
        tags: ['original'],
        faqs: [],
        keyTakeaways: ['Original takeaway'],
        relatedSlugs: [],
        tocOverrides: [],
        status: 'draft',
        publishedAt: null,
        metaTitle: 'Original title',
        metaDescription: 'Original description',
        keywords: 'original',
        isFeatured: false,
        rendered: {
          html: '<p>Original content</p>',
          toc: [],
          wordCount: 2,
          readingTime: 1,
          pipelineVersion: 1,
          renderedAt: new Date('2026-09-27T10:00:00.000Z'),
        },
      },
    };

    const restoredBlog = {
      ...blog,
      title: 'Original title',
      excerpt: 'Original excerpt',
      content: '<p>Original content</p>',
      imageUrl: '/original.jpg',
      status: 'draft',
    };

    const restoredRevision = {
      _id: 'revision-4',
      version: 4,
    };

    mockBlogFindOne(blog);
    mockRevisionFindOne(revision);

    mocks.blogFindOneAndUpdate.mockReturnValueOnce({
      exec: vi.fn().mockResolvedValue(restoredBlog),
    });

    mocks.createBlogRevisionSnapshot.mockResolvedValue(restoredRevision);

    const response = await POST(request(), ctx);

    expect(response.status).toBe(200);

    const body = await response.json();

    expect(response.status).toBe(200);

    expect(body.blog).toEqual(restoredBlog);
    expect(body.revision).toEqual(restoredRevision);

    expect(mocks.assertBlogAuthorIsUsable).toHaveBeenCalledWith({
      authorId: undefined,
      siteId,
      blogStatus: 'draft',
    });

    expect(mocks.blogFindOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: blogId,
        siteId,
      },
      {
        $set: expect.objectContaining({
          title: 'Original title',
          slug: 'test-blog',
          excerpt: 'Original excerpt',
          content: '<p>Original content</p>',
          imageUrl: '/original.jpg',
          status: 'draft',
          updatedBy: expect.anything(),
        }),
      },
      {
        returnDocument: 'after',
        runValidators: true,
      },
    );

    expect(mocks.createBlogRevisionSnapshot).toHaveBeenCalledWith(restoredBlog, userId);

    expect(mocks.invalidateRelatedPosts).toHaveBeenCalledWith(siteId);
  });
});

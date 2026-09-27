# CogCMS

A self-hostable, multi-site headless CMS built with Next.js 16, React 19, MongoDB/Mongoose, TypeScript and Vitest. Manage blogs, authors, FAQs, whitepapers and release notes in one editorial workspace, and deliver published content to your websites through a versioned API or restricted MongoDB views.

The CMS includes site-scoped users and API keys, editorial previews, stored blog rendering, signed publishing notifications, newsletter and FAQ intake, and optional S3 media uploads. Websites own their presentation. Start with the local demo below or [set up your own installation](docs/DEPLOYMENT.md).

## Local setup

Use Node 22 (`.nvmrc`), npm, **MongoDB 8.2.5** and MongoDB Shell (`mongosh`) for this local recipe. The CMS requires a replica set for transactional paths. Media upload is optional and disabled when the three `S3_*` values are unset.

Get the source and enter the project directory:

```sh
git clone https://github.com/mundra-aman/CogCMS.git
cd CogCMS
```

Then complete these steps from that directory:

1. Create an empty local data directory and start MongoDB with `mongod --replSet rs0 --bind_ip 127.0.0.1 --port 27017 --dbpath <empty-local-directory>`. In a second terminal, connect with `mongosh mongodb://localhost:27017` and run `rs.initiate({_id: 'rs0', members: [{_id: 0, host: 'localhost:27017'}]})` once. Do not point these commands at a shared database.
2. Run `npm ci`, copy `.env.example` to `.env`, and set a new local `CMS_JWT_SECRET` (at least 32 characters) and local `CMS_SEED_ADMIN_PASSWORD` (at least 12 characters). The example email is fictional. Keep `MONGODB_DB_NAME=cms_public_demo` and `MONGODB_URI=mongodb://localhost:27017/?replicaSet=rs0`.
3. Run `npm run seed:admin`, `npm run ensure:indexes`, then `npm run seed:demo`. The demo seed refuses remote MongoDB targets, any database name other than `cms_public_demo`, and an existing site or blog. It creates two fictional sites and 48 blogs; it never overwrites existing records.
4. Run `npm run dev` and open `http://localhost:3003/admin/login`. Sign in with the local admin, then choose **Northstar Studio** or **Harbor Notes** from the site selector. Explore the editors or create a site of your own. The demo has no public website, so its public View links are illustrative.

To reset, stop the app and verify that the target is your disposable local `cms_public_demo` database before dropping it with `mongosh`; then repeat the seed commands. No reset command is bundled so a copied command cannot silently erase another database.

## Blog Version History

### Problem

Editors can accidentally overwrite useful blog content while making changes. Blog Version History provides a persistent history of saved blog states so editors can inspect previous versions and restore an earlier state without deleting the existing history.

A revision is created for a saved state rather than for every keystroke. The current `Blog` document remains the source of truth, while historical states are stored separately as immutable snapshots.

### Architecture and data flow

```text
Blog Editor
    │
    ├── Save / Publish
    │       │
    │       ▼
    │   Current Blog
    │       │
    │       ▼
    │   createBlogRevision()
    │       │
    │       ▼
    │   blog_revisions
    │       │
    │       ├── Version 1
    │       ├── Version 2
    │       └── Version 3
    │
    └── Version History
            │
            ├── View snapshot
            │
            └── Restore version
                    │
                    ▼
              Current Blog
                    │
                    ▼
              New revision
```

### Data model

`BlogRevision` stores a complete snapshot of the blog at a particular saved version.

```text
BlogRevision
├── blogId
├── siteId
├── version
├── snapshot
│   ├── title
│   ├── slug
│   ├── content
│   ├── metadata
│   ├── FAQs
│   ├── tags
│   ├── TOC overrides
│   └── rendered content
├── createdBy
└── createdAt
```

A unique compound index on `(blogId, version)` prevents duplicate version numbers for the same blog.

### Revision creation

When an existing blog is opened in the editor, the system lazily creates a Version 1 baseline if the blog does not already have any revisions.

Subsequent saves compare the current blog snapshot with the latest stored revision. If the content is unchanged, no duplicate revision is created. If the blog has changed, the next sequential version is persisted.

The rendered timestamp is ignored when checking for duplicate revisions because it can change without representing an editorial content change.

### Restore behavior

Restoring a revision does not overwrite or delete the selected historical version.

For example:

```text
Version 1
Version 2
Version 3

Restore Version 1

Version 1
Version 2
Version 3
Version 4  ← restored state
```

The selected snapshot is copied back into the current `Blog`, and the restored state is immediately stored as a new revision. This keeps the complete history intact and makes the restore operation reversible.

The restore operation also preserves the existing site's author validation and publication webhook behavior.

### Admin API

The feature exposes two admin endpoints:

```text
GET
/api/admin/blogs/[slug]/revisions
```

Returns the saved revisions for the selected blog, newest first.

```text
POST
/api/admin/blogs/[slug]/revisions/[version]/restore
```

Restores the selected revision and creates a new revision containing the restored state.

### Design decisions and tradeoffs

- **Full snapshots instead of field-level diffs:** each revision is independently understandable and can be restored without reconstructing a chain of changes. The tradeoff is additional database storage.
- **Saved versions instead of every keystroke:** this keeps revision history useful without generating a large number of records during editing.
- **Current `Blog` remains the source of truth:** existing publishing and content-delivery behavior does not need to be redesigned around revisions.
- **Restore creates a new version:** historical records remain immutable and restoration itself becomes part of the audit trail.
- **Lazy baseline creation:** existing blogs do not require a migration to start using version history. The first post-feature editor load establishes the baseline.
- **Site-scoped queries:** revisions are always queried using both `blogId` and `siteId` to preserve the CMS's multi-site isolation.

### Testing

The feature includes tests for:

- creating the first revision
- incrementing revision versions
- avoiding duplicate revisions for unchanged content
- ignoring rendered timestamp changes when comparing snapshots
- creating revision snapshots
- creating the initial Version 1 baseline
- avoiding duplicate baselines
- site-scoped revision queries
- restoring a selected revision
- creating a new revision after restoration
- invalid and missing revision restore requests

Run the complete project checks with:

```sh
npm run typecheck
npm test -- --pool=threads --maxWorkers=1 --no-file-parallelism
npm run build
```

### Limitations and future work

- Version history records saved states, not individual editor keystrokes.
- Historical states from before this feature was deployed cannot be reconstructed. Existing blogs receive a baseline when first opened after deployment.
- Deleted blogs are not currently restorable through Version History.
- Revision history currently stores complete snapshots, which uses more storage than a diff-based approach.
- Revision creation could be further hardened against concurrent saves with transactional or atomic version allocation.
- The history UI currently focuses on viewing and restoring revisions; detailed visual diffs between two versions could be added in the future.

## Checks

Run `npm run typecheck`, `npm test`, and `npm run build` sequentially. Unit and integration tests use a separate temporary MongoDB replica set. If its binary is not cached, `mongodb-memory-server` may download one. Report any setup or baseline failure separately from your changes.

For this feature, the stable test command used during development is:

```sh
npm test -- --pool=threads --maxWorkers=1 --no-file-parallelism
```

The complete feature implementation currently passes:

```text
85 test files
434 tests
```

## Boundaries

- Admin routes use a login session and active-site selection. `/api/v1` uses site-scoped keys and exposes published content only.
- Website rendering stays in the consumer; this repository owns editorial UI, content models and publication contracts. See [architecture](docs/ARCHITECTURE.md).
- Local editorial use needs no cloud account or paid service. Optional media and hosted installations use your own resources. See [deployment notes](docs/DEPLOYMENT.md).
- Keep credentials out of the repository. `.env.example` contains placeholders only.

Read [CONTRIBUTING.md](CONTRIBUTING.md) to contribute. The optional [assignment](ASSIGNMENT.md) provides a bounded example contribution; it does not define the scope of the product.

## Community and maintenance

- [Support](SUPPORT.md): questions, bug reports and feature requests.
- [Code of Conduct](CODE_OF_CONDUCT.md): participation and reporting concerns.
- [Security policy](SECURITY.md): private vulnerability reporting and maintenance scope.
- [Changelog](CHANGELOG.md): release status and notable changes.

This is the initial public-source preparation. There are no published stability or long-term support guarantees; review the deployment guide before running an installation with real data.

Licensed under the [MIT License](LICENSE), copyright 2026 Aman Mundra. See [source provenance](PROVENANCE.md) for the project's origins. This source distribution includes no private installation history or customer dataset.

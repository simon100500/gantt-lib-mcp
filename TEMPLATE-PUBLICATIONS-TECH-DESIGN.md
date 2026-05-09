# Template Publications Tech Design

## Goal

Implement a single publication system for public `template` and `block` assets used by both:

- marketplace in the main product;
- SEO site catalog.

This system must use `template_publications` as the source of truth, treat `project` as source only, and avoid any live-project public rendering model.

## Current State

- `templates` is an existing private reusable asset for authenticated users.
- `templates.source_kind` already distinguishes full project vs task selection.
- `packages/site` still uses hardcoded demo templates.
- There is no public snapshot publication layer yet.
- The referenced `packages/server/src/routes/public-template-routes.ts` does not exist in the current tree and should be ignored as an obsolete draft idea.

## Target Model

### Keep existing `templates`

Existing `templates` remains a private user feature:

- save from full project;
- save from selection;
- edit template snapshot;
- insert into project.

It is not the public catalog source.

### Add `template_publications`

New table is the canonical public asset store.

Each row is a fixed snapshot publication produced from a source project or source selection.

Core fields:

- `id`
- `slug`
- `kind`: `template` | `block`
- `source_project_id`
- `source_user_id`
- `source_template_id` nullable
- `source_kind`: `project` | `task_selection`
- `source_selection_task_ids` string[]
- `title`
- `subtitle`
- `summary`
- `category`
- `industry`
- `tags` string[]
- `status`: `draft` | `published` | `archived` | `rejected`
- `visibility`: `private` | `marketplace` | `site` | `both`
- `verification_status`: `unverified` | `reviewed` | `verified` | `editorial`
- `seo_title`
- `seo_description`
- `seo_body`
- `cover_image_url`
- `preview_image_url`
- `snapshot` JSON
- `task_count`
- `published_at`
- `created_at`
- `updated_at`
- `archived_at`

### Snapshot shape

Publication snapshot stores the public immutable graph and project rendering settings:

- `tasks`
- `dependencies`
- `ganttDayMode`
- `calendar`
- `timelineMarkers`

This gives one payload for:

- marketplace preview;
- SEO page build/render;
- create project from template publication;
- insert block publication into current project.

## Design Decisions

### 1. `project` is source only

Public pages and marketplace cards never read live project tasks directly.

Flow:

1. source project evolves;
2. publication snapshot is created or republished;
3. public consumers read publication only.

### 2. One base for marketplace and SEO

Both consumers query the same table with different filters.

Marketplace filter:

- `status = published`
- `visibility in (marketplace, both)`

SEO filter:

- `status = published`
- `visibility in (site, both)`
- `verification_status in (verified, editorial)`

### 3. Support both `template` and `block`

`kind` controls consumption:

- `template`: create new project from publication snapshot;
- `block`: insert into current project from publication snapshot.

### 4. Do not continue live-publication route ideas

No route should expose project-backed public catalog views without going through `template_publications`.

## API Plan

### Internal/Admin publication management

- `POST /api/template-publications/project`
  - create publication from current project
- `POST /api/template-publications/selection`
  - create publication from selected root task ids
- `PATCH /api/template-publications/:publicationId`
  - update metadata/status/visibility/verification
- `POST /api/template-publications/:publicationId/republish`
  - rebuild snapshot from source project/source selection

Initial implementation can guard these with admin access to keep rollout controlled.

### Public catalog API

- `GET /api/public/template-publications`
  - supports `kind`, `visibilityTarget`, `category`, `industry`, `tag`, `verificationStatus`, `query`
- `GET /api/public/template-publications/:slug`
  - returns publication detail

`visibilityTarget` is transport-level and maps to filter presets:

- `marketplace`
- `site`

### Consumption API

- `POST /api/template-publications/:publicationId/create-project`
  - materialize a new project from publication snapshot
- `POST /api/template-publications/:publicationId/insert`
  - insert a published `block` into current project

For first iteration:

- allow `template` in `create-project`
- allow `block` in `insert`
- reject invalid kind with validation error

## Service Plan

Add `TemplatePublicationService` in runtime core.

Responsibilities:

- build snapshot from source project or selection;
- normalize task subtree selection;
- generate slug;
- persist publications;
- list/query public catalog;
- fetch publication by slug or id;
- republish from source;
- create project from snapshot;
- insert block snapshot into project.

Implementation should reuse existing template helper logic where practical, but not couple public catalog behavior to legacy `TemplateService` persistence.

## Migration Plan

### Phase 1

- add Prisma enums and `template_publications` table;
- keep existing `templates` untouched;
- no destructive migration.

### Phase 2

- implement publication service and API;
- enable internal editorial flow first;
- publish seed content from existing source projects manually or via admin endpoints.

### Phase 3

- switch site data loading to publication API or direct SSR fetch from publication table;
- replace hardcoded SEO/demo template sources incrementally.

### Phase 4

- add marketplace UI over publication API;
- later expose self-serve publish flow for non-admin users if needed.

## Compatibility Notes

- Existing private template workflows must keep working.
- Existing site hardcoded demos can coexist temporarily until publication-backed pages are wired.
- No dependency may be switched to local unpublished builds.

## First Implementation Scope

This task should deliver:

- schema + migration for `template_publications`;
- shared types;
- service for create/list/get/republish/consume;
- server routes for admin/internal + public catalog + consumption;
- minimal site integration to read publication-backed catalog data instead of extending hardcoded live project ideas.

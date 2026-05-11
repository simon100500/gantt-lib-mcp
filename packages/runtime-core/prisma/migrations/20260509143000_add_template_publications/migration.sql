-- Create enums
CREATE TYPE "TemplatePublicationKind" AS ENUM ('template', 'block');
CREATE TYPE "TemplatePublicationStatus" AS ENUM ('draft', 'published', 'archived', 'rejected');
CREATE TYPE "TemplatePublicationVisibility" AS ENUM ('private', 'marketplace', 'site', 'both');
CREATE TYPE "TemplatePublicationVerificationStatus" AS ENUM ('unverified', 'reviewed', 'verified', 'editorial');

-- Create table
CREATE TABLE "template_publications" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "kind" "TemplatePublicationKind" NOT NULL,
  "source_project_id" TEXT NOT NULL,
  "source_user_id" TEXT NOT NULL,
  "source_template_id" TEXT,
  "source_kind" "TemplateSourceKind" NOT NULL,
  "source_selection_task_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "title" TEXT NOT NULL,
  "subtitle" TEXT,
  "summary" TEXT,
  "category" TEXT,
  "industry" TEXT,
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "status" "TemplatePublicationStatus" NOT NULL DEFAULT 'draft',
  "visibility" "TemplatePublicationVisibility" NOT NULL DEFAULT 'private',
  "verification_status" "TemplatePublicationVerificationStatus" NOT NULL DEFAULT 'unverified',
  "seo_title" TEXT,
  "seo_description" TEXT,
  "seo_body" TEXT,
  "cover_image_url" TEXT,
  "preview_image_url" TEXT,
  "snapshot" JSONB NOT NULL,
  "task_count" INTEGER NOT NULL DEFAULT 0,
  "published_at" TIMESTAMP(3),
  "archived_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "template_publications_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "template_publications_slug_key" ON "template_publications"("slug");
CREATE INDEX "template_publications_source_project_id_updated_at_idx" ON "template_publications"("source_project_id", "updated_at" DESC);
CREATE INDEX "template_publications_source_user_id_updated_at_idx" ON "template_publications"("source_user_id", "updated_at" DESC);
CREATE INDEX "template_publications_kind_status_visibility_verification_status_idx" ON "template_publications"("kind", "status", "visibility", "verification_status");
CREATE INDEX "template_publications_status_visibility_verification_status_up_idx" ON "template_publications"("status", "visibility", "verification_status", "updated_at" DESC);
CREATE INDEX "template_publications_category_kind_idx" ON "template_publications"("category", "kind");
CREATE INDEX "template_publications_industry_kind_idx" ON "template_publications"("industry", "kind");

-- Foreign keys
ALTER TABLE "template_publications"
  ADD CONSTRAINT "template_publications_source_project_id_fkey"
  FOREIGN KEY ("source_project_id") REFERENCES "projects"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "template_publications"
  ADD CONSTRAINT "template_publications_source_user_id_fkey"
  FOREIGN KEY ("source_user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "template_publications"
  ADD CONSTRAINT "template_publications_source_template_id_fkey"
  FOREIGN KEY ("source_template_id") REFERENCES "templates"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

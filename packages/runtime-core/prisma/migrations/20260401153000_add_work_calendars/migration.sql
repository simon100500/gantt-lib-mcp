-- CreateEnum
CREATE TYPE "CalendarScope" AS ENUM ('system', 'project');

-- CreateEnum
CREATE TYPE "CalendarDayKind" AS ENUM ('working', 'non_working', 'shortened');

-- CreateEnum
CREATE TYPE "CalendarDaySource" AS ENUM ('system_seed', 'manual', 'import');

-- AlterTable
ALTER TABLE "projects"
ADD COLUMN "calendar_id" TEXT;

-- CreateTable
CREATE TABLE "work_calendars" (
    "id" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "scope" "CalendarScope" NOT NULL DEFAULT 'system',
    "timezone" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "project_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_calendars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_days" (
    "id" TEXT NOT NULL,
    "calendar_id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "kind" "CalendarDayKind" NOT NULL,
    "label" TEXT,
    "source" "CalendarDaySource" NOT NULL DEFAULT 'manual',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calendar_days_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "work_calendars_code_key" ON "work_calendars"("code");

-- CreateIndex
CREATE INDEX "work_calendars_scope_idx" ON "work_calendars"("scope");

-- CreateIndex
CREATE INDEX "work_calendars_project_id_idx" ON "work_calendars"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_days_calendar_id_date_key" ON "calendar_days"("calendar_id", "date");

-- CreateIndex
CREATE INDEX "calendar_days_date_idx" ON "calendar_days"("date");

-- CreateIndex
CREATE INDEX "projects_calendar_id_idx" ON "projects"("calendar_id");

-- Seed system default calendar
INSERT INTO "work_calendars" (
    "id",
    "code",
    "name",
    "scope",
    "timezone",
    "is_default"
) VALUES (
    'system-calendar-ru-default',
    'ru-default',
    'Russian Default Working Calendar',
    'system',
    'Europe/Moscow',
    true
);

-- Seed system calendar days
INSERT INTO "calendar_days" ("id", "calendar_id", "date", "kind", "label", "source") VALUES
    ('ru-default-2026-01-01', 'system-calendar-ru-default', '2026-01-01T00:00:00.000Z', 'non_working', 'New Year holiday', 'system_seed'),
    ('ru-default-2026-01-02', 'system-calendar-ru-default', '2026-01-02T00:00:00.000Z', 'non_working', 'New Year holiday', 'system_seed'),
    ('ru-default-2026-01-03', 'system-calendar-ru-default', '2026-01-03T00:00:00.000Z', 'non_working', 'New Year holiday', 'system_seed'),
    ('ru-default-2026-01-04', 'system-calendar-ru-default', '2026-01-04T00:00:00.000Z', 'non_working', 'New Year holiday', 'system_seed'),
    ('ru-default-2026-01-05', 'system-calendar-ru-default', '2026-01-05T00:00:00.000Z', 'non_working', 'New Year holiday', 'system_seed'),
    ('ru-default-2026-01-06', 'system-calendar-ru-default', '2026-01-06T00:00:00.000Z', 'non_working', 'New Year holiday', 'system_seed'),
    ('ru-default-2026-01-07', 'system-calendar-ru-default', '2026-01-07T00:00:00.000Z', 'non_working', 'New Year holiday', 'system_seed'),
    ('ru-default-2026-01-08', 'system-calendar-ru-default', '2026-01-08T00:00:00.000Z', 'non_working', 'New Year holiday', 'system_seed'),
    ('ru-default-2026-02-23', 'system-calendar-ru-default', '2026-02-23T00:00:00.000Z', 'non_working', 'Defender of the Fatherland Day', 'system_seed'),
    ('ru-default-2026-03-08', 'system-calendar-ru-default', '2026-03-08T00:00:00.000Z', 'non_working', 'International Women''s Day', 'system_seed'),
    ('ru-default-2026-05-01', 'system-calendar-ru-default', '2026-05-01T00:00:00.000Z', 'non_working', 'Spring and Labour Day', 'system_seed'),
    ('ru-default-2026-05-09', 'system-calendar-ru-default', '2026-05-09T00:00:00.000Z', 'non_working', 'Victory Day', 'system_seed'),
    ('ru-default-2026-06-12', 'system-calendar-ru-default', '2026-06-12T00:00:00.000Z', 'non_working', 'Russia Day', 'system_seed'),
    ('ru-default-2026-11-04', 'system-calendar-ru-default', '2026-11-04T00:00:00.000Z', 'non_working', 'Unity Day', 'system_seed');

-- Backfill existing projects to the system default calendar
UPDATE "projects"
SET "calendar_id" = 'system-calendar-ru-default'
WHERE "calendar_id" IS NULL;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_calendar_id_fkey" FOREIGN KEY ("calendar_id") REFERENCES "work_calendars"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_calendars" ADD CONSTRAINT "work_calendars_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_days" ADD CONSTRAINT "calendar_days_calendar_id_fkey" FOREIGN KEY ("calendar_id") REFERENCES "work_calendars"("id") ON DELETE CASCADE ON UPDATE CASCADE;

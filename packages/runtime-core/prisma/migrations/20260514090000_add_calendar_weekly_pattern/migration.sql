ALTER TABLE "work_calendars"
  ADD COLUMN "monday_working" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "tuesday_working" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "wednesday_working" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "thursday_working" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "friday_working" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "saturday_working" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "sunday_working" BOOLEAN NOT NULL DEFAULT false;

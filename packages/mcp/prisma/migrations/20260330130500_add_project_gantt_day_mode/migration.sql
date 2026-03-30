CREATE TYPE "GanttDayMode" AS ENUM ('business', 'calendar');

ALTER TABLE "projects"
ADD COLUMN "gantt_day_mode" "GanttDayMode" NOT NULL DEFAULT 'business';

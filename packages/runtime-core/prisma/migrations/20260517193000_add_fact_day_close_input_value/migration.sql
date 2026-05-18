CREATE TYPE "FactInputMode" AS ENUM ('volume', 'percent');

ALTER TABLE "fact_day_close_entries"
  ADD COLUMN "input_mode" "FactInputMode" NOT NULL DEFAULT 'volume',
  ADD COLUMN "value" DOUBLE PRECISION;

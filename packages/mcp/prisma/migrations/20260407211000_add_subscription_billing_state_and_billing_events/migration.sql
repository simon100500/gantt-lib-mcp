DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BillingState') THEN
    CREATE TYPE "BillingState" AS ENUM (
      'free',
      'trial_active',
      'trial_expired',
      'paid_active',
      'paid_expired'
    );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TrialSource') THEN
    CREATE TYPE "TrialSource" AS ENUM (
      'self_serve',
      'admin',
      'promo'
    );
  END IF;
END
$$;

ALTER TABLE "subscriptions"
  ADD COLUMN IF NOT EXISTS "billing_state" "BillingState" NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS "trial_plan" TEXT,
  ADD COLUMN IF NOT EXISTS "trial_started_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "trial_ends_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "trial_ended_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "trial_source" "TrialSource",
  ADD COLUMN IF NOT EXISTS "trial_converted_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "rolled_back_at" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "billing_events" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "actor_type" TEXT NOT NULL,
  "actor_id" TEXT,
  "previous_state" TEXT,
  "new_state" TEXT NOT NULL,
  "reason" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "billing_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "billing_events_user_id_idx" ON "billing_events"("user_id");
CREATE INDEX IF NOT EXISTS "billing_events_created_at_idx" ON "billing_events"("created_at");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'billing_events_user_id_fkey'
  ) THEN
    ALTER TABLE "billing_events"
      ADD CONSTRAINT "billing_events_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END
$$;

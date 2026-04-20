-- CreateTable
CREATE TABLE "usage_counters" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "limit_key" TEXT NOT NULL,
    "period_bucket" TEXT NOT NULL,
    "usage" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usage_counters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "usage_counters_user_id_limit_key_idx" ON "usage_counters"("user_id", "limit_key");

-- CreateIndex
CREATE UNIQUE INDEX "usage_counters_user_id_limit_key_period_bucket_key" ON "usage_counters"("user_id", "limit_key", "period_bucket");

-- AddForeignKey
ALTER TABLE "usage_counters" ADD CONSTRAINT "usage_counters_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

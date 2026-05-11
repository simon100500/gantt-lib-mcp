CREATE TABLE "project_creation_intents" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "user_id" TEXT,
    "template_slug" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),

    CONSTRAINT "project_creation_intents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "project_creation_intents_user_id_idx" ON "project_creation_intents"("user_id");
CREATE INDEX "project_creation_intents_template_slug_idx" ON "project_creation_intents"("template_slug");
CREATE INDEX "project_creation_intents_expires_at_idx" ON "project_creation_intents"("expires_at");
CREATE INDEX "project_creation_intents_consumed_at_idx" ON "project_creation_intents"("consumed_at");

ALTER TABLE "project_creation_intents"
ADD CONSTRAINT "project_creation_intents_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

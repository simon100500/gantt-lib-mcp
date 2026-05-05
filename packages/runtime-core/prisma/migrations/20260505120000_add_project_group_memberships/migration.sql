CREATE TYPE "ProjectGroupMemberRole" AS ENUM ('editor', 'viewer');
CREATE TYPE "ProjectGroupInviteStatus" AS ENUM ('pending', 'accepted', 'revoked', 'expired');

CREATE TABLE "project_group_members" (
  "id" TEXT NOT NULL,
  "group_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "role" "ProjectGroupMemberRole" NOT NULL,
  "invited_by_user_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "project_group_members_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "project_group_invites" (
  "id" TEXT NOT NULL,
  "group_id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "role" "ProjectGroupMemberRole" NOT NULL,
  "token" TEXT NOT NULL,
  "status" "ProjectGroupInviteStatus" NOT NULL DEFAULT 'pending',
  "invited_by_user_id" TEXT,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "accepted_at" TIMESTAMP(3),
  "revoked_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_group_invites_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "project_group_members_group_id_user_id_key" ON "project_group_members"("group_id", "user_id");
CREATE INDEX "project_group_members_user_id_idx" ON "project_group_members"("user_id");
CREATE INDEX "project_group_members_group_id_role_idx" ON "project_group_members"("group_id", "role");
CREATE UNIQUE INDEX "project_group_invites_token_key" ON "project_group_invites"("token");
CREATE INDEX "project_group_invites_email_idx" ON "project_group_invites"("email");
CREATE INDEX "project_group_invites_group_id_status_idx" ON "project_group_invites"("group_id", "status");
CREATE INDEX "project_group_invites_expires_at_idx" ON "project_group_invites"("expires_at");

ALTER TABLE "project_group_members" ADD CONSTRAINT "project_group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "project_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_group_members" ADD CONSTRAINT "project_group_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_group_members" ADD CONSTRAINT "project_group_members_invited_by_user_id_fkey" FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "project_group_invites" ADD CONSTRAINT "project_group_invites_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "project_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_group_invites" ADD CONSTRAINT "project_group_invites_invited_by_user_id_fkey" FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

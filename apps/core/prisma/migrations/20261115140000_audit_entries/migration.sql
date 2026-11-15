-- CreateEnum
CREATE TYPE "AuditTargetType" AS ENUM ('project', 'environment', 'flag', 'targeting');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('create', 'update', 'archive', 'restore', 'delete');

-- CreateTable
CREATE TABLE "audit_entries" (
    "id" SERIAL NOT NULL,
    "project_id" UUID NOT NULL,
    "project_key" TEXT NOT NULL,
    "target_type" "AuditTargetType" NOT NULL,
    "target_id" UUID NOT NULL,
    "flag_id" UUID,
    "flag_key" TEXT,
    "environment_key" TEXT,
    "action" "AuditAction" NOT NULL,
    "actor" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT "audit_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_entries_project_key_id_idx" ON "audit_entries"("project_key", "id");

-- CreateIndex
CREATE INDEX "audit_entries_project_key_flag_key_id_idx" ON "audit_entries"("project_key", "flag_key", "id");

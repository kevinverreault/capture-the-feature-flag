-- CreateTable
CREATE TABLE "evaluation_counts" (
    "environment_id" UUID NOT NULL,
    "flag_id" UUID NOT NULL,
    "variation_index" INTEGER NOT NULL,
    "minute" TIMESTAMPTZ(3) NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "evaluation_counts_pkey" PRIMARY KEY ("environment_id","flag_id","variation_index","minute")
);

-- CreateTable
CREATE TABLE "seen_contexts" (
    "id" UUID NOT NULL,
    "environment_id" UUID NOT NULL,
    "context_key" TEXT NOT NULL,
    "user_id" TEXT,
    "country" TEXT,
    "last_seen" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "seen_contexts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "metric_retention_days" INTEGER NOT NULL DEFAULT 30,
    "seen_context_retention_days" INTEGER NOT NULL DEFAULT 30,
    "seen_context_cap" INTEGER NOT NULL DEFAULT 1000,
    "stale_flag_threshold_days" INTEGER NOT NULL DEFAULT 7,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "evaluation_counts_minute_idx" ON "evaluation_counts"("minute");

-- CreateIndex
CREATE INDEX "seen_contexts_environment_id_last_seen_idx" ON "seen_contexts"("environment_id", "last_seen");

-- CreateIndex
CREATE INDEX "seen_contexts_last_seen_idx" ON "seen_contexts"("last_seen");

-- CreateIndex
CREATE UNIQUE INDEX "seen_contexts_environment_id_context_key_key" ON "seen_contexts"("environment_id", "context_key");

-- AddForeignKey
ALTER TABLE "evaluation_counts" ADD CONSTRAINT "evaluation_counts_environment_id_fkey" FOREIGN KEY ("environment_id") REFERENCES "environments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_counts" ADD CONSTRAINT "evaluation_counts_flag_id_fkey" FOREIGN KEY ("flag_id") REFERENCES "flags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seen_contexts" ADD CONSTRAINT "seen_contexts_environment_id_fkey" FOREIGN KEY ("environment_id") REFERENCES "environments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The single settings row, with the defaults.
INSERT INTO "settings" ("id") VALUES (1);

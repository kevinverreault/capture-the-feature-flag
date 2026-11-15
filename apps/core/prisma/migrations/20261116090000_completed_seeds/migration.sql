-- CreateTable
CREATE TABLE "completed_seeds" (
    "name" TEXT NOT NULL,
    "completed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "completed_seeds_pkey" PRIMARY KEY ("name")
);

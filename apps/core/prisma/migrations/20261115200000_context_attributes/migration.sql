-- CreateEnum
CREATE TYPE "ContextAttributeType" AS ENUM ('string', 'country_code');

-- CreateTable
CREATE TABLE "context_attributes" (
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ContextAttributeType" NOT NULL,
    "description" TEXT NOT NULL,
    "built_in" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL,

    CONSTRAINT "context_attributes_pkey" PRIMARY KEY ("key")
);

-- The built-in context attributes.
INSERT INTO "context_attributes" ("key", "name", "type", "description", "built_in", "position") VALUES
    ('user_id', 'User ID', 'string', 'Identifies whoever the flag is evaluated for. Any non-empty string; individual targets list these.', true, 1),
    ('country', 'Country', 'country_code', 'Where they are, as an ISO 3166-1 alpha-2 code such as CA. Compared in uppercase.', true, 2);

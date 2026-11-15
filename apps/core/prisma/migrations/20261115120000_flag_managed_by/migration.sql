-- CreateEnum
CREATE TYPE "ManagedBy" AS ENUM ('terraform');

-- AlterTable
ALTER TABLE "flags" ADD COLUMN     "managed_by" "ManagedBy";

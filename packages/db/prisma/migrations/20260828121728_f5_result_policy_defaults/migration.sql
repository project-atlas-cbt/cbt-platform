-- CreateEnum
CREATE TYPE "ResultPolicy" AS ENUM ('TEACHER', 'SCHOOL_ADMIN', 'AUTOMATIC');

-- CreateEnum
CREATE TYPE "ResultDetailVisibility" AS ENUM ('SCORE_ONLY', 'SCORE_AND_COUNTS', 'FULL_REVIEW');

-- AlterTable
ALTER TABLE "schools" ADD COLUMN     "result_detail_visibility" "ResultDetailVisibility" NOT NULL DEFAULT 'SCORE_AND_COUNTS',
ADD COLUMN     "result_policy" "ResultPolicy" NOT NULL DEFAULT 'SCHOOL_ADMIN',
ADD COLUMN     "result_policy_locked" BOOLEAN NOT NULL DEFAULT false;

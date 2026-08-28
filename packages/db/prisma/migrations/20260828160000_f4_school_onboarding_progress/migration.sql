-- AlterTable
ALTER TABLE "schools" ADD COLUMN     "onboarding_completed_at" TIMESTAMPTZ(6),
ADD COLUMN     "onboarding_state" JSONB;

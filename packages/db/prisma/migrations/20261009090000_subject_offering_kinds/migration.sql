-- ADR-0038: offering kinds and subject choice groups. Expand-only. Every
-- existing offering becomes COMPULSORY, which is exactly today's behaviour
-- (every student in the class is registered), so nothing changes for a
-- school until it marks an offering ELECTIVE.
CREATE TYPE "ClassSubjectKind" AS ENUM ('COMPULSORY', 'ELECTIVE');

ALTER TABLE "class_subjects" ADD COLUMN "kind" "ClassSubjectKind" NOT NULL DEFAULT 'COMPULSORY';

CREATE TABLE "subject_choice_groups" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "school_id" UUID NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "min_choices" INTEGER NOT NULL,
    "max_choices" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "subject_choice_groups_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "subject_choice_groups_choices_check" CHECK ("min_choices" >= 0 AND "max_choices" >= 1 AND "min_choices" <= "max_choices")
);

CREATE INDEX "subject_choice_groups_school_id_idx" ON "subject_choice_groups"("school_id");
CREATE UNIQUE INDEX "subject_choice_groups_school_id_id_key" ON "subject_choice_groups"("school_id", "id");
CREATE UNIQUE INDEX "subject_choice_groups_school_id_name_key" ON "subject_choice_groups"("school_id", "name");

ALTER TABLE "subject_choice_groups" ADD CONSTRAINT "subject_choice_groups_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "subjects" ADD COLUMN "choice_group_id" UUID;
CREATE INDEX "subjects_school_id_choice_group_id_idx" ON "subjects"("school_id", "choice_group_id");
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_school_id_choice_group_id_fkey" FOREIGN KEY ("school_id", "choice_group_id") REFERENCES "subject_choice_groups"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "subject_choice_groups" ENABLE ROW LEVEL SECURITY; ALTER TABLE "subject_choice_groups" FORCE ROW LEVEL SECURITY;
CREATE POLICY "subject_choice_groups_isolation" ON "subject_choice_groups" USING (school_id::text = current_setting('app.current_school_id', true));

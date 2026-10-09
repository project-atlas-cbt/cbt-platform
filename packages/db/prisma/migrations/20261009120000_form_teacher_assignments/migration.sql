-- ADR-0038 amendment (2026-10-09): form teachers. Expand-only: a new table,
-- nothing existing changes.
CREATE TABLE "form_teacher_assignments" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "school_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "teacher_profile_id" UUID NOT NULL,
    "status" "TeacherAssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "start_date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "end_date" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "form_teacher_assignments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "form_teacher_assignments_school_id_idx" ON "form_teacher_assignments"("school_id");
CREATE INDEX "form_teacher_assignments_school_id_class_id_idx" ON "form_teacher_assignments"("school_id", "class_id");
CREATE INDEX "form_teacher_assignments_school_id_teacher_profile_id_idx" ON "form_teacher_assignments"("school_id", "teacher_profile_id");

-- At most one ACTIVE row per (class, teacher); an ended pair can be re-added.
CREATE UNIQUE INDEX "form_teacher_assignments_one_active_per_pair"
    ON "form_teacher_assignments"("school_id", "class_id", "teacher_profile_id")
    WHERE "status" = 'ACTIVE';

ALTER TABLE "form_teacher_assignments" ADD CONSTRAINT "form_teacher_assignments_school_id_class_id_fkey" FOREIGN KEY ("school_id", "class_id") REFERENCES "class_groups"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "form_teacher_assignments" ADD CONSTRAINT "form_teacher_assignments_school_id_teacher_profile_id_fkey" FOREIGN KEY ("school_id", "teacher_profile_id") REFERENCES "teacher_profiles"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "form_teacher_assignments" ENABLE ROW LEVEL SECURITY; ALTER TABLE "form_teacher_assignments" FORCE ROW LEVEL SECURITY;
CREATE POLICY "form_teacher_assignments_isolation" ON "form_teacher_assignments" USING (school_id::text = current_setting('app.current_school_id', true));

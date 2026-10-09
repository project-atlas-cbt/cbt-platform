-- ADR-0038: student streams, separate from teaching departments. Expand-only.
-- Classes stop carrying a department (class_groups.department_id is left in
-- place, no longer written or read, for a later contract release to drop);
-- each department a class used becomes a stream of the same name, which that
-- class takes as its default stream and its enrollments take as their stream.

-- A data step that RLS would silently filter must fail loudly instead.
SET row_security = off;

CREATE TYPE "StreamStatus" AS ENUM ('ACTIVE', 'INACTIVE');

CREATE TABLE "streams" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "school_id" UUID NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "code" VARCHAR(16) NOT NULL,
    "status" "StreamStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "streams_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "streams_school_id_idx" ON "streams"("school_id");
CREATE UNIQUE INDEX "streams_school_id_id_key" ON "streams"("school_id", "id");
CREATE UNIQUE INDEX "streams_school_id_code_key" ON "streams"("school_id", "code");
CREATE UNIQUE INDEX "streams_school_id_name_key" ON "streams"("school_id", "name");
ALTER TABLE "streams" ADD CONSTRAINT "streams_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- An ELECTIVE offering's automatic streams ("Physics for Science").
CREATE TABLE "class_subject_streams" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "school_id" UUID NOT NULL,
    "class_subject_id" UUID NOT NULL,
    "stream_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "class_subject_streams_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "class_subject_streams_school_id_idx" ON "class_subject_streams"("school_id");
CREATE INDEX "class_subject_streams_school_id_stream_id_idx" ON "class_subject_streams"("school_id", "stream_id");
CREATE UNIQUE INDEX "class_subject_streams_school_id_class_subject_id_stream_id_key" ON "class_subject_streams"("school_id", "class_subject_id", "stream_id");
ALTER TABLE "class_subject_streams" ADD CONSTRAINT "class_subject_streams_school_id_class_subject_id_fkey" FOREIGN KEY ("school_id", "class_subject_id") REFERENCES "class_subjects"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "class_subject_streams" ADD CONSTRAINT "class_subject_streams_school_id_stream_id_fkey" FOREIGN KEY ("school_id", "stream_id") REFERENCES "streams"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "class_groups" ADD COLUMN "default_stream_id" UUID;
CREATE INDEX "class_groups_school_id_default_stream_id_idx" ON "class_groups"("school_id", "default_stream_id");
ALTER TABLE "class_groups" ADD CONSTRAINT "class_groups_school_id_default_stream_id_fkey" FOREIGN KEY ("school_id", "default_stream_id") REFERENCES "streams"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "student_enrollments" ADD COLUMN "stream_id" UUID;
CREATE INDEX "student_enrollments_school_id_stream_id_idx" ON "student_enrollments"("school_id", "stream_id");
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_school_id_stream_id_fkey" FOREIGN KEY ("school_id", "stream_id") REFERENCES "streams"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "rollover_class_drafts" ADD COLUMN "default_stream_id" UUID;
ALTER TABLE "rollover_class_drafts" ADD CONSTRAINT "rollover_class_drafts_default_stream_fkey" FOREIGN KEY ("school_id", "default_stream_id") REFERENCES "streams"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: one stream per department that any class (or open rollover draft)
-- uses, same name and code.
INSERT INTO "streams" ("school_id", "name", "code", "status", "updated_at")
SELECT DISTINCT d."school_id", d."name", d."code", 'ACTIVE'::"StreamStatus", CURRENT_TIMESTAMP
FROM "departments" d
WHERE EXISTS (
    SELECT 1 FROM "class_groups" c
    WHERE c."school_id" = d."school_id" AND c."department_id" = d."id"
) OR EXISTS (
    SELECT 1 FROM "rollover_class_drafts" r
    WHERE r."school_id" = d."school_id" AND r."department_id" = d."id"
);

UPDATE "class_groups" c
SET "default_stream_id" = s."id"
FROM "departments" d
JOIN "streams" s ON s."school_id" = d."school_id" AND s."code" = d."code"
WHERE c."school_id" = d."school_id" AND c."department_id" = d."id";

UPDATE "rollover_class_drafts" r
SET "default_stream_id" = s."id"
FROM "departments" d
JOIN "streams" s ON s."school_id" = d."school_id" AND s."code" = d."code"
WHERE r."school_id" = d."school_id" AND r."department_id" = d."id";

UPDATE "student_enrollments" e
SET "stream_id" = c."default_stream_id"
FROM "class_groups" c
WHERE e."school_id" = c."school_id" AND e."class_id" = c."id" AND c."default_stream_id" IS NOT NULL;

RESET row_security;

ALTER TABLE "streams" ENABLE ROW LEVEL SECURITY; ALTER TABLE "streams" FORCE ROW LEVEL SECURITY;
CREATE POLICY "streams_isolation" ON "streams" USING (school_id::text = current_setting('app.current_school_id', true));

ALTER TABLE "class_subject_streams" ENABLE ROW LEVEL SECURITY; ALTER TABLE "class_subject_streams" FORCE ROW LEVEL SECURITY;
CREATE POLICY "class_subject_streams_isolation" ON "class_subject_streams" USING (school_id::text = current_setting('app.current_school_id', true));

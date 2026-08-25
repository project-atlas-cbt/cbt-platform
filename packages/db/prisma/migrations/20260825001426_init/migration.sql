-- CreateTable
CREATE TABLE "schools" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "name" TEXT NOT NULL,
    "subdomain" VARCHAR(63) NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Lagos',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "schools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenancy_probes" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "school_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenancy_probes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenancy_probe_children" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "school_id" UUID NOT NULL,
    "probe_id" UUID NOT NULL,
    "note" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenancy_probe_children_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "schools_subdomain_key" ON "schools"("subdomain");

-- CreateIndex
CREATE INDEX "tenancy_probes_school_id_idx" ON "tenancy_probes"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "tenancy_probes_school_id_id_key" ON "tenancy_probes"("school_id", "id");

-- CreateIndex
CREATE INDEX "tenancy_probe_children_school_id_idx" ON "tenancy_probe_children"("school_id");

-- AddForeignKey
ALTER TABLE "tenancy_probes" ADD CONSTRAINT "tenancy_probes_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenancy_probe_children" ADD CONSTRAINT "tenancy_probe_children_school_id_probe_id_fkey" FOREIGN KEY ("school_id", "probe_id") REFERENCES "tenancy_probes"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

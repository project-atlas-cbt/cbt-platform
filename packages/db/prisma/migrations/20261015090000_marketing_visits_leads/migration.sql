-- ADR-0034 amendment (owner decision 2026-10-15): marketing site visits and
-- the contacts people choose to leave there, for the Software Admin panel.
-- Expand-only: two new platform-scoped tables and one new enum.
CREATE TYPE "MarketingLeadKind" AS ENUM ('DEMO_REQUEST', 'CALL_BACK');

CREATE TABLE "marketing_page_views" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "path" VARCHAR(200) NOT NULL,
    "source" VARCHAR(60),
    "referrer_host" VARCHAR(120),
    "device" VARCHAR(10) NOT NULL,
    "visitor_key" VARCHAR(64) NOT NULL,

    CONSTRAINT "marketing_page_views_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "marketing_page_views_occurred_at_idx" ON "marketing_page_views"("occurred_at");
CREATE INDEX "marketing_page_views_visitor_key_idx" ON "marketing_page_views"("visitor_key");

CREATE TABLE "marketing_leads" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" "MarketingLeadKind" NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "phone" VARCHAR(24) NOT NULL,
    "email" VARCHAR(160),
    "school" VARCHAR(160),
    "role" VARCHAR(60),
    "state" VARCHAR(60),
    "students" VARCHAR(30),
    "interest" VARCHAR(30),
    "message" TEXT,
    "pages_viewed" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "source" VARCHAR(60),

    CONSTRAINT "marketing_leads_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "marketing_leads_created_at_idx" ON "marketing_leads"("created_at");

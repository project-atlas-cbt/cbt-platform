Project Name:
ExamKeep (decided 2026-10-04). "Project Atlas" was the temporary codename and survives only in internal identifiers (`@atlas/*` packages, `atlas_*` database roles, the repository name), which stay as they are.

The product name is never hardcoded anywhere in the codebase. It is read from the `PRODUCT_NAME` environment variable (`NEXT_PUBLIC_PRODUCT_NAME` in the browser), so a lint rule rejects a literal product name in code.

Commercial Name:
ExamKeep

Owner:
MushakTech Ventures

Repository:
github.com/project-atlas-cbt/cbt-platform

Domain:
examkeep.com (marketing site on the root domain, one subdomain per school)

Purpose:
Multi-tenant CBT platform for secondary schools in Nigeria.

Status:
Implementation in progress. See CLAUDE.md "Project Status" for the current phase and CHANGE-LOG.md for what has shipped.

Stack:
TypeScript
NestJS
Next.js
PostgreSQL
Prisma
Redis
BullMQ
S3

ENVIRONMENTS
Local
Development
Staging
Production

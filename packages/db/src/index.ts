export { prisma, createPrismaClient, PrismaClient, Prisma } from './client.js';
export { withTenant, TENANT_SESSION_VARIABLE, InvalidTenantContextError } from './tenancy.js';
export { grantAppRole, grantAuditReaderRole } from './grants.js';
export {
  ACADEMIC_EVIDENCE_TABLES,
  APPEND_ONLY_TABLES,
  NO_DELETE_TABLES,
  NO_WRITE_TABLES,
  NO_ACCESS_TABLES,
  RETENTION_PROTECTED_TABLES,
  appRoleRevokeStatements,
  type ProtectedTable,
} from './privileges.js';

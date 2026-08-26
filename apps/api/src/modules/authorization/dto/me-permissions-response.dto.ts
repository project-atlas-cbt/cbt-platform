import { ApiProperty } from '@nestjs/swagger';
import {
  ROLES,
  SCOPE_PREDICATES,
  type PermissionAction,
  type Role,
  type ScopePredicate,
} from '@atlas/domain';

export class EffectivePermissionDto {
  @ApiProperty({ type: String, description: 'PERMISSION_TABLE row id (@atlas/domain).' })
  resource!: string;

  @ApiProperty({ type: String })
  section!: string;

  @ApiProperty({
    type: String,
    description: 'Human-readable label, traceable to docs/02-roles-permissions.md.',
  })
  label!: string;

  @ApiProperty({ type: String, enum: ['CREATE', 'READ', 'UPDATE', 'DELETE', 'EXECUTE'] })
  action!: PermissionAction;

  @ApiProperty({
    type: String,
    enum: SCOPE_PREDICATES,
    required: false,
    description: 'Absent when this capability is only reachable via break-glass (breakGlass=true).',
  })
  scope?: ScopePredicate;

  @ApiProperty({
    type: Boolean,
    required: false,
    description:
      'ADR-0012: reachable only through the audited break-glass path, never an ordinary grant.',
  })
  breakGlass?: boolean;
}

/**
 * B2 API work: "the effective capability set for the current user in the
 * current school, so the frontend can hide what the user cannot do." The
 * frontend hiding a control is a usability affordance, never a security
 * control — the server enforces independently via PermissionGuard on
 * every actual route (backend-roadmap.md's B2 section, verbatim).
 */
export class MePermissionsResponseDto {
  @ApiProperty({ type: String, isArray: true, enum: ROLES })
  roles!: Role[];

  @ApiProperty({ type: EffectivePermissionDto, isArray: true })
  permissions!: EffectivePermissionDto[];
}

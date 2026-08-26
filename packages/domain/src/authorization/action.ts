/**
 * The closed action vocabulary A-03 recommends crossing the scope
 * predicates with. `02`'s matrix rows are already action-shaped ("Create
 * question", "Approve question", "View exam results") — each row maps to
 * exactly one of these five.
 */
export const PERMISSION_ACTIONS = ['CREATE', 'READ', 'UPDATE', 'DELETE', 'EXECUTE'] as const;

export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

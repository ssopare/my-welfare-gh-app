// §13.1: Permission = (resource, action, scope). Stored as a JSON array on
// Role rather than a normalized catalog table — see the schema comment on
// Role for why (the action vocabulary is open-ended and parameterized,
// e.g. approve_stage:<n>).
export interface Permission {
  resource: string;
  action: string;
  scope: 'own' | 'chapter' | 'organisation';
}

// What a caller passes to RbacService.hasPermission so scope can actually
// be checked against something. The rule (see hasPermission): 'organisation'
// always matches; 'own' matches only if targetMemberId is supplied and
// equals the actor; 'chapter' matches only if targetChapterId is supplied
// and equals the *assignment's* chapterId (not the actor's own chapter —
// a Convener's grant is scoped to the chapter their RoleAssignment names,
// same as "the same person can be Convener for one chapter and an
// ordinary Member everywhere else" from the RoleAssignment schema comment).
// Omitting a field — or the whole context — means only 'organisation'-
// scoped permissions can satisfy the check, which is what makes an
// unscoped call (e.g. "list every claim in the org") correctly require
// org-wide access rather than silently being satisfiable by a narrower
// chapter/own-scoped grant that has no single target to check against.
export interface PermissionContext {
  targetMemberId?: string;
  targetChapterId?: string;
}

// What "requireAdmin" actually checks for now: a role holding blanket
// access, exactly matching the old Member.role === 'ADMIN' placeholder's
// behavior, but as a real, live, revocable grant instead of a static
// field. '*' matches any resource/action in RbacService.hasPermission.
export const WILDCARD_ADMIN_PERMISSION: Permission = {
  resource: '*',
  action: '*',
  scope: 'organisation',
};

// §13.2's illustrative matrix, seeded per-tenant at registration
// (RbacService.seedStarterRolesInTx) so a fresh org has real roles to
// assign from day one. isTemplate is informational only — a tenant is
// free to clone or diverge from any of these without a code change.
//
// claim.approve is deliberately flat, not the spec's illustrative
// approve_stage:<n> per-stage form: BenefitRule.approvalChain is a
// tenant-defined, free-form array of stage-name strings, so there is no
// fixed vocabulary (like "committee"/"final") a starter template could
// name in advance that would reliably match an arbitrary tenant's chosen
// stage names. Phase 1's own scope is explicitly "a simple 1-2 stage
// approval chain" (full sequential/parallel/threshold routing, FR-CLM-06,
// is deferred) — ClaimService checks this one permission uniformly at
// every stage rather than differentiating who may approve *which* stage.
// ledger.co_sign_disbursement has no enforcement point yet — Disbursement
// Authorization (§12.5) is deferred to Phase 2.
export const STARTER_ROLE_TEMPLATES: {
  name: string;
  permissions: Permission[];
}[] = [
  {
    name: 'Org Admin',
    permissions: [WILDCARD_ADMIN_PERMISSION],
  },
  {
    name: 'Treasurer',
    permissions: [
      {
        resource: 'contribution_plan',
        action: 'create',
        scope: 'organisation',
      },
      {
        resource: 'contribution_plan',
        action: 'activate',
        scope: 'organisation',
      },
      { resource: 'benefit_rule', action: 'create', scope: 'organisation' },
      { resource: 'benefit_rule', action: 'activate', scope: 'organisation' },
      { resource: 'claim', action: 'approve', scope: 'organisation' },
      { resource: 'ledger', action: 'disburse', scope: 'organisation' },
      { resource: 'ledger', action: 'view', scope: 'organisation' },
      { resource: 'member', action: 'view_financial', scope: 'organisation' },
      { resource: 'audit', action: 'export', scope: 'organisation' },
    ],
  },
  {
    name: 'Committee Chair',
    permissions: [
      {
        resource: 'contribution_plan',
        action: 'create',
        scope: 'organisation',
      },
      { resource: 'benefit_rule', action: 'create', scope: 'organisation' },
      { resource: 'claim', action: 'approve', scope: 'organisation' },
      { resource: 'member', action: 'view', scope: 'organisation' },
    ],
  },
  {
    name: 'Convener',
    permissions: [
      { resource: 'claim', action: 'approve', scope: 'chapter' },
      { resource: 'member', action: 'view', scope: 'chapter' },
    ],
  },
  {
    name: 'Patron',
    permissions: [
      { resource: 'claim', action: 'approve', scope: 'organisation' },
      {
        resource: 'ledger',
        action: 'co_sign_disbursement',
        scope: 'organisation',
      },
      { resource: 'member', action: 'view', scope: 'organisation' },
    ],
  },
  {
    name: 'Auditor',
    permissions: [
      { resource: 'claim', action: 'view', scope: 'organisation' },
      { resource: 'member', action: 'view', scope: 'organisation' },
      { resource: 'ledger', action: 'view', scope: 'organisation' },
      { resource: 'audit', action: 'export', scope: 'organisation' },
    ],
  },
  {
    name: 'Member',
    permissions: [
      { resource: 'claim', action: 'view', scope: 'own' },
      { resource: 'claim', action: 'create', scope: 'own' },
      { resource: 'member', action: 'view', scope: 'own' },
    ],
  },
];

// Entity and response-shape types shared between apps/api and apps/admin.
// Hand-written to mirror the actual Prisma models/DTO response shapes in
// apps/api, not generated — kept in sync manually as the API evolves. A
// future API contract change becomes a compile-time error in the admin
// console, not a silent drift discovered after deploy. Populated
// incrementally, milestone by milestone, as the admin console actually
// consumes each shape — not speculatively ahead of what's used.

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export interface AccessTokenResponse {
  accessToken: string;
}

// The decoded JWT payload, as returned by GET /auth/me.
export interface AuthIdentity {
  sub: string; // Account id
  memberId: string;
  organisationId: string;
  role: "ADMIN" | "MEMBER";
}

// One entry per organisation the caller's account belongs to, as returned
// by GET /auth/organisations — feeds a "switch organisation" picker.
export interface MyOrganisationMembership {
  organisationId: string;
  legalName: string;
  role: "ADMIN" | "MEMBER";
  status: string;
  isCurrent: boolean;
}

export interface LoginInput {
  phoneNumber: string;
  password: string;
  organisationId?: string;
}

export interface RegisterOrganisationInput {
  phoneNumber: string;
  password: string;
  legalName: string;
  organisationType: string;
  // Account-level identity (not per-membership) — carries through every
  // org this Account later joins. See the schema comment on Account.name.
  name: string;
}

// ---------------------------------------------------------------------------
// Organisation
// ---------------------------------------------------------------------------

export interface Organisation {
  id: string;
  legalName: string;
  type: string;
  country: string;
  currency: string;
  status: string;
  paymentAllocationPolicy: string;
  makerCheckerEnabled: boolean;
  // Short, human-shareable alternative to `id` for joining — see the
  // organisation_join_code migration. What an admin should actually hand
  // out to prospective members, not the raw UUID.
  joinCode: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Membership
// ---------------------------------------------------------------------------

export const MEMBER_STATUSES = [
  "PENDING",
  "PROBATION",
  "ACTIVE",
  "GRACE",
  "DEFAULTER",
  "SUSPENDED",
  "EXITED",
  "DECEASED",
] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

export interface MemberStatusChange {
  id: string;
  memberId: string;
  fromStatus: MemberStatus | null;
  toStatus: MemberStatus;
  reason: string | null;
  changedBy: string | null;
  changedAt: string;
}

export const MEMBER_REMOVAL_REQUEST_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "CANCELLED",
] as const;
export type MemberRemovalRequestStatus =
  (typeof MEMBER_REMOVAL_REQUEST_STATUSES)[number];

// A removal (status -> EXITED) proposed by one admin, awaiting confirmation
// from a different admin — only created when the org has
// makerCheckerEnabled on. Member.status is untouched until CONFIRMED.
export interface MemberRemovalRequest {
  id: string;
  memberId: string;
  organisationId: string;
  requestedBy: string;
  requestedByPhoneNumber: string | null;
  reason: string;
  status: MemberRemovalRequestStatus;
  requestedAt: string;
  confirmedBy: string | null;
  confirmedByPhoneNumber: string | null;
  confirmedAt: string | null;
  cancelledBy: string | null;
  cancelledByPhoneNumber: string | null;
  cancelledAt: string | null;
  member: Member;
}

// PATCH /members/:id/status either applies immediately (no maker-checker,
// or any status other than EXITED) or, for a removal under maker-checker,
// queues a request instead — the caller must branch on `outcome`.
export type ChangeStatusResult =
  | { outcome: "applied"; member: Member }
  | { outcome: "pending_confirmation"; removalRequest: MemberRemovalRequest };

export interface Dependant {
  id: string;
  memberId: string;
  relationship: string;
  name: string;
  registeredAt: string;
  confirmed: boolean;
}

export interface Chapter {
  id: string;
  organisationId: string;
  name: string;
  createdAt: string;
}

// GET /members and GET /members/:id both include the account relation
// (select: phoneNumber only) and chapter — phoneNumber is the only
// human-identifying field anywhere in this system, since Member itself
// carries no name (see the admin UI memory's "real backend gaps" note).
export interface Member {
  id: string;
  accountId: string;
  organisationId: string;
  chapterId: string | null;
  category: string;
  joinDate: string;
  status: MemberStatus;
  createdAt: string;
  account: { phoneNumber: string; name: string | null };
  chapter: Chapter | null;
  // What a monthly-plan overpayment beyond every month it could generate
  // (24-month safety cap) parks itself as, ready to be swept into this
  // member's next payment. See recordContributionPaymentInTx.
  creditBalance: string;
}

export interface MemberDetail extends Member {
  dependants: Dependant[];
  statusChanges: MemberStatusChange[];
}

// ---------------------------------------------------------------------------
// Rule engine — contribution plans & benefit rules (GET/POST
// /contribution-plans, /benefit-rules)
// ---------------------------------------------------------------------------

export const RULE_STATUSES = ["DRAFT", "ACTIVE", "SUPERSEDED", "REJECTED"] as const;
export type RuleStatus = (typeof RULE_STATUSES)[number];

export interface ContributionPlan {
  id: string;
  organisationId: string;
  chapterId: string | null;
  name: string;
  cadence: string;
  computationType: string;
  amountValue: string;
  currency: string;
  collectionMechanism: string;
  // Which Fund a payment against this plan should default to — a
  // suggestion the record-payment picker pre-selects, not a hard
  // constraint. Null means no default is configured yet.
  defaultFundId: string | null;
  joiningGracePeriodDays: number | null;
  paymentGracePeriodDays: number | null;
  reinstatementWaitingPeriodMonths: number | null;
  reminderDaysBeforeDue: number | null;
  minTenureMonths: number | null;
  goodStandingRequired: boolean;
  status: RuleStatus;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  supersedesId: string | null;
  createdBy: string;
  approvedBy: string | null;
  createdAt: string;
}

export interface CreateContributionPlanInput {
  name: string;
  cadence: string;
  amountValue: string;
  currency: string;
  computationType?: string;
  collectionMechanism?: string;
  defaultFundId?: string;
  minTenureMonths?: number;
  goodStandingRequired?: boolean;
  joiningGracePeriodDays?: number;
  paymentGracePeriodDays?: number;
  reinstatementWaitingPeriodMonths?: number;
  reminderDaysBeforeDue?: number;
  chapterId?: string;
  supersedesId?: string;
}

export interface BenefitRule {
  id: string;
  organisationId: string;
  chapterId: string | null;
  name: string;
  triggerEvent: string;
  subjectTypes: string[];
  amountValue: string;
  currency: string;
  occurrenceCapScope: string;
  occurrenceCapMax: number;
  minTenureMonths: number | null;
  goodStandingRequired: boolean;
  maxConsecutiveMissedPeriods: number | null;
  evidenceRequired: string[];
  approvalChain: string[];
  status: RuleStatus;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  supersedesId: string | null;
  createdBy: string;
  approvedBy: string | null;
  createdAt: string;
}

export interface CreateBenefitRuleInput {
  name: string;
  triggerEvent: string;
  subjectTypes: string[];
  amountValue: string;
  currency: string;
  occurrenceCapScope?: string;
  occurrenceCapMax: number;
  minTenureMonths?: number;
  goodStandingRequired?: boolean;
  maxConsecutiveMissedPeriods?: number;
  evidenceRequired?: string[];
  approvalChain?: string[];
  chapterId?: string;
  supersedesId?: string;
}

// FR-RULE-05's explainable trace — the payoff of the whole rule engine:
// every eligibility determination is a list of named, pass/fail checks,
// never just a boolean.
export interface EligibilityCheck {
  description: string;
  passed: boolean;
  detail: string;
}

export interface EligibilityResult {
  eligible: boolean;
  checks: EligibilityCheck[];
  amount?: { value: string; currency: string };
}

export interface ObligationComputation {
  planId: string;
  memberId: string;
  periodDate: string;
  amount: string;
  currency: string;
}

// ---------------------------------------------------------------------------
// Ledger — funds, journal entries, obligations, payments, reconciliation
// ---------------------------------------------------------------------------

export const LEDGER_ACCOUNT_TYPES = ["ASSET", "LIABILITY", "INCOME", "EXPENSE", "EQUITY"] as const;
export type LedgerAccountType = (typeof LEDGER_ACCOUNT_TYPES)[number];

export interface LedgerAccount {
  id: string;
  organisationId: string;
  fundId: string;
  memberId: string | null;
  type: LedgerAccountType;
  name: string;
  isAdministrative: boolean;
  createdAt: string;
}

// POST /funds/:id/accounts
export interface CreateLedgerAccountInput {
  name: string;
  type: LedgerAccountType;
  isAdministrative?: boolean;
}

export interface Fund {
  id: string;
  organisationId: string;
  name: string;
  createdAt: string;
  ledgerAccounts: LedgerAccount[];
}

export interface LedgerAccountBalance {
  ledgerAccountId: string;
  type: LedgerAccountType;
  balance: string;
}

export interface JournalLine {
  id: string;
  journalEntryId: string;
  organisationId: string;
  ledgerAccountId: string;
  memberId: string | null;
  obligationId: string | null;
  debit: string;
  credit: string;
}

export interface JournalEntry {
  id: string;
  organisationId: string;
  fundId: string;
  description: string;
  sourceType: string | null;
  sourceId: string | null;
  reversalOfId: string | null;
  postedAt: string;
  createdBy: string;
  lines: JournalLine[];
}

export const OBLIGATION_STATUSES = [
  "UPCOMING",
  "DUE",
  "PAID",
  "PARTIALLY_PAID",
  "OVERDUE",
  "DEFAULTED",
  "WAIVED",
  "EXEMPTED",
  "WRITTEN_OFF",
  "CANCELLED",
] as const;
export type ObligationStatus = (typeof OBLIGATION_STATUSES)[number];

export interface Obligation {
  id: string;
  organisationId: string;
  memberId: string;
  contributionPlanId: string;
  dueDate: string;
  amountValue: string;
  currency: string;
  amountPaid: string;
  status: ObligationStatus;
  createdAt: string;
  // Only populated by GET /members/:id/obligations — lets a payment
  // picker tell "always automatic" monthly obligations apart from
  // one-time/event ones. Optional since other, narrower obligation shapes
  // (e.g. MemberStatementObligation) never carry it.
  contributionPlan?: { name: string; cadence: string; defaultFundId: string | null };
}

export const PAYMENT_INTENT_STATUSES = ["INITIATED", "SUCCEEDED", "FAILED"] as const;
export type PaymentIntentStatus = (typeof PAYMENT_INTENT_STATUSES)[number];

export interface RecordContributionPaymentInput {
  memberId: string;
  fundId: string;
  amountValue: string;
  currency: string;
  reference?: string;
  // Required when the org's paymentAllocationPolicy is "member_selected" —
  // which open obligations this payment covers, instead of the default
  // oldest-due-first sweep across everything open.
  obligationIds?: string[];
}

export const IMPLEMENTED_PAYMENT_ALLOCATION_POLICIES = [
  "oldest_first",
  "member_selected",
] as const;
export type PaymentAllocationPolicy =
  (typeof IMPLEMENTED_PAYMENT_ALLOCATION_POLICIES)[number];

export interface UpdateOrganisationSettingsInput {
  paymentAllocationPolicy?: PaymentAllocationPolicy;
}

export interface RecordContributionPaymentResult {
  journalEntry: JournalEntry;
  allocations: { obligationId: string; amount: string }[];
}

// GET /payments/activity — deliberately the one endpoint visible to any
// authenticated member of the org, not just self/admin (reproducing the
// real-world practice of a welfare group posting contribution payments to
// its WhatsApp chat as they land). Sourced from JournalLine, the actual
// append-only record of when money moved — see PaymentService.listActivity.
export interface PaymentActivityEntry {
  credit: string;
  journalEntry: { postedAt: string };
  obligation: {
    dueDate: string;
    contributionPlan: { name: string; cadence: string };
    member: { account: { name: string | null; phoneNumber: string } };
  };
}

// GET /reports/fund-position-trend — 6 month-end running cash balances,
// derived fresh from the ledger each request (see ReportingService).
export interface FundPositionTrendRow {
  month: string;
  balance: string;
}

// GET /reports/contributions-vs-claims — 6 real monthly totals: money
// collected (Contributions Income) vs. money paid out (Benefits Expense),
// derived fresh from the ledger each request (see ReportingService).
export interface ContributionsVsClaimsRow {
  month: string;
  contributions: string;
  claimsPaid: string;
}

// GET /reports/income-expenditure — a formal Income & Expenditure
// Statement, derived fresh from INCOME/EXPENSE ledger accounts each
// request. Fund transfers never appear here (they post against Fund
// Equity, not Income/Expense — see LedgerService.transferBetweenFunds).
export interface IncomeExpenditureLine {
  ledgerAccountId: string;
  accountName: string;
  amount: string;
}

export interface IncomeExpenditureStatement {
  incomeLines: IncomeExpenditureLine[];
  expenseLines: IncomeExpenditureLine[];
  totalIncome: string;
  totalExpense: string;
  surplusOrDeficit: string;
  openingAccumulatedFund: string;
  closingAccumulatedFund: string;
}

// GET /reports/trial-balance — every ledger account's net balance, shown
// on whichever side it actually falls on rather than assumed from its
// type (see ReportingService.trialBalance's comment on why).
export interface TrialBalanceRow {
  ledgerAccountId: string;
  accountName: string;
  accountType: LedgerAccountType;
  fundName: string;
  debitBalance: string;
  creditBalance: string;
}

export interface TrialBalance {
  asOf: string;
  accounts: TrialBalanceRow[];
  totalDebit: string;
  totalCredit: string;
  balanced: boolean;
}

// GET /reports/general-ledger/:ledgerAccountId
export interface GeneralLedgerEntry {
  journalEntryId: string;
  date: string;
  description: string;
  sourceType: string | null;
  isReversal: boolean;
  debit: string;
  credit: string;
  runningBalance: string;
}

export interface GeneralLedgerReport {
  ledgerAccountId: string;
  accountName: string;
  accountType: LedgerAccountType;
  fundName: string;
  openingBalance: string;
  entries: GeneralLedgerEntry[];
  closingBalance: string;
}

// POST /funds/:id/transfer
export interface TransferFundsInput {
  toFundId: string;
  amountValue: string;
  description?: string;
}

// Advanced reporting Phase B — Budget. ledgerAccountId doubles as the
// Income/Expense Category (those categories already exist as real ledger
// accounts — see BudgetService).
export interface Budget {
  id: string;
  organisationId: string;
  ledgerAccountId: string;
  name: string | null;
  periodStart: string;
  periodEnd: string;
  amountValue: string;
  createdBy: string;
  createdAt: string;
}

export interface CreateBudgetInput {
  ledgerAccountId: string;
  name?: string;
  periodStart: string;
  periodEnd: string;
  amountValue: string;
}

export interface BudgetWithActual {
  id: string;
  ledgerAccountId: string;
  accountName: string;
  accountType: LedgerAccountType;
  fundName: string;
  name: string | null;
  periodStart: string;
  periodEnd: string;
  budgeted: string;
  actual: string;
  variance: string;
  variancePercent: string | null;
  status: 'over_budget' | 'on_track' | 'underperforming';
}

// GET /reports/advance-contributions
export interface AdvanceContributionRow {
  memberId: string;
  phoneNumber: string;
  name: string | null;
  creditBalance: string;
  nextObligation: {
    obligationId: string;
    planName: string;
    dueDate: string;
    amountOutstanding: string;
  } | null;
}

// GET /reports/arrears-allocation
export interface ArrearsAllocationRow {
  memberId: string;
  phoneNumber: string | undefined;
  obligationId: string;
  contributionPeriod: string;
  cashCollectionDate: string;
  amount: string;
  daysLate: number;
}

// GET /reports/benefit-expenditure
export interface BenefitExpenditureRow {
  benefitRuleId: string;
  benefitName: string;
  totalPaid: string;
  beneficiaryCount: number;
  averageBenefit: string;
  statusCounts: {
    submitted: number;
    approved: number;
    rejected: number;
    paid: number;
  };
}

export interface BenefitExpenditureAnalytics {
  byBenefitType: BenefitExpenditureRow[];
  totalBenefitsPaid: string;
  totalContributionIncome: string;
  benefitsAsPercentOfIncome: string | null;
}

// GET /reports/financial-health
export interface ManagementRatiosAndHealth {
  from: string;
  to: string;
  collectionRate: string | null;
  arrearsRate: string | null;
  benefitPayoutRatio: string | null;
  fundUtilisationRate: string | null;
  growthRate: string | null;
  expenseRatio: string | null;
  administrativeCostRatio: string | null;
  notAvailable: string | null;
  financialHealth: 'Healthy' | 'Watch' | 'At Risk' | 'Critical';
  reason: string;
}

// GET /reports/cash-flow
export interface CashFlowActivity {
  inflow: string;
  outflow: string;
  net: string;
}

export interface CashFlowStatement {
  fundId: string | null;
  from: string;
  to: string;
  operating: CashFlowActivity;
  financing: CashFlowActivity;
  investing: CashFlowActivity & { note: string };
  openingCash: string;
  closingCash: string;
  netCashMovement: string;
  reconciles: boolean;
}

// GET /reports/fund-position
export interface FundPositionRow {
  fundId: string;
  fundName: string;
  openingFundBalance: string;
  income: string;
  expenses: string;
  transfersIn: string;
  transfersOut: string;
  surplusOrDeficit: string;
  closingFundBalance: string;
  cashAvailable: string;
  payables: string;
}

export interface FundPositionReport {
  from: string;
  to: string;
  funds: FundPositionRow[];
  organisationSummary: {
    totalCashAvailable: string;
    totalCommittedBenefits: string;
    availableUncommittedFunds: string;
    note: string;
  };
}

// GET /reports/reversals
export interface ReversalRow {
  journalEntryId: string;
  postedAt: string;
  description: string;
  sourceType: string | null;
  amount: string;
  originalEntryId: string | null;
  originalDescription: string | null;
  originalPostedAt: string | null;
}

export interface ReversalsAndAdjustments {
  from: string;
  to: string;
  reversals: ReversalRow[];
  grossCollection: string;
  reversalsTotal: string;
  netCollection: string;
}

export interface ReconciliationException {
  id: string;
  organisationId: string;
  providerReference: string;
  reason: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// RBAC — roles, permissions, assignments (§13.1)
// ---------------------------------------------------------------------------

export const PERMISSION_SCOPES = ["own", "chapter", "organisation"] as const;
export type PermissionScope = (typeof PERMISSION_SCOPES)[number];

export interface Permission {
  resource: string;
  action: string;
  scope: PermissionScope;
}

export interface Role {
  id: string;
  organisationId: string;
  name: string;
  isTemplate: boolean;
  permissions: Permission[];
  createdAt: string;
}

export interface CreateRoleInput {
  name: string;
  permissions: Permission[];
}

export interface AssignRoleInput {
  memberId: string;
  chapterId?: string;
  termEnd?: string;
}

export interface RoleAssignment {
  id: string;
  organisationId: string;
  memberId: string;
  roleId: string;
  chapterId: string | null;
  governanceBodyId: string | null;
  termStart: string;
  termEnd: string | null;
  createdAt: string;
  role?: Role;
  member?: Member;
  chapter?: Chapter | null;
}

// ---------------------------------------------------------------------------
// Claims — submission, evidence, multi-stage approval, disbursement (§8.6)
// ---------------------------------------------------------------------------

export const CLAIM_STATUSES = ["SUBMITTED", "APPROVED", "REJECTED", "PAID"] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

export interface ClaimEvidence {
  id: string;
  claimId: string;
  organisationId: string;
  evidenceType: string;
  description: string;
  uploadedBy: string;
  createdAt: string;
}

export interface ClaimStageAction {
  id: string;
  claimId: string;
  organisationId: string;
  stageIndex: number;
  stageName: string;
  actorMemberId: string;
  decision: "APPROVE" | "REJECT";
  comment: string | null;
  decidedAt: string;
}

export interface Claim {
  id: string;
  organisationId: string;
  memberId: string;
  benefitRuleId: string;
  dependantId: string | null;
  submittedBy: string;
  eventDate: string;
  amountValue: string;
  currency: string;
  status: ClaimStatus;
  currentStageIndex: number;
  journalEntryId: string | null;
  createdAt: string;
  evidence: ClaimEvidence[];
  stageActions: ClaimStageAction[];
  // Only present on endpoints that join for display (GET /claims,
  // GET /claims/:id) — never on listForMember, where the caller already
  // knows the member.
  member?: Member;
  benefitRule?: { name: string; triggerEvent: string; approvalChain?: string[] };
}

export interface SubmitClaimInput {
  memberId: string;
  dependantId?: string;
  eventDate: string;
  evidence?: { evidenceType: string; description: string }[];
}

export interface DecideClaimInput {
  decision: "APPROVE" | "REJECT";
  comment?: string;
}

// ---------------------------------------------------------------------------
// Governance — bodies, officer appointments, term limits (§8.3)
// ---------------------------------------------------------------------------

export interface GovernanceBody {
  id: string;
  organisationId: string;
  name: string;
  membershipCompositionRule: string | null;
  quorumRule: string | null;
  tieBreakRule: string | null;
  meetingCadence: string | null;
  maxConsecutiveTerms: number | null;
  coolingOffPeriodMonths: number | null;
  createdAt: string;
}

export interface CreateGovernanceBodyInput {
  name: string;
  membershipCompositionRule?: string;
  quorumRule?: string;
  tieBreakRule?: string;
  meetingCadence?: string;
  maxConsecutiveTerms?: number;
  coolingOffPeriodMonths?: number;
}

export interface AppointOfficerInput {
  memberId: string;
  roleId: string;
  termEnd?: string;
}

// RoleAssignment shape returned by GET /governance-bodies/:id/officers —
// same underlying model as RBAC's RoleAssignment, with member/role always
// joined here (never optional, unlike the generic RoleAssignment type).
export interface GovernanceOfficer {
  id: string;
  organisationId: string;
  memberId: string;
  roleId: string;
  chapterId: string | null;
  governanceBodyId: string | null;
  termStart: string;
  termEnd: string | null;
  createdAt: string;
  role: Role;
  member: Member;
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export const NOTIFICATION_TYPES = [
  "CONTRIBUTION_DUE_REMINDER",
  "DEFAULTER_RISK_ALERT",
  "CLAIM_STAGE_ENTERED",
  "CLAIM_STATUS_CHANGED",
  "SUBSCRIPTION_LAPSED",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface Notification {
  id: string;
  organisationId: string;
  memberId: string;
  type: NotificationType;
  message: string;
  sourceType: string | null;
  sourceId: string | null;
  readAt: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Reporting — the four Phase 1 reports (GET /reports/...)
// ---------------------------------------------------------------------------

export interface ContributionSummaryRow {
  contributionPlanId: string;
  planName: string;
  chapterId: string | null;
  memberCount: number;
  expectedTotal: string;
  collectedTotal: string;
  outstandingTotal: string;
}

// GET /members/:id/statement — a narrower, honest shape rather than reuse
// of Obligation/Claim: this endpoint's obligations/claims queries only
// join contributionPlan.name / benefitRule.name for display, never the
// full evidence/stageActions/account joins those base types require.
export interface MemberStatementObligation {
  id: string;
  organisationId: string;
  memberId: string;
  contributionPlanId: string;
  contributionPlan?: { name: string };
  dueDate: string;
  amountValue: string;
  currency: string;
  amountPaid: string;
  status: ObligationStatus;
  createdAt: string;
}

export interface MemberStatementPayment {
  journalEntryId: string;
  description: string;
  postedAt: string;
  sourceType: string | null;
  debit: string;
  credit: string;
}

export interface MemberStatementClaim {
  id: string;
  memberId: string;
  benefitRuleId: string;
  benefitRule?: { name: string };
  dependantId: string | null;
  eventDate: string;
  amountValue: string;
  currency: string;
  status: ClaimStatus;
  currentStageIndex: number;
  createdAt: string;
}

export interface MemberStatement {
  memberId: string;
  status: MemberStatus;
  joinDate: string;
  chapterId: string | null;
  statusHistory: MemberStatusChange[];
  obligations: MemberStatementObligation[];
  payments: MemberStatementPayment[];
  claims: MemberStatementClaim[];
  paidThroughDate: string | null;
}

export interface DefaulterAgingBuckets {
  days0To30: string;
  days31To60: string;
  days61To90: string;
  days90Plus: string;
}

export interface DefaulterRegisterRow {
  memberId: string;
  phoneNumber?: string;
  status: MemberStatus;
  contributionPlanId: string;
  planName?: string;
  consecutiveMissedCount: number;
  arrearsOwed: string;
  agingBuckets: DefaulterAgingBuckets;
}

// ---------------------------------------------------------------------------
// Defaulter policy (§14, FR-DEF-01/02)
// ---------------------------------------------------------------------------

export interface DefaulterPolicy {
  id: string;
  organisationId: string;
  defaulterThresholdMonths: number;
  forfeitureThresholdMonths: number;
  createdAt: string;
}

export interface SetDefaulterPolicyInput {
  defaulterThresholdMonths: number;
  forfeitureThresholdMonths: number;
}

export interface ClaimApproverTrailEntry {
  stageIndex: number;
  stageName: string;
  actorMemberId: string;
  actorPhoneNumber?: string;
  decision: "APPROVE" | "REJECT";
  decidedAt: string;
  comment: string | null;
}

export interface DisbursementReportRow {
  claimId: string;
  memberId: string;
  phoneNumber: string;
  dependantId: string | null;
  benefitRuleId: string;
  benefitName: string;
  triggerEvent: string;
  amountValue: string;
  currency: string;
  paidAt: string | null;
  journalEntryId: string | null;
  approverTrail: ClaimApproverTrailEntry[];
}

// ---------------------------------------------------------------------------
// Subscription billing
// ---------------------------------------------------------------------------

export const SUBSCRIPTION_STATUSES = [
  "TRIAL",
  "ACTIVE",
  "PAST_DUE",
  "SUSPENDED",
  "CANCELLED",
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export interface SubscriptionPlan {
  id: string;
  name: string;
  priceAmount: string;
  currency: string;
  billingCadence: string;
  trialDays: number;
  archived: boolean;
}

export interface Subscription {
  id: string;
  organisationId: string;
  planId: string | null;
  status: SubscriptionStatus;
  trialEndsAt: string;
  gracePeriodDays: number;
  currentPeriodEnd: string | null;
  cancelledAt: string | null;
  plan?: SubscriptionPlan | null;
}

// ---------------------------------------------------------------------------
// Platform operator — a separate actor from tenant Members entirely, its
// own JWT shape/guard on the API side (PlatformAuthGuard, not
// JwtAuthGuard). Cross-tenant plan/subscription management only; no
// self-registration endpoint exists (see PlatformAuthService).
// ---------------------------------------------------------------------------

export interface PlatformOperatorIdentity {
  id: string;
  email: string;
}

export interface PlatformLoginInput {
  email: string;
  password: string;
}

// organisation is nullable here despite being a required relation in the
// schema — an orphaned Subscription row (its Organisation deleted without
// a cascade) still joins to null rather than disappearing from this list,
// confirmed against this dev database's own accumulated e2e test data.
// Real, not hypothetical: every consumer must handle it.
export interface PlatformSubscriptionRow extends Subscription {
  organisation: { legalName: string } | null;
}

export interface CreateSubscriptionPlanInput {
  name: string;
  priceAmount: string;
  currency: string;
  billingCadence: string;
  trialDays?: number;
}

export interface UpdateSubscriptionStatusInput {
  status: SubscriptionStatus;
  currentPeriodEnd?: string;
}

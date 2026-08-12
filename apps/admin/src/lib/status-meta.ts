import type { ClaimStatus, MemberStatus, ObligationStatus, RuleStatus, SubscriptionStatus } from "@welfare/shared-types";
import type { StatusTone } from "@/components/finance/status-badge";

interface StatusMeta {
  tone: StatusTone;
  label: string;
}

// One mapping per domain enum, kept beside the generic StatusBadge rather
// than inside it — the badge component doesn't need to know what a
// "DEFAULTER" is, only how to render a tone + label.
export const MEMBER_STATUS_META: Record<MemberStatus, StatusMeta> = {
  ACTIVE: { tone: "good", label: "Good standing" },
  PROBATION: { tone: "warn", label: "Probation" },
  GRACE: { tone: "warn", label: "Grace period" },
  PENDING: { tone: "neutral", label: "Pending" },
  DEFAULTER: { tone: "bad", label: "Defaulter" },
  SUSPENDED: { tone: "bad", label: "Suspended" },
  EXITED: { tone: "neutral", label: "Exited" },
  DECEASED: { tone: "neutral", label: "Deceased" },
};

export const RULE_STATUS_META: Record<RuleStatus, StatusMeta> = {
  DRAFT: { tone: "neutral", label: "Draft" },
  ACTIVE: { tone: "good", label: "Active" },
  SUPERSEDED: { tone: "neutral", label: "Superseded" },
  REJECTED: { tone: "bad", label: "Rejected" },
};

export const CLAIM_STATUS_META: Record<ClaimStatus, StatusMeta> = {
  SUBMITTED: { tone: "warn", label: "Awaiting decision" },
  APPROVED: { tone: "good", label: "Approved" },
  REJECTED: { tone: "bad", label: "Rejected" },
  PAID: { tone: "good", label: "Paid" },
};

export const OBLIGATION_STATUS_META: Record<ObligationStatus, StatusMeta> = {
  UPCOMING: { tone: "neutral", label: "Upcoming" },
  DUE: { tone: "warn", label: "Due" },
  PAID: { tone: "good", label: "Paid" },
  PARTIALLY_PAID: { tone: "warn", label: "Partially paid" },
  OVERDUE: { tone: "bad", label: "Overdue" },
  DEFAULTED: { tone: "bad", label: "Defaulted" },
  WAIVED: { tone: "neutral", label: "Waived" },
  EXEMPTED: { tone: "neutral", label: "Exempted" },
  WRITTEN_OFF: { tone: "neutral", label: "Written off" },
  CANCELLED: { tone: "neutral", label: "Cancelled" },
};

export const SUBSCRIPTION_STATUS_META: Record<SubscriptionStatus, StatusMeta> = {
  TRIAL: { tone: "good", label: "Free trial" },
  ACTIVE: { tone: "good", label: "Active" },
  PAST_DUE: { tone: "warn", label: "Payment due" },
  SUSPENDED: { tone: "bad", label: "Suspended" },
  CANCELLED: { tone: "bad", label: "Cancelled" },
};

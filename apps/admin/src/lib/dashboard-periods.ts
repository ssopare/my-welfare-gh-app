// Plain data, deliberately kept out of dashboard-period-filter.tsx (a "use
// client" module) — a server component importing a named export from a
// client module doesn't get the real value back, only a client reference,
// which broke DASHBOARD_PERIODS.some(...) in the dashboard page. Shared
// constants that both a server component and a client component need have
// to live in a plain, directive-free module like this one.
export const DASHBOARD_PERIODS = [
  { value: "this_month", label: "This month" },
  { value: "last_3_months", label: "Last 3 months" },
  { value: "last_6_months", label: "Last 6 months" },
  { value: "year_to_date", label: "Year to date" },
] as const;

export type DashboardPeriodValue = (typeof DASHBOARD_PERIODS)[number]["value"];

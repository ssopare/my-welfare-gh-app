<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Welfare platform notes

Bounded modules per the requirements doc Section 10: identity/tenancy, membership, governance, rule engine, ledger, claims, defaulter/anti-abuse, payments, reporting, RBAC, notifications, audit.

Consumes shared DTOs/types from `../../packages/shared-types`.

### Database / multi-tenancy

Postgres via Prisma, with tenant isolation enforced by real row-level security policies (`prisma/migrations`), not application-level filtering. Two DB roles are involved (see `infra/docker/initdb/01-create-app-role.sh` and `.env.example`):

- `welfare` (or your local Postgres superuser) — runs `prisma migrate dev`/`deploy` only. Superusers always bypass RLS, so this role must never be used for application queries.
- `app_runtime` — a restricted, non-superuser role the app actually connects as (`PrismaService`, `APP_DATABASE_URL`). This is what makes the RLS policies real.

Tenant-scoped queries must go through `PrismaService.withTenant(tenantId, fn)`, which sets the Postgres session variable `app.tenant_id` for that transaction only — the RLS policies key off `current_setting('app.tenant_id')`. Creating a new Organisation goes through `PrismaService.provisionOrganisation(...)` instead of a plain `prisma.organisation.create()` — see the comment on that method and the `simplify_organisation_rls_policy` migration for why.

```bash
cp .env.example .env   # adjust ports/passwords to match your infra/docker/.env
npx prisma migrate dev
npm run test:e2e       # tenant-isolation.e2e-spec.ts proves RLS against a real Postgres, not mocks
```

### Auth (Phase 1)

Phone + password, JWT-based (`JWT_SECRET` — generate your own for `.env`, e.g. `openssl rand -base64 32`; never reuse the dev one committed nowhere but present in your local `.env`). No OTP/SMS — that was a deliberate scope call to avoid an external provider dependency before the rule engine/ledger exist; see the auth-mechanism decision in project memory if revisiting this.

- `POST /auth/register-organisation` — tenant self-registration (FR-ONB-01): creates the founding `Account` + `Organisation` + an `ADMIN` `Member` (status `ACTIVE`, no approval needed — there's no one else yet), all in one step, returns a token.
- `POST /auth/join-organisation` — FR-MEM-09: an existing or brand-new `Account` joins an *existing* `Organisation` as a new `Member` (status `PENDING`). See Membership below for what else this triggers.
- `POST /auth/login` — `{ phoneNumber, password }`; add `organisationId` if the account has more than one Membership (no polished multi-group switcher UI yet — §24.1 defers that to Phase 2, this only has the data model for it).
- `GET /auth/me` (guarded) — returns the decoded token payload (`sub`/accountId, `memberId`, `organisationId`, `role`).

Login needs to discover which Organisation(s) an Account belongs to *before* any tenant context exists — the same bootstrapping problem `provisionOrganisation` solves for tenant creation. Solved the same way: `PrismaService.withAccount(accountId, fn)` sets `app.account_id`, which a second, independent RLS policy on `members` (`own_memberships`) reads — see the `add_member_role_and_account_policy` migration.

### Membership (Phase 1, roadmap slice 2)

Full lifecycle on top of the Phase 0 `Member` skeleton (FR-MEM-01/03/04/07 — see the `membership_lifecycle_dependants_chapters` migration and `src/membership/`):

- `MemberStatus`: `PENDING → PROBATION/ACTIVE → GRACE → DEFAULTER/SUSPENDED → EXITED/DECEASED`. No automatic transitions yet — that's the rule engine's job (roadmap slice 3); this slice only adds the states and an explicit, audited way to move between them.
- `MemberStatusChange` — an append-only audit row for every transition (including the very first one, at registration/join). This slice's contribution to §8.12's "audit is non-negotiable from day one," the same principle RLS followed from Phase 0.
- `Dependant` (FR-MEM-03) — pre-registered, time-stamped beneficiary records. `POST /members/me/dependants` (self), `PATCH /members/me/dependants/:id/confirm`.
- `Chapter` (FR-MEM-04) — optional per-tenant sub-grouping; most tenants won't use it. `POST /chapters`, `PATCH /members/:memberId/chapter` (both admin-only).
- `PATCH /members/:memberId/status` (admin-only) — the audited transition endpoint.
- `GET /members/me` — own membership + dependants + status history + chapter, all in one response.
- FR-MEM-10: joining a *second* organisation prefills that org's `Dependant` records from the account's existing memberships, `confirmed: false` until explicitly re-confirmed there.

"Admin-only" here means `requireAdmin()` in `src/common/access.util.ts` — a real, live RBAC permission check as of roadmap slice 6 (see the RBAC section below), not the placeholder `Member.role === 'ADMIN'` field this originally shipped with.

### Rule engine (Phase 1, roadmap slice 3, §11)

`ContributionPlan` (what a member owes) and `BenefitRule` (what a member/dependant is entitled to on a trigger event) — see `src/rule-engine/`. Deliberately **not** a separate `RuleVersion` wrapper table: the spec's own worked examples (§11.2/§11.3) put `effective_from`/`supersedes`/`created_by`/`approved_by` directly on the rule object itself, so each row here already *is* one immutable version (FR-RULE-02) — an amendment is a new `DRAFT` row with `supersedesId` pointing at the version it replaces, activated via its own endpoint, never an edit.

- `POST /contribution-plans` / `POST /benefit-rules` (admin-only) — create a `DRAFT`.
- `POST .../:id/activate` (admin-only, optional `{ effectiveFrom }`) — `DRAFT → ACTIVE`; if `supersedesId` was set at creation, the predecessor (must currently be `ACTIVE`) transitions to `SUPERSEDED` with `effectiveTo` set to the new version's `effectiveFrom`.
- `POST .../:id/reject` (admin-only) — `DRAFT → REJECTED`, terminal; a draft/rejected rule "stays in that state indefinitely, never auto-activates on a timer" per the spec.
- `GET /contribution-plans` / `GET /benefit-rules` (`?asOf=<ISO date>`, default now) — the `ACTIVE` version in force on that date.
- `POST /contribution-plans/:id/compute-obligation` and `POST /benefit-rules/:id/evaluate-eligibility` (self or admin) — the actual engine. See `RuleEngineService`.

**Scope choices, all deliberate:**
- Fixed amounts only (`computationType: "fixed"`) — the only kind evidenced by the source constitutions' worked examples. Anything else throws `NotImplementedException` rather than silently mis-computing.
- Eligibility explanation is FR-RULE-05's actual requirement, not an afterthought: `evaluateBenefitEligibility` returns `{ eligible, checks: [{ description, passed, detail }], amount? }`, and the good-standing check reads the member's status **as it stood on the event date** from `MemberStatusChange` (slice 2's audit trail) — not today's current status. §11.1: "eligibility is evaluated against ... the rule version in force on [the event] date, never against whichever date happens to be convenient."
- `occurrenceCap` is now enforced (roadmap slice 7, Claims) by counting a member+dependant's prior non-rejected `Claim`s against the exact rule row; only `occurrenceCapScope: "lifetime"` is implemented, same fail-loudly pattern as `computationType`. `evidenceRequired` is enforced by `ClaimService.submit` instead, against whatever evidence is actually supplied at submission time — not something `evaluateBenefitEligibility` alone could check. `approvalChain` is what `ClaimService.decide` walks a claim through.
- Rule simulator/sandbox (§11.4, FR-RULE-06) is explicitly deferred past Phase 1 per the spec's own roadmap table — not built.

### Ledger (Phase 1, roadmap slice 4, §12)

Real double-entry bookkeeping, not a payments table — see `src/ledger/`. Deliberately sequenced right after the rule engine so the two get proven together: a rule-engine-computed contribution amount becomes a persisted `Obligation`, and a recorded payment turns into a real, balanced accounting entry.

- `POST /funds` (admin-only) — creates a `Fund` and auto-provisions its standard chart of accounts (`Cash`, `Contributions Income`, `Benefits Payable`, `Benefits Expense`, `Fund Equity` — §12.1's categories). No chart-of-accounts *builder* — five fixed accounts per fund is enough for Phase 1's actual loop.
- `POST /contribution-plans/:planId/obligations` (admin-only, `{ memberId, dueDate }`) — calls `RuleEngineService.computeContributionObligation` and persists the result as an `Obligation` (`UPCOMING`/`DUE`/`PAID`/`PARTIALLY_PAID`/`OVERDUE`/... — §12.4's obligation-status lifecycle, kept distinct from payment: a late payment settles the obligation without rewriting that it was originally late).
- `POST /payments/contribution` (self or admin, `{ memberId, fundId, amountValue, currency }`) — records that a payment was received (a manual entry, e.g. a treasurer entering cash they collected — see Payments below for the real gateway-initiated path, which posts through this exact same allocation/journal logic). Applies the payment across the member's open obligations **oldest-first** (FR-LEDGER-07 — matches the "arrears before current dues" pattern every source constitution uses), updates each obligation's status, and posts one balanced `JournalEntry` in the *same* transaction — both succeed or both roll back together.
- `GET /ledger-accounts/:id/balance` — always computed fresh from `SUM(journal lines)`, never a stored number (FR-LEDGER-05) — there's no balance column to accidentally edit.
- `POST /journal-entries/:id/reverse` (admin-only) — the *only* way to correct a posted entry (FR-LEDGER-02): a new contra entry with every line's debit/credit swapped, referencing the original. Posted entries are otherwise immutable — `LedgerService` exposes no update or delete.

**Scope choices, all deliberate:**
- `paymentAllocationPolicy` on `Organisation` accepts the spec's full vocabulary (oldest-first, newest-first, current-period-first, member-selected, admin-selected, proportional — FR-LEDGER-07) but only `oldest_first` is implemented; anything else throws `NotImplementedException`.
- §12.4's four distinct grace-period concepts are modelled as four separate fields, deliberately not merged into one: `BenefitRule.minTenureMonths` is the *benefit* waiting period (UDS's 6-month rule); `ContributionPlan.joiningGracePeriodDays`/`paymentGracePeriodDays`/`reinstatementWaitingPeriodMonths` are the three *contribution*-side ones (FR-LEDGER-06). Captured as data now; nothing evaluates them yet — that's the automatic-transition logic still owed to `MemberStatus` (see the Membership section above).
- A member's `LedgerAccount` (the wallet's liability-account data model, FR-LED-07) is a real, ready field — but nothing in this slice creates or credits one. An overpayment beyond a member's open obligations is rejected outright rather than silently becoming an unaccounted-for credit.
- Reconciliation (§12.3) and Disbursement Authorization + income/expense entries (§12.5) are both out of Phase 1 per the spec's own roadmap table — the latter is explicitly deferred to Phase 2; the former is what the Payments slice below actually builds.

### Payments (Phase 1, roadmap slice 5, §8.8/§15)

Mobile money/card/bank-transfer collection via a provider abstraction — see `src/payments/`. **No live aggregator account exists for this project** (Paystack/Flutterwave/Hubtel per §15), so `MockPaymentProvider` stands in behind a `PaymentProvider` interface; swapping in a real one later means implementing that interface, not a redesign. Benefit disbursement (FR-PAY-03) is *accounting-only* as of roadmap slice 7: `ClaimService.disburse` posts a real ledger entry and marks a claim `PAID`, but doesn't move real money through a provider — sending an approved payout via mobile money is still unbuilt, same "no live aggregator" gap as collection would have without `MockPaymentProvider`.

A real payment is asynchronous — initiating one doesn't complete it:

- `POST /payments/contribution/initiate` (self or admin) — creates a `PaymentIntent` (`INITIATED`) and asks the provider to start collecting. `MockPaymentProvider` deliberately does *not* auto-succeed here (a real gateway wouldn't either) — it returns a `providerReference` and waits, exactly like the real thing.
- `POST /payments/webhook` — the provider's callback confirming success or failure. **This is the actual engine.** No `JwtAuthGuard` (it's a provider calling us, not an app user with a JWT — webhook *signature* verification is deferred, there's no live provider secret to check against yet). On success, it calls `ObligationService`'s core allocation/posting logic directly — the identical code path `POST /payments/contribution` uses — so a real gateway payment and a manually-recorded one produce exactly the same ledger result.
- **Idempotency (FR-PAY-04):** every webhook is deduplicated by `providerReference` before anything posts. A second delivery of an already-processed webhook is a genuine no-op — proven by a test that fires the same webhook twice and checks the account balance only moved once, not twice.
- **Reconciliation exceptions (FR-PAY-04):** a webhook with an unrecognized `providerReference`, or one reporting an outcome that contradicts what's already recorded, creates a `ReconciliationException` instead of guessing — `GET /reconciliation-exceptions` / `PATCH .../:id/resolve` (both admin-only) are the Treasurer's review queue. Nothing here auto-corrects a mismatch, per §12.3.
- **No cross-tenant lookup needed:** a real aggregator lets you attach metadata to a payment request that gets echoed back in its webhook — this app uses that for `organisationId`, so the webhook handler always runs inside a normal, single-tenant `withTenant` context. If the claimed org and the actual `providerReference` don't line up (including a `providerReference` that genuinely belongs to a *different* tenant), RLS means the lookup simply finds nothing — same "unmatched" path as a typo'd reference, never a leak.

**Deliberately out of Phase 1**, per the spec's own roadmap table: payroll-deduction ingestion (FR-PAY-02), proxy payment (FR-PAY-05), and wallet-funded payment (FR-PAY-06).

### RBAC (Phase 1, roadmap slice 6, §13)

Replaces the placeholder `Member.role` ADMIN/MEMBER check every earlier slice used with a real, live permission system — see `src/rbac/`. `RoleController` lives in its own `RoleModule` rather than inside `RbacModule` itself, specifically to avoid a circular dependency (`RbacModule` needs no imports at all, so `AuthModule`, `MembershipModule`, `RuleEngineModule`, `LedgerModule`, and `PaymentsModule` can all import it for `RbacService` without any of them cycling back through `AuthModule`).

- **Permission** = `{ resource, action, scope }` (§13.1), stored as a JSON array on `Role` rather than a normalized catalog table — the action vocabulary is explicitly open-ended and parameterized (`approve_stage:<n>`), so a fixed enum would either be incomplete or need constant migrations.
- **Role** = a named bundle of permissions. Every new `Organisation` gets the 7 starter templates from §13.2's illustrative matrix seeded automatically (Org Admin, Treasurer, Committee Chair, Convener, Patron, Auditor, Member) — a fresh tenant has real, assignable roles from day one, not an empty list. `isTemplate` is informational only; a tenant can freely clone or diverge from any of them.
- **RoleAssignment** = Member × Role × optional Chapter × term. The founding admin gets an Org Admin assignment at registration; a joining member gets a Member assignment automatically (FR-MEM-09). `termEnd` is what makes FR-AUD-01's time-boxed Auditor role possible — set it at assignment time and the grant simply stops counting once it's passed. Revoking early sets `termEnd = now()` rather than deleting the row, so "member X held role Y from date A to date B" stays a reconstructable fact (FR-AUD-02), same reasoning as `MemberStatusChange`.
- **The actual check (`RbacService.hasPermission`) is live and DB-backed, never a cached or JWT-derived claim.** Revoking a role — or letting a time-boxed one lapse — takes effect on the very next request, not after some token expires; proven by a test that grants a member Org Admin mid-session (no new token), confirms an admin-only action now succeeds, revokes it, and confirms the *same* token is locked out again immediately.
- `'*'` on either `resource` or `action` matches anything — how the Org Admin template represents "full" access without a separate is-super-admin flag.
- `POST /roles` / `GET /roles` (admin-only to create, org-visible to list) — no role-*builder* UI (explicitly deferred past Phase 1 per the spec), just the raw create-with-permissions-array API.
- `POST /roles/:roleId/assignments` / `PATCH /role-assignments/:id/revoke` (admin-only) / `GET /members/:memberId/roles` (self or admin).
- **Maker-checker (§13.1, opt-in via `Organisation.makerCheckerEnabled`, off by default)** — wired into a real, already-existing enforcement point rather than left as inert config: `ContributionPlanService`/`BenefitRuleService`'s `activate()` now blocks the same member who created a rule from also being its sole approver, using the `createdBy`/`approvedBy` fields those already had. "Some very small groups genuinely have only one active officer," per the spec, so it's off unless a tenant turns it on.

`Member.role`/`MemberRole` (ADMIN/MEMBER) still exist in the schema and the JWT's `role` claim is still populated the same way — kept for response-shape stability, not read for any access-control decision anymore.

### Claims (Phase 1, roadmap slice 7, §8.6)

The slice that finally connects the rule engine (eligibility + amount), the ledger (disbursement postings) and RBAC (who may approve/disburse) — see `src/claims/`. Phase 1 scope per the roadmap table: submission, evidence upload, a simple 1-2 stage approval chain, fixed-amount benefits. FR-CLM-05 (discretionary graded bands) and full sequential/parallel/threshold routing (FR-CLM-06) are explicitly deferred.

- `POST /benefit-rules/:ruleId/claims` (self or admin, FR-CLM-01) — gated by `RuleEngineService.evaluateBenefitEligibility` (slice 3) *before* anything is persisted: an ineligible member gets a `400` with the same explainable `checks` trace the evaluate-eligibility endpoint returns, not a generic error (FR-CLM-02). `amountValue`/`currency` are copied from the rule at submission time, so a later amendment can never retroactively change what a pending claim pays out — same reasoning as `Obligation.amountValue`.
- **Evidence (FR-CLM-01):** no file/blob storage exists in this app, so this is metadata-only — a type plus a text reference (e.g. "Death certificate #12345, held by the Secretary"), not the document itself. Submission is rejected if it doesn't cover every type listed in the rule's `evidenceRequired`; `POST /claims/:id/evidence` (self or admin) adds more while a claim is still under review.
- **Approval chain (FR-CLM-03):** `ClaimStageAction` records every decision — actor, timestamp, comment — at every stage of `benefitRule.approvalChain`, never overwritten. `POST /claims/:id/decide` (`{ decision: "APPROVE" | "REJECT" }`) advances `currentStageIndex` on approval, finishing at `APPROVED` once the final stage clears; a `REJECT` at any stage is terminal. A rule with zero configured stages goes straight to `APPROVED` on eligibility alone.
- **`claim:approve` is deliberately flat, not per-stage:** `BenefitRule.approvalChain` is a tenant-defined, free-form array of stage-name strings, so there's no fixed vocabulary a starter role template could name in advance that would reliably match an arbitrary tenant's stages. Phase 1's own scope is "a simple 1-2 stage chain" — `ClaimService.decide` checks the same `claim:approve` permission uniformly at every stage rather than differentiating who may approve *which* one (full per-stage routing is FR-CLM-06, deferred).
- **APPROVED and PAID are distinct states**, mirroring `Obligation` vs payment (§12.4): a claim can clear every approval stage and still be sitting unpaid. `POST /claims/:id/disburse` (`ledger:disburse` permission — the Treasurer template already had it, unwired until now) is the only thing that moves a claim from one to the other, by posting a real balanced `JournalEntry` (`Benefits Expense` debit / `Cash` credit) through the same `LedgerService` slice 4 built. FR-CLM-04's two claim registers ("applications" vs "approved-and-paid") are just `GET /claims?status=` filtered views over this one table, not separate stores.
- **Maker-checker**, when the tenant has it enabled, also blocks a claim's own submitter from deciding it — the same `Organisation.makerCheckerEnabled` field and reasoning slice 6 wired into rule activation, now applied here too.
- `occurrenceCap` (FR-RULE-04) is enforced here for the first time: `RuleEngineService.evaluateBenefitEligibility` now counts a member+dependant's prior non-rejected claims against the exact rule row before answering "eligible." Each of a member's dependants gets an independent cap (counted per member+dependant pair), and only `occurrenceCapScope: "lifetime"` is implemented — anything else throws `NotImplementedException`, the same fail-loudly pattern used everywhere else in this app rather than silently under-enforcing a scope nothing evaluates.

### Defaulter / anti-abuse (Phase 1, roadmap slice 8, §14)

Phase 1 scope per the roadmap table is FR-DEF-01/02 only — threshold-based status transitions and requiring arrears fully cleared before restoring good standing. §14.1's consistency score and §14.3/14.4's dumping-pattern detection/proportional payout are Phase 2 — a binary good-standing test is enough to prove the loop; those are worth tuning against real payment behaviour a pilot will generate, not guessed at now. See `src/defaulter/`.

- **Opt-in, like maker-checker:** nothing auto-transitions a member's status unless the tenant has configured a `DefaulterPolicy` (`POST /defaulter-policy`, admin-only — `{ defaulterThresholdMonths, forfeitureThresholdMonths }`, the first must be smaller than the second). One policy per organisation.
- **No stored "missed" counter, no scheduler.** `DefaulterService` computes how many of a member's most recent, chronologically-consecutive `Obligation`s under a plan are unsettled *at query time* — walking newest-to-oldest, respecting the plan's `paymentGracePeriodDays`, stopping at the first `PAID`/`WAIVED`/`EXEMPTED`/`CANCELLED` one. Nothing here depends on an `OVERDUE` status a batch job would normally set — this app has no job runner (Notifications, which would drive one, is also out of Phase 1).
- **"Automatic" means real trigger events, not a timer:** `POST /members/:memberId/contribution-plans/:planId/reassess-standing` (admin-only) recomputes and transitions on demand, and `ObligationService.recordContributionPaymentInTx` calls the same logic after every payment — so clearing arrears restores good standing without a separate manual step (FR-DEF-02). A tenant whose member simply stops paying, with no payment event to hang a reassessment on, needs a real periodic sweep to catch that — a known, deliberate gap, not an oversight.
- **State machine:** at `defaulterThresholdMonths` consecutive missed periods → `DEFAULTER` (AGAOSAS: 2 months, "not in good standing"); at `forfeitureThresholdMonths` → `SUSPENDED`, standing in for §14's "Forfeited" state (AGAOSAS: 3 months) — Phase 1 doesn't add a dedicated enum value since both already block benefit eligibility identically via `goodStandingRequired`. Clearing arrears to zero moves back to `ACTIVE`, or to `PROBATION` if the plan configures `reinstatementWaitingPeriodMonths` — a fresh probation per §12.4, with a human confirming the wait elapsed via the existing `PATCH /members/:id/status` (slice 2). Only `ACTIVE`/`GRACE`/`PROBATION`/`DEFAULTER`/`SUSPENDED` members are ever auto-transitioned; `PENDING`/`EXITED`/`DECEASED` are left alone.
- **Fixed a gap from the ledger slice along the way:** `ContributionPlan.joiningGracePeriodDays`/`paymentGracePeriodDays`/`reinstatementWaitingPeriodMonths` existed on the schema since slice 4 but were never exposed on `CreateContributionPlanDto` — silently stripped by the global `whitelist: true` validation pipe. Added here since this slice is the first thing that actually needs them to work.
- FR-DEF-02's oldest-arrears-first payment allocation was already built in the ledger slice (`ObligationService.recordContributionPaymentInTx`) — this slice's contribution is tying automatic status *restoration* to it, not the allocation itself.

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).

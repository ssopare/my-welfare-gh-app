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

- `POST /auth/register-organisation` — tenant self-registration (FR-ONB-01): creates the founding `Account` + `Organisation` + an `ADMIN` `Member`, all in one step, and returns a token.
- `POST /auth/login` — `{ phoneNumber, password }`; add `organisationId` if the account has more than one Membership (no join-existing-org endpoint or multi-group switcher UI yet — §24.1 defers the polished version to Phase 2, this only has the data model for it).
- `GET /auth/me` (guarded) — returns the decoded token payload (`sub`/accountId, `memberId`, `organisationId`, `role`).

Login needs to discover which Organisation(s) an Account belongs to *before* any tenant context exists — the same bootstrapping problem `provisionOrganisation` solves for tenant creation. Solved the same way: `PrismaService.withAccount(accountId, fn)` sets `app.account_id`, which a second, independent RLS policy on `members` (`own_memberships`) reads — see the `add_member_role_and_account_policy` migration.

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

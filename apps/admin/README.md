# apps/admin — Next.js admin console

Not yet scaffolded. Planned entry point for Phase 0:

```
npx create-next-app@latest . --typescript --app --src-dir
```

Committee/treasurer-facing screens the mobile app isn't built for: rule configuration, claims approval, disbursement authorization, reporting. Shares rule-engine and entity types with `apps/api` via `../../packages/shared-types` — a rule schema change becomes a compile-time error here, not a silent drift.

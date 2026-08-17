import { SetMetadata } from '@nestjs/common';

export const REQUIRES_MODULE = 'requiresModule';

// Gates an entire controller (or a single handler) behind a named,
// plan-scoped feature module — see ModuleAccessGuard and
// SubscriptionPlan.includedModules. 'voting' is the only module key that
// currently means anything; ModuleAccessGuard is what actually maps a key
// to real enforcement, this decorator only attaches the metadata.
export const RequiresModule = (moduleKey: string) =>
  SetMetadata(REQUIRES_MODULE, moduleKey);

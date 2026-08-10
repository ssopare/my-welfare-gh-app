import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { PlatformAuthenticatedRequest } from './platform-auth.guard';

export const CurrentOperator = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => {
    return ctx.switchToHttp().getRequest<PlatformAuthenticatedRequest>()
      .operator;
  },
);

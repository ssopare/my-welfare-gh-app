import 'dotenv/config';
import { join } from 'path';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  // rawBody: true keeps the original request bytes around (as
  // req.rawBody) alongside the parsed JSON body — needed by the Paystack
  // webhook route to verify the x-paystack-signature HMAC, which is
  // computed over the exact bytes Paystack sent, not a re-serialization
  // of the parsed object (see PaymentController.handlePaystackWebhook).
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });
  // Serve user-uploaded files (avatars/logos) from the uploads/ directory.
  // Files are written by UploadController and the path /uploads/** resolves
  // directly to the filesystem — no additional routing or auth needed since
  // avatar URLs are not secret (they're the same as a public profile picture).
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads' });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Every real client — the admin console (server-to-server only, by
  // design) and native iOS/Android — is exempt from CORS, a browser-only
  // mechanism, so this has never been needed. The one exception is
  // previewing the Flutter app's web target in a browser during local
  // development, which is a dev convenience, not something the shipped
  // product depends on — gated to non-production, localhost origins only.
  if (process.env.NODE_ENV !== 'production') {
    app.enableCors({ origin: /^http:\/\/localhost:\d+$/ });
  }

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();

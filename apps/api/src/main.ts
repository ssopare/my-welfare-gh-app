import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  // rawBody: true keeps the original request bytes around (as
  // req.rawBody) alongside the parsed JSON body — needed by the Paystack
  // webhook route to verify the x-paystack-signature HMAC, which is
  // computed over the exact bytes Paystack sent, not a re-serialization
  // of the parsed object (see PaymentController.handlePaystackWebhook).
  const app = await NestFactory.create(AppModule, { rawBody: true });
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

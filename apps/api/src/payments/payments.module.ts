import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LedgerModule } from '../ledger/ledger.module';
import { RbacModule } from '../rbac/rbac.module';
import { PaymentController } from './payment.controller';
import { PayoutController } from './payout.controller';
import { PaymentService } from './payment.service';
import { PayoutService } from './payout.service';
import { MockPaymentProvider } from './providers/mock-payment-provider.service';
import { PAYMENT_PROVIDER } from './providers/payment-provider.interface';
import { PaystackPaymentProvider } from './providers/paystack-payment-provider.service';

// Defaults to the mock provider so CI/local dev need zero config —
// PAYMENT_PROVIDER=paystack opts a real deployment into live charges,
// and then requires PAYSTACK_SECRET_KEY (checked at construction, same
// fail-fast-at-load pattern AuthModule uses for JWT_SECRET).
@Module({
  imports: [AuthModule, LedgerModule, RbacModule],
  controllers: [PaymentController, PayoutController],
  providers: [
    PaymentService,
    PayoutService,
    {
      provide: PAYMENT_PROVIDER,
      useFactory: () =>
        process.env.PAYMENT_PROVIDER === 'paystack'
          ? new PaystackPaymentProvider()
          : new MockPaymentProvider(),
    },
  ],
  exports: [PayoutService],
})
export class PaymentsModule {}

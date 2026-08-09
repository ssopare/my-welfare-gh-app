import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LedgerModule } from '../ledger/ledger.module';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { MockPaymentProvider } from './providers/mock-payment-provider.service';
import { PAYMENT_PROVIDER } from './providers/payment-provider.interface';

@Module({
  imports: [AuthModule, LedgerModule],
  controllers: [PaymentController],
  providers: [
    PaymentService,
    { provide: PAYMENT_PROVIDER, useClass: MockPaymentProvider },
  ],
})
export class PaymentsModule {}

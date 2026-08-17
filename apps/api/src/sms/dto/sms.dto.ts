import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SendTestSmsDto {
  @IsNotEmpty()
  @IsString()
  phoneNumber: string;

  @IsNotEmpty()
  @IsString()
  message: string;

  @IsOptional()
  @IsString()
  provider?: 'ARKESEL' | 'MNOTIFY' | 'HUBTEL' | 'MOCK';
}

export class BroadcastSmsDto {
  @IsNotEmpty()
  @IsString()
  message: string;

  @IsNotEmpty()
  @IsString()
  recipientGroup: 'ALL_MEMBERS' | 'ACTIVE_MEMBERS' | 'DEFAULTERS';
}

export class SendOtpDto {
  @IsNotEmpty()
  @IsString()
  phoneNumber: string;
}

export class VerifyOtpDto {
  @IsNotEmpty()
  @IsString()
  phoneNumber: string;

  @IsNotEmpty()
  @IsString()
  code: string;
}

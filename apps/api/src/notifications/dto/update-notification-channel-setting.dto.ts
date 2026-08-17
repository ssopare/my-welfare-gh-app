import { IsBoolean } from 'class-validator';

export class UpdateNotificationChannelSettingDto {
  @IsBoolean()
  smsEnabled!: boolean;
}

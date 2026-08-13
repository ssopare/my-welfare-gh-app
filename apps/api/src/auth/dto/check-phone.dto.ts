import { IsString, MinLength } from 'class-validator';

// Public, side-effect-free: returns only whether an Account exists for
// this phone number, nothing else (no name, no org membership). Lets the
// join screen ask for a name only when one's actually needed.
export class CheckPhoneDto {
  @IsString()
  @MinLength(6)
  phoneNumber!: string;
}

import { IsIn, IsOptional, IsString } from 'class-validator';

// Kept as a manual literal list (matching the Prisma MemberStatus enum)
// rather than importing the generated enum, consistent with how MemberRole
// is handled elsewhere in this app.
const MEMBER_STATUSES = [
  'PENDING',
  'PROBATION',
  'ACTIVE',
  'GRACE',
  'DEFAULTER',
  'SUSPENDED',
  'EXITED',
  'DECEASED',
] as const;

export type MemberStatusValue = (typeof MEMBER_STATUSES)[number];

export class ChangeStatusDto {
  @IsIn(MEMBER_STATUSES)
  status!: MemberStatusValue;

  // Reason stays optional at the shape-validation level for every status —
  // MembershipService.changeStatus enforces it as mandatory specifically
  // for EXITED, since that's a business rule about *removal*, not a
  // property-shape concern.
  @IsOptional()
  @IsString()
  reason?: string;
}

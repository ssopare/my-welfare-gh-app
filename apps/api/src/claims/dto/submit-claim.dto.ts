import { Type } from 'class-transformer';
import {
  IsArray,
  IsISO8601,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { ClaimEvidenceDto } from './claim-evidence.dto';

// FR-CLM-01: "member (or an admin on their behalf) files a claim ... with
// evidence type." memberId is who the entitlement belongs to (self or an
// admin submitting for them, per requireSelfOrAdmin); dependantId is set
// when the rule's subject is a dependant, not the member themselves.
export class SubmitClaimDto {
  @IsUUID()
  memberId!: string;

  @IsOptional()
  @IsUUID()
  dependantId?: string;

  // The date the qualifying event happened — distinct from the submission
  // date, matching evaluate-eligibility's own eventDate semantics (§11.1).
  @IsISO8601()
  eventDate!: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ClaimEvidenceDto)
  evidence?: ClaimEvidenceDto[];
}

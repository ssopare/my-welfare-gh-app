import { IsISO8601, IsOptional, IsUUID } from 'class-validator';

export class EvaluateEligibilityDto {
  @IsUUID()
  memberId!: string;

  // Set when the rule's subject is a dependant, not the member themselves
  // (e.g. "dependant.death") — occurrenceCap is checked per member+dependant
  // pair, so this determines which prior claims count against the cap.
  @IsUUID()
  @IsOptional()
  dependantId?: string;

  // The date the qualifying event happened (a death, a birth, a marriage)
  // — deliberately distinct from claim date/approval date/payment date,
  // per §11.1's five-distinct-dates requirement. Only event date matters
  // for eligibility.
  @IsISO8601()
  eventDate!: string;
}

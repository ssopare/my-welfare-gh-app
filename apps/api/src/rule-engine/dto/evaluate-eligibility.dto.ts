import { IsISO8601, IsUUID } from 'class-validator';

export class EvaluateEligibilityDto {
  @IsUUID()
  memberId!: string;

  // The date the qualifying event happened (a death, a birth, a marriage)
  // — deliberately distinct from claim date/approval date/payment date,
  // per §11.1's five-distinct-dates requirement. Only event date matters
  // for eligibility.
  @IsISO8601()
  eventDate!: string;
}

import { IsUUID } from 'class-validator';

// Unlike amount/cadence (real rule characteristics, versioned via
// supersedesId — see ContributionPlanService.activate), which fund a
// payment against this plan defaults to is operational metadata, not a
// financial rule. Editable in place on the existing row for exactly that
// reason — no new version needed to fix a wrong or missing default.
export class UpdatePlanDefaultFundDto {
  @IsUUID()
  fundId!: string;
}

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import type { AuthTokenPayload } from '../auth/auth.service';
import { requireAdmin } from '../common/access.util';
import { PrismaService } from '../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { AppointOfficerDto } from './dto/appoint-officer.dto';
import { CreateGovernanceBodyDto } from './dto/create-governance-body.dto';
import { CreateElectionDto } from './dto/create-election.dto';
import { CreateNominationDto } from './dto/create-nomination.dto';
import { VetNominationDto } from './dto/vet-nomination.dto';
import { CastVoteDto } from './dto/cast-vote.dto';

// §8.3, roadmap: Governance. Phase 1 scope per the roadmap table —
// governance bodies, term limits, role vacancy handling. Motions/minutes/
// votes and "vote of no confidence" (FR-GOV-03/04) are Phase 2: "officers
// can be recorded administratively at first."
@Injectable()
export class GovernanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
  ) {}

  async create(actor: AuthTokenPayload, dto: CreateGovernanceBodyDto) {
    await requireAdmin(this.rbac, actor);
    if (dto.maxConsecutiveTerms == null && dto.coolingOffPeriodMonths != null) {
      throw new BadRequestException(
        'coolingOffPeriodMonths only makes sense alongside maxConsecutiveTerms',
      );
    }
    return this.prisma.withTenant(actor.organisationId, (tx) =>
      tx.governanceBody.create({
        data: {
          organisationId: actor.organisationId,
          name: dto.name,
          membershipCompositionRule: dto.membershipCompositionRule,
          quorumRule: dto.quorumRule,
          tieBreakRule: dto.tieBreakRule,
          meetingCadence: dto.meetingCadence,
          maxConsecutiveTerms: dto.maxConsecutiveTerms,
          coolingOffPeriodMonths: dto.coolingOffPeriodMonths,
        },
      }),
    );
  }

  async list(actor: AuthTokenPayload) {
    return this.prisma.withTenant(actor.organisationId, (tx) =>
      tx.governanceBody.findMany({ orderBy: { createdAt: 'asc' } }),
    );
  }

  // include member.account.phoneNumber — surfaced building the admin
  // console, same recurring gap as every other role/membership list this
  // session: phoneNumber is the only human-identifying field anywhere in
  // this system, and it's easy to forget the nested join when a query
  // only ever needed the bare RoleAssignment before now.
  async listOfficers(actor: AuthTokenPayload, governanceBodyId: string) {
    return this.prisma.withTenant(actor.organisationId, async (tx) => {
      const body = await tx.governanceBody.findUnique({
        where: { id: governanceBodyId },
      });
      if (!body) {
        throw new NotFoundException('Governance body not found');
      }
      return tx.roleAssignment.findMany({
        where: { governanceBodyId },
        include: {
          role: true,
          member: { include: { account: { select: { phoneNumber: true } } } },
        },
        orderBy: { termStart: 'desc' },
      });
    });
  }

  // FR-GOV-02: term limits + cooling-off, checked before delegating to
  // RbacService.assignRoleInTx for the actual grant — reusing slice 6's
  // RoleAssignment machinery rather than inventing a parallel "officer"
  // concept, per the spec's own "RoleAssignment links Member x Role x
  // Governance Body" data-model line. Each RoleAssignment row for this
  // (role, body) pair already *is* one term — walking them newest-first
  // and counting how many in a row belong to this member is the same
  // "each row is a version" reasoning as the schema comment explains.
  async appointOfficer(
    actor: AuthTokenPayload,
    governanceBodyId: string,
    dto: AppointOfficerDto,
  ) {
    await requireAdmin(this.rbac, actor);
    return this.prisma.withTenant(actor.organisationId, async (tx) => {
      const body = await tx.governanceBody.findUnique({
        where: { id: governanceBodyId },
      });
      if (!body) {
        throw new NotFoundException('Governance body not found');
      }
      const role = await tx.role.findUnique({ where: { id: dto.roleId } });
      if (!role) {
        throw new NotFoundException('Role not found');
      }
      const member = await tx.member.findUnique({
        where: { id: dto.memberId },
      });
      if (!member) {
        throw new NotFoundException('Member not found');
      }

      if (body.maxConsecutiveTerms != null) {
        const history = await tx.roleAssignment.findMany({
          where: { roleId: dto.roleId, governanceBodyId },
          orderBy: { termStart: 'desc' },
        });

        let consecutive = 0;
        let mostRecentOwnTermEnd: Date | null = null;
        for (const assignment of history) {
          if (assignment.memberId !== dto.memberId) {
            break;
          }
          consecutive++;
          if (mostRecentOwnTermEnd === null) {
            mostRecentOwnTermEnd = assignment.termEnd;
          }
        }

        if (consecutive >= body.maxConsecutiveTerms) {
          const coolingOffMonths = body.coolingOffPeriodMonths ?? 0;
          const eligibleAgainAt = mostRecentOwnTermEnd
            ? new Date(mostRecentOwnTermEnd)
            : null;
          eligibleAgainAt?.setMonth(
            eligibleAgainAt.getMonth() + coolingOffMonths,
          );
          const hasCooledOff =
            eligibleAgainAt !== null && eligibleAgainAt <= new Date();
          if (!hasCooledOff) {
            throw new BadRequestException(
              `This member has already served ${consecutive} consecutive term(s) as ${role.name} in this body — a ${coolingOffMonths} month cooling-off period applies before reappointment`,
            );
          }
        }
      }

      return this.rbac.assignRoleInTx(
        tx,
        actor.organisationId,
        dto.memberId,
        dto.roleId,
        {
          governanceBodyId,
          termEnd: dto.termEnd ? new Date(dto.termEnd) : undefined,
        },
      );
    });
  }

  async createElection(actor: AuthTokenPayload, dto: CreateElectionDto) {
    await requireAdmin(this.rbac, actor);
    return this.prisma.withTenant(actor.organisationId, async (tx) => {
      const election = await tx.election.create({
        data: {
          organisationId: actor.organisationId,
          title: dto.title,
          description: dto.description,
          type: dto.type,
          isAnonymous: dto.isAnonymous ?? true,
          quorumPercentage: dto.quorumPercentage ?? 50.00,
          passPercentage: dto.passPercentage ?? 50.00,
          nominationStartsAt: dto.nominationStartsAt ? new Date(dto.nominationStartsAt) : null,
          nominationEndsAt: dto.nominationEndsAt ? new Date(dto.nominationEndsAt) : null,
          minNomineeTenureMonths: dto.minNomineeTenureMonths ?? 0,
          requireGoodStandingForNominee: dto.requireGoodStandingForNominee ?? true,
          requireNoArrearsForNominee: dto.requireNoArrearsForNominee ?? true,
          minSecondersRequired: dto.minSecondersRequired ?? 0,
          startsAt: new Date(dto.startsAt),
          endsAt: new Date(dto.endsAt),
        },
      });

      if (dto.options && dto.options.length > 0) {
        await tx.issueOption.createMany({
          data: dto.options.map((opt) => ({
            electionId: election.id,
            text: opt,
          })),
        });
      }

      if (dto.nomineeMemberIds && dto.nomineeMemberIds.length > 0) {
        await tx.nominee.createMany({
          data: dto.nomineeMemberIds.map((mId) => ({
            electionId: election.id,
            memberId: mId,
          })),
        });
      }

      return election;
    });
  }

  async listElections(actor: AuthTokenPayload) {
    return this.prisma.withTenant(actor.organisationId, (tx) =>
      tx.election.findMany({
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  async getElection(actor: AuthTokenPayload, electionId: string) {
    return this.prisma.withTenant(actor.organisationId, async (tx) => {
      const election = await tx.election.findUnique({
        where: { id: electionId },
        include: {
          nominations: true,
          nominees: true,
          options: true,
        },
      });
      if (!election) {
        throw new NotFoundException('Election not found');
      }
      return election;
    });
  }

  async transitionElectionStatus(
    actor: AuthTokenPayload,
    electionId: string,
    status: 'DRAFT' | 'NOMINATION' | 'VETTING' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED',
  ) {
    await requireAdmin(this.rbac, actor);
    return this.prisma.withTenant(actor.organisationId, async (tx) => {
      const election = await tx.election.findUnique({ where: { id: electionId } });
      if (!election) {
        throw new NotFoundException('Election not found');
      }
      return tx.election.update({
        where: { id: electionId },
        data: { status },
      });
    });
  }

  async createNomination(
    actor: AuthTokenPayload,
    electionId: string,
    dto: CreateNominationDto,
  ) {
    return this.prisma.withTenant(actor.organisationId, async (tx) => {
      const election = await tx.election.findUnique({
        where: { id: electionId },
      });
      if (!election) {
        throw new NotFoundException('Election not found');
      }
      if (election.status !== 'NOMINATION') {
        throw new BadRequestException('Election is not in NOMINATION phase');
      }

      const nominee = await tx.member.findUnique({
        where: { id: dto.nomineeMemberId },
      });
      if (!nominee) {
        throw new NotFoundException('Nominee member not found');
      }

      // Automated Vetting checks
      if (election.minNomineeTenureMonths > 0) {
        const diffTime = Math.abs(new Date().getTime() - nominee.createdAt.getTime());
        const diffMonths = Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 30));
        if (diffMonths < election.minNomineeTenureMonths) {
          throw new BadRequestException(
            `Nominee does not meet the minimum tenure of ${election.minNomineeTenureMonths} months`,
          );
        }
      }

      if (election.requireGoodStandingForNominee && nominee.status !== 'ACTIVE') {
        throw new BadRequestException('Nominee must be in ACTIVE good standing');
      }

      if (election.requireNoArrearsForNominee) {
        const arrears = await tx.obligation.count({
          where: {
            memberId: dto.nomineeMemberId,
            status: { in: ['DUE', 'PARTIALLY_PAID'] },
          },
        });
        if (arrears > 0) {
          throw new BadRequestException(
            'Nominee has outstanding contribution arrears',
          );
        }
      }

      return tx.nomination.create({
        data: {
          electionId,
          nomineeMemberId: dto.nomineeMemberId,
          nominatorId: actor.memberId,
          statement: dto.statement,
        },
      });
    });
  }

  async secondNomination(actor: AuthTokenPayload, nominationId: string) {
    return this.prisma.withTenant(actor.organisationId, async (tx) => {
      const nomination = await tx.nomination.findUnique({
        where: { id: nominationId },
        include: { election: true },
      });
      if (!nomination) {
        throw new NotFoundException('Nomination not found');
      }
      if (nomination.election.status !== 'NOMINATION') {
        throw new BadRequestException('Election is not in NOMINATION phase');
      }
      if (nomination.seconders.includes(actor.memberId)) {
        throw new BadRequestException('You have already seconded this nomination');
      }

      const updatedSeconders = [...nomination.seconders, actor.memberId];
      return tx.nomination.update({
        where: { id: nominationId },
        data: { seconders: updatedSeconders },
      });
    });
  }

  async vetNomination(
    actor: AuthTokenPayload,
    nominationId: string,
    dto: VetNominationDto,
  ) {
    await requireAdmin(this.rbac, actor);
    return this.prisma.withTenant(actor.organisationId, async (tx) => {
      const nomination = await tx.nomination.findUnique({
        where: { id: nominationId },
        include: { election: true },
      });
      if (!nomination) {
        throw new NotFoundException('Nomination not found');
      }
      if (nomination.election.status !== 'VETTING') {
        throw new BadRequestException('Election is not in VETTING phase');
      }

      const updated = await tx.nomination.update({
        where: { id: nominationId },
        data: {
          status: dto.status,
          rejectionReason: dto.rejectionReason,
        },
      });

      if (dto.status === 'APPROVED') {
        // Automatically promote approved nomination to Nominee ballot candidate
        await tx.nominee.create({
          data: {
            electionId: nomination.electionId,
            memberId: nomination.nomineeMemberId,
            manifesto: nomination.statement,
          },
        });
      }

      return updated;
    });
  }

  async castVote(
    actor: AuthTokenPayload,
    electionId: string,
    dto: CastVoteDto,
  ) {
    return this.prisma.withTenant(actor.organisationId, async (tx) => {
      const election = await tx.election.findUnique({
        where: { id: electionId },
      });
      if (!election) {
        throw new NotFoundException('Election not found');
      }
      if (election.status !== 'ACTIVE') {
        throw new BadRequestException('Election is not currently active');
      }

      // Check if member already voted
      const alreadyVoted = await tx.voterRegistry.findUnique({
        where: {
          electionId_memberId: {
            electionId,
            memberId: actor.memberId,
          },
        },
      });
      if (alreadyVoted) {
        throw new BadRequestException('You have already voted in this election');
      }

      // Validate option selection
      if (election.type === 'OFFICER') {
        if (!dto.nomineeId) {
          throw new BadRequestException('Nominee selection is required');
        }
        const nomineeExists = await tx.nominee.findFirst({
          where: { id: dto.nomineeId, electionId },
        });
        if (!nomineeExists) {
          throw new BadRequestException('Selected nominee is not on the ballot');
        }
      } else {
        if (!dto.issueOptionId) {
          throw new BadRequestException('Issue option selection is required');
        }
        const optionExists = await tx.issueOption.findFirst({
          where: { id: dto.issueOptionId, electionId },
        });
        if (!optionExists) {
          throw new BadRequestException('Selected option is not valid');
        }
      }

      // Transactionally register voter and record ballot
      await tx.voterRegistry.create({
        data: {
          electionId,
          memberId: actor.memberId,
        },
      });

      if (election.isAnonymous) {
        return tx.anonymousBallot.create({
          data: {
            electionId,
            nomineeId: dto.nomineeId,
            issueOptionId: dto.issueOptionId,
          },
        });
      } else {
        return tx.publicBallot.create({
          data: {
            electionId,
            memberId: actor.memberId,
            nomineeId: dto.nomineeId,
            issueOptionId: dto.issueOptionId,
          },
        });
      }
    });
  }

  async getElectionResults(actor: AuthTokenPayload, electionId: string) {
    return this.prisma.withTenant(actor.organisationId, async (tx) => {
      const election = await tx.election.findUnique({
        where: { id: electionId },
      });
      if (!election) {
        throw new NotFoundException('Election not found');
      }

      // Calculate total eligible voters
      const totalEligible = await tx.member.count({
        where: {
          organisationId: actor.organisationId,
          status: { in: ['ACTIVE', 'PROBATION', 'GRACE'] },
        },
      });

      // Calculate total votes cast
      const totalVotesCast = await tx.voterRegistry.count({
        where: { electionId },
      });

      const turnoutPercentage = totalEligible > 0
        ? (totalVotesCast / totalEligible) * 100
        : 0;

      const quorumMet = turnoutPercentage >= Number(election.quorumPercentage);

      let results: { optionId: string; label: string; count: number }[] = [];

      if (election.type === 'OFFICER') {
        const nominees = await tx.nominee.findMany({
          where: { electionId },
        });

        // Resolve nominee member details
        const nomineeDetails = await Promise.all(
          nominees.map(async (n) => {
            const memberInfo = await tx.member.findUnique({
              where: { id: n.memberId },
              include: { account: { select: { name: true } } },
            });
            return {
              id: n.id,
              name: memberInfo?.account?.name ?? 'Unknown Candidate',
            };
          }),
        );

        for (const nominee of nomineeDetails) {
          const count = election.isAnonymous
            ? await tx.anonymousBallot.count({
                where: { electionId, nomineeId: nominee.id },
              })
            : await tx.publicBallot.count({
                where: { electionId, nomineeId: nominee.id },
              });

          results.push({
            optionId: nominee.id,
            label: nominee.name,
            count,
          });
        }
      } else {
        const options = await tx.issueOption.findMany({
          where: { electionId },
        });

        for (const option of options) {
          const count = election.isAnonymous
            ? await tx.anonymousBallot.count({
                where: { electionId, issueOptionId: option.id },
              })
            : await tx.publicBallot.count({
                where: { electionId, issueOptionId: option.id },
              });

          results.push({
            optionId: option.id,
            label: option.text,
            count,
          });
        }
      }

      return {
        electionId,
        title: election.title,
        status: election.status,
        totalEligible,
        totalVotesCast,
        turnoutPercentage,
        quorumPercentage: Number(election.quorumPercentage),
        quorumMet,
        results,
      };
    });
  }
}

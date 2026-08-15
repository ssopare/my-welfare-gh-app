-- CreateEnum
CREATE TYPE "ElectionType" AS ENUM ('OFFICER', 'ISSUE');

-- CreateEnum
CREATE TYPE "ElectionStatus" AS ENUM ('DRAFT', 'NOMINATION', 'VETTING', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "NominationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "elections" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "ElectionType" NOT NULL,
    "status" "ElectionStatus" NOT NULL DEFAULT 'DRAFT',
    "isAnonymous" BOOLEAN NOT NULL DEFAULT true,
    "quorumPercentage" DECIMAL(5,2) NOT NULL DEFAULT 50.00,
    "passPercentage" DECIMAL(5,2) NOT NULL DEFAULT 50.00,
    "nominationStartsAt" TIMESTAMP(3),
    "nominationEndsAt" TIMESTAMP(3),
    "minNomineeTenureMonths" INTEGER NOT NULL DEFAULT 0,
    "requireGoodStandingForNominee" BOOLEAN NOT NULL DEFAULT true,
    "requireNoArrearsForNominee" BOOLEAN NOT NULL DEFAULT true,
    "minSecondersRequired" INTEGER NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "elections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nominations" (
    "id" TEXT NOT NULL,
    "electionId" TEXT NOT NULL,
    "nomineeMemberId" TEXT NOT NULL,
    "nominatorId" TEXT NOT NULL,
    "statement" TEXT,
    "status" "NominationStatus" NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "seconders" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nominations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nominees" (
    "id" TEXT NOT NULL,
    "electionId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "bio" TEXT,
    "manifesto" TEXT,

    CONSTRAINT "nominees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issue_options" (
    "id" TEXT NOT NULL,
    "electionId" TEXT NOT NULL,
    "text" TEXT NOT NULL,

    CONSTRAINT "issue_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voter_registries" (
    "id" TEXT NOT NULL,
    "electionId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "votedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "voter_registries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public_ballots" (
    "id" TEXT NOT NULL,
    "electionId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "nomineeId" TEXT,
    "issueOptionId" TEXT,

    CONSTRAINT "public_ballots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anonymous_ballots" (
    "id" TEXT NOT NULL,
    "electionId" TEXT NOT NULL,
    "nomineeId" TEXT,
    "issueOptionId" TEXT,

    CONSTRAINT "anonymous_ballots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "voter_registries_electionId_memberId_key" ON "voter_registries"("electionId", "memberId");

-- CreateIndex
CREATE UNIQUE INDEX "public_ballots_electionId_memberId_key" ON "public_ballots"("electionId", "memberId");

-- AddForeignKey
ALTER TABLE "elections" ADD CONSTRAINT "elections_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nominations" ADD CONSTRAINT "nominations_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "elections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nominees" ADD CONSTRAINT "nominees_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "elections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_options" ADD CONSTRAINT "issue_options_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "elections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voter_registries" ADD CONSTRAINT "voter_registries_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "elections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_ballots" ADD CONSTRAINT "public_ballots_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "elections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_ballots" ADD CONSTRAINT "public_ballots_nomineeId_fkey" FOREIGN KEY ("nomineeId") REFERENCES "nominees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_ballots" ADD CONSTRAINT "public_ballots_issueOptionId_fkey" FOREIGN KEY ("issueOptionId") REFERENCES "issue_options"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anonymous_ballots" ADD CONSTRAINT "anonymous_ballots_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "elections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

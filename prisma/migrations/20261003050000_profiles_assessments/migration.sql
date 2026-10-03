-- CreateEnum
CREATE TYPE "AssessmentKind" AS ENUM ('INITIAL', 'REASSESSMENT', 'LEVEL_CHANGE');

-- CreateEnum
CREATE TYPE "AssessmentRequestStatus" AS ENUM ('REQUESTED', 'SCHEDULED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MatchTypePreference" AS ENUM ('FRIENDLY', 'COMPETITIVE', 'ANY');

-- CreateEnum
CREATE TYPE "TrainingKind" AS ENUM ('PRIVATE', 'PROGRAM', 'CLINIC', 'ASSESSMENT');

-- AlterTable
ALTER TABLE "Assessment" ADD COLUMN     "kind" "AssessmentKind" NOT NULL DEFAULT 'INITIAL',
ADD COLUMN     "staffNotes" VARCHAR(2000);

-- AlterTable
ALTER TABLE "PlayerProfile" ADD COLUMN     "matchType" "MatchTypePreference" NOT NULL DEFAULT 'ANY',
ADD COLUMN     "photoUrl" TEXT,
ADD COLUMN     "playStyle" VARCHAR(80),
ADD COLUMN     "preferredTimes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "selfLevel" "PlayerLevel",
ADD COLUMN     "yearsPlaying" INTEGER;

-- CreateTable
CREATE TABLE "AssessmentRequest" (
    "id" TEXT NOT NULL,
    "playerProfileId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "kind" "AssessmentKind" NOT NULL DEFAULT 'INITIAL',
    "status" "AssessmentRequestStatus" NOT NULL DEFAULT 'REQUESTED',
    "note" VARCHAR(500),
    "scheduledAt" TIMESTAMP(3),
    "assessorId" TEXT,
    "assessmentId" TEXT,
    "cancelReason" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssessmentRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LevelDefinition" (
    "level" "PlayerLevel" NOT NULL,
    "rank" INTEGER NOT NULL,
    "label" VARCHAR(40) NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LevelDefinition_pkey" PRIMARY KEY ("level")
);

-- CreateTable
CREATE TABLE "TrainingRecord" (
    "id" TEXT NOT NULL,
    "playerProfileId" TEXT NOT NULL,
    "locationId" TEXT,
    "trainerId" TEXT,
    "kind" "TrainingKind" NOT NULL DEFAULT 'PRIVATE',
    "title" VARCHAR(120) NOT NULL,
    "heldAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 60,
    "notes" VARCHAR(1000),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainingRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_PreferredLocations" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_PreferredLocations_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentRequest_assessmentId_key" ON "AssessmentRequest"("assessmentId");

-- CreateIndex
CREATE INDEX "AssessmentRequest_playerProfileId_status_idx" ON "AssessmentRequest"("playerProfileId", "status");

-- CreateIndex
CREATE INDEX "AssessmentRequest_locationId_status_scheduledAt_idx" ON "AssessmentRequest"("locationId", "status", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "LevelDefinition_rank_key" ON "LevelDefinition"("rank");

-- CreateIndex
CREATE INDEX "TrainingRecord_playerProfileId_heldAt_idx" ON "TrainingRecord"("playerProfileId", "heldAt" DESC);

-- CreateIndex
CREATE INDEX "TrainingRecord_locationId_heldAt_idx" ON "TrainingRecord"("locationId", "heldAt" DESC);

-- CreateIndex
CREATE INDEX "_PreferredLocations_B_index" ON "_PreferredLocations"("B");

-- AddForeignKey
ALTER TABLE "AssessmentRequest" ADD CONSTRAINT "AssessmentRequest_playerProfileId_fkey" FOREIGN KEY ("playerProfileId") REFERENCES "PlayerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentRequest" ADD CONSTRAINT "AssessmentRequest_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentRequest" ADD CONSTRAINT "AssessmentRequest_assessorId_fkey" FOREIGN KEY ("assessorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentRequest" ADD CONSTRAINT "AssessmentRequest_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingRecord" ADD CONSTRAINT "TrainingRecord_playerProfileId_fkey" FOREIGN KEY ("playerProfileId") REFERENCES "PlayerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingRecord" ADD CONSTRAINT "TrainingRecord_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingRecord" ADD CONSTRAINT "TrainingRecord_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingRecord" ADD CONSTRAINT "TrainingRecord_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PreferredLocations" ADD CONSTRAINT "_PreferredLocations_A_fkey" FOREIGN KEY ("A") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PreferredLocations" ADD CONSTRAINT "_PreferredLocations_B_fkey" FOREIGN KEY ("B") REFERENCES "PlayerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;


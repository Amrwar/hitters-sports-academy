-- CreateEnum
CREATE TYPE "GameRequestKind" AS ENUM ('SOLO', 'PAIR');

-- CreateEnum
CREATE TYPE "GameJoinPolicy" AS ENUM ('OPEN', 'SOLO_ONLY', 'PAIRS_ONLY');

-- CreateEnum
CREATE TYPE "GameLevelPolicy" AS ENUM ('EXACT', 'ADJACENT');

-- CreateEnum
CREATE TYPE "PairStatus" AS ENUM ('PENDING', 'ACTIVE');

-- AlterEnum
ALTER TYPE "GameRequestStatus" ADD VALUE 'WAITLISTED';

-- AlterTable
ALTER TABLE "GameJoinRequest" ADD COLUMN     "decisionNote" VARCHAR(300),
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "kind" "GameRequestKind" NOT NULL DEFAULT 'SOLO',
ADD COLUMN     "pairId" TEXT,
ADD COLUMN     "reasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "score" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "spots" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "GameParticipant" ADD COLUMN     "pairId" TEXT;

-- AlterTable
ALTER TABLE "GameSession" ADD COLUMN     "joinPolicy" "GameJoinPolicy" NOT NULL DEFAULT 'OPEN',
ADD COLUMN     "levelPolicy" "GameLevelPolicy" NOT NULL DEFAULT 'EXACT',
ADD COLUMN     "pairId" TEXT;

-- CreateTable
CREATE TABLE "Pair" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(60),
    "playerAId" TEXT NOT NULL,
    "playerBId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "status" "PairStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pair_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchmakingConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "allowAdjacentLevels" BOOLEAN NOT NULL DEFAULT false,
    "requestExpiryHours" INTEGER NOT NULL DEFAULT 48,
    "maxOpenRequests" INTEGER NOT NULL DEFAULT 5,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatchmakingConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Pair_playerBId_status_idx" ON "Pair"("playerBId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Pair_playerAId_playerBId_key" ON "Pair"("playerAId", "playerBId");

-- AddForeignKey
ALTER TABLE "GameSession" ADD CONSTRAINT "GameSession_pairId_fkey" FOREIGN KEY ("pairId") REFERENCES "Pair"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameParticipant" ADD CONSTRAINT "GameParticipant_pairId_fkey" FOREIGN KEY ("pairId") REFERENCES "Pair"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameJoinRequest" ADD CONSTRAINT "GameJoinRequest_pairId_fkey" FOREIGN KEY ("pairId") REFERENCES "Pair"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pair" ADD CONSTRAINT "Pair_playerAId_fkey" FOREIGN KEY ("playerAId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pair" ADD CONSTRAINT "Pair_playerBId_fkey" FOREIGN KEY ("playerBId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pair" ADD CONSTRAINT "Pair_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


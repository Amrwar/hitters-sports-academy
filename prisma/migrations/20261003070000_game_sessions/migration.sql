-- CreateEnum
CREATE TYPE "GameFormat" AS ENUM ('SINGLES', 'DOUBLES', 'OPEN');

-- CreateEnum
CREATE TYPE "GameVisibility" AS ENUM ('PRIVATE', 'PUBLIC');

-- CreateEnum
CREATE TYPE "GameStatus" AS ENUM ('DRAFT', 'OPEN', 'FULL', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "GameCostMode" AS ENUM ('FREE', 'SPLIT_EVENLY', 'ORGANIZER_PAYS', 'FIXED_PER_PLAYER');

-- CreateEnum
CREATE TYPE "GameParticipantRole" AS ENUM ('ORGANIZER', 'PLAYER');

-- CreateEnum
CREATE TYPE "GameParticipantStatus" AS ENUM ('INVITED', 'ACCEPTED', 'DECLINED', 'LEFT', 'REMOVED');

-- CreateEnum
CREATE TYPE "GameRequestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'WITHDRAWN', 'EXPIRED');

-- CreateTable
CREATE TABLE "GameSession" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "courtId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "format" "GameFormat" NOT NULL DEFAULT 'DOUBLES',
    "maxPlayers" INTEGER NOT NULL DEFAULT 4,
    "levels" "PlayerLevel"[] DEFAULT ARRAY[]::"PlayerLevel"[],
    "matchType" "MatchTypePreference" NOT NULL DEFAULT 'ANY',
    "visibility" "GameVisibility" NOT NULL DEFAULT 'PRIVATE',
    "status" "GameStatus" NOT NULL DEFAULT 'DRAFT',
    "openToRequests" BOOLEAN NOT NULL DEFAULT false,
    "costMode" "GameCostMode" NOT NULL DEFAULT 'SPLIT_EVENLY',
    "costPerPlayerCents" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'EGP',
    "description" VARCHAR(500),
    "notes" VARCHAR(500),
    "publishedAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "cancelReason" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameParticipant" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "GameParticipantRole" NOT NULL DEFAULT 'PLAYER',
    "status" "GameParticipantStatus" NOT NULL DEFAULT 'INVITED',
    "invitedById" TEXT,
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameJoinRequest" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "GameRequestStatus" NOT NULL DEFAULT 'PENDING',
    "message" VARCHAR(300),
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameJoinRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GameSession_code_key" ON "GameSession"("code");

-- CreateIndex
CREATE UNIQUE INDEX "GameSession_bookingId_key" ON "GameSession"("bookingId");

-- CreateIndex
CREATE INDEX "GameSession_organizerId_startsAt_idx" ON "GameSession"("organizerId", "startsAt" DESC);

-- CreateIndex
CREATE INDEX "GameSession_locationId_startsAt_idx" ON "GameSession"("locationId", "startsAt");

-- CreateIndex
CREATE INDEX "GameSession_status_visibility_startsAt_idx" ON "GameSession"("status", "visibility", "startsAt");

-- CreateIndex
CREATE INDEX "GameParticipant_userId_status_idx" ON "GameParticipant"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "GameParticipant_sessionId_userId_key" ON "GameParticipant"("sessionId", "userId");

-- CreateIndex
CREATE INDEX "GameJoinRequest_sessionId_status_idx" ON "GameJoinRequest"("sessionId", "status");

-- CreateIndex
CREATE INDEX "GameJoinRequest_userId_status_idx" ON "GameJoinRequest"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "GameJoinRequest_sessionId_userId_key" ON "GameJoinRequest"("sessionId", "userId");

-- AddForeignKey
ALTER TABLE "GameSession" ADD CONSTRAINT "GameSession_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameSession" ADD CONSTRAINT "GameSession_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameSession" ADD CONSTRAINT "GameSession_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameSession" ADD CONSTRAINT "GameSession_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameSession" ADD CONSTRAINT "GameSession_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameParticipant" ADD CONSTRAINT "GameParticipant_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "GameSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameParticipant" ADD CONSTRAINT "GameParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameParticipant" ADD CONSTRAINT "GameParticipant_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameJoinRequest" ADD CONSTRAINT "GameJoinRequest_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "GameSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameJoinRequest" ADD CONSTRAINT "GameJoinRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameJoinRequest" ADD CONSTRAINT "GameJoinRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


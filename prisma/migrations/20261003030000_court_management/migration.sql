-- CreateEnum
CREATE TYPE "PricingRuleKind" AS ENUM ('PEAK', 'OFF_PEAK', 'WEEKEND', 'MEMBERSHIP_DISCOUNT', 'CUSTOM');

-- AlterTable
ALTER TABLE "Court" ADD COLUMN     "description" VARCHAR(500),
ADD COLUMN     "durationsMinutes" INTEGER[] DEFAULT ARRAY[]::INTEGER[];



-- AlterTable
ALTER TABLE "Location" ADD COLUMN     "description" VARCHAR(2000),
ADD COLUMN     "facilities" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "LocationPhoto" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "alt" VARCHAR(200),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LocationPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingPolicy" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "advanceBookingDays" INTEGER NOT NULL DEFAULT 14,
    "minNoticeMinutes" INTEGER NOT NULL DEFAULT 60,
    "cancellationCutoffHours" INTEGER NOT NULL DEFAULT 12,
    "maxActiveBookingsPerPlayer" INTEGER NOT NULL DEFAULT 3,
    "requireVerifiedEmail" BOOLEAN NOT NULL DEFAULT true,
    "allowedDurations" INTEGER[] DEFAULT ARRAY[60, 90, 120]::INTEGER[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingRule" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "courtId" TEXT,
    "name" TEXT NOT NULL,
    "kind" "PricingRuleKind" NOT NULL,
    "daysOfWeek" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "startsAt" INTEGER,
    "endsAt" INTEGER,
    "priceCents" INTEGER,
    "adjustmentPercent" INTEGER,
    "membershipTier" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PricingRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LocationPhoto_locationId_sortOrder_idx" ON "LocationPhoto"("locationId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "BookingPolicy_locationId_key" ON "BookingPolicy"("locationId");

-- CreateIndex
CREATE INDEX "PricingRule_locationId_active_priority_idx" ON "PricingRule"("locationId", "active", "priority");

-- CreateIndex
CREATE INDEX "PricingRule_courtId_idx" ON "PricingRule"("courtId");

-- AddForeignKey
ALTER TABLE "LocationPhoto" ADD CONSTRAINT "LocationPhoto_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingPolicy" ADD CONSTRAINT "BookingPolicy_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingRule" ADD CONSTRAINT "PricingRule_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingRule" ADD CONSTRAINT "PricingRule_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Data migration: preserve existing peak pricing as PEAK PricingRule rows (one per court and distinct window).
INSERT INTO "PricingRule" ("id", "locationId", "courtId", "name", "kind", "daysOfWeek", "startsAt", "endsAt", "priceCents", "priority", "active", "createdAt", "updatedAt")
SELECT DISTINCT ON (c."id", a."peakStartsAt", a."peakEndsAt", a."peakPriceCents")
       gen_random_uuid()::text, c."locationId", c."id", 'Peak hours', 'PEAK', ARRAY[]::INTEGER[], a."peakStartsAt", a."peakEndsAt", a."peakPriceCents", 100, true, NOW(), NOW()
FROM "CourtAvailability" a
JOIN "Court" c ON c."id" = a."courtId"
WHERE a."peakStartsAt" IS NOT NULL AND a."peakEndsAt" IS NOT NULL AND a."peakPriceCents" IS NOT NULL;

-- AlterTable
ALTER TABLE "CourtAvailability" DROP COLUMN "peakEndsAt",
DROP COLUMN "peakPriceCents",
DROP COLUMN "peakStartsAt";

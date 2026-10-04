-- CreateTable
CREATE TABLE "AcademySettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "name" VARCHAR(120) NOT NULL DEFAULT 'HITTERS Sports Academy',
    "tagline" VARCHAR(200),
    "supportEmail" VARCHAR(160) NOT NULL DEFAULT 'hello@hitters.academy',
    "supportPhone" VARCHAR(40),
    "defaultTimezone" TEXT NOT NULL DEFAULT 'Africa/Cairo',
    "currency" VARCHAR(8) NOT NULL DEFAULT 'EGP',
    "cancellationPolicy" VARCHAR(600) NOT NULL DEFAULT 'Free cancellation up to 12 hours before the booking. Later cancellations are charged in full.',
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademySettings_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "AcademySettings" ADD CONSTRAINT "AcademySettings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- CreateEnum
CREATE TYPE "PaymentIntentStatus" AS ENUM ('REQUIRES_ACTION', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PART_PAID', 'PAID', 'VOID', 'REFUNDED');

-- CreateEnum
CREATE TYPE "InvoiceLineKind" AS ENUM ('COURT', 'LESSON', 'PROGRAM', 'PACKAGE', 'MEMBERSHIP', 'FEE', 'DISCOUNT', 'CREDIT');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RefundDestination" AS ENUM ('ORIGINAL', 'CREDIT', 'CASH');

-- CreateEnum
CREATE TYPE "CreditEntryKind" AS ENUM ('TOPUP', 'REFUND', 'ADJUSTMENT', 'SPEND', 'EXPIRY');

-- CreateEnum
CREATE TYPE "MembershipTermStatus" AS ENUM ('PENDING', 'ACTIVE', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BillingPeriod" AS ENUM ('MONTHLY', 'QUARTERLY', 'ANNUAL');

-- CreateEnum
CREATE TYPE "CouponKind" AS ENUM ('PERCENT', 'FIXED');

-- CreateEnum
CREATE TYPE "PaymentTiming" AS ENUM ('AT_CLUB', 'ONLINE', 'BOTH');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PaymentMethod" ADD VALUE 'TRANSFER';
ALTER TYPE "PaymentMethod" ADD VALUE 'CREDIT';

-- AlterEnum
ALTER TYPE "PaymentStatus" ADD VALUE 'PARTIALLY_REFUNDED';

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "intentId" TEXT,
ADD COLUMN     "invoiceId" TEXT,
ADD COLUMN     "locationId" TEXT,
ADD COLUMN     "membershipId" TEXT,
ADD COLUMN     "note" VARCHAR(300),
ADD COLUMN     "payerId" TEXT,
ADD COLUMN     "receivedById" TEXT,
ADD COLUMN     "reference" VARCHAR(120);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "playerId" TEXT,
    "guestName" VARCHAR(120),
    "guestPhone" VARCHAR(40),
    "locationId" TEXT,
    "currency" VARCHAR(8) NOT NULL DEFAULT 'EGP',
    "subtotalCents" INTEGER NOT NULL DEFAULT 0,
    "discountCents" INTEGER NOT NULL DEFAULT 0,
    "creditCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "paidCents" INTEGER NOT NULL DEFAULT 0,
    "refundedCents" INTEGER NOT NULL DEFAULT 0,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "depositCents" INTEGER NOT NULL DEFAULT 0,
    "dueAt" TIMESTAMP(3),
    "issuedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "voidReason" VARCHAR(300),
    "note" VARCHAR(500),
    "bookingId" TEXT,
    "lessonId" TEXT,
    "enrollmentId" TEXT,
    "purchaseId" TEXT,
    "membershipId" TEXT,
    "gameParticipantId" TEXT,
    "couponId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceLine" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "kind" "InvoiceLineKind" NOT NULL,
    "description" VARCHAR(200) NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitCents" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentIntent" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "provider" VARCHAR(40) NOT NULL,
    "providerRef" VARCHAR(200),
    "amountCents" INTEGER NOT NULL,
    "currency" VARCHAR(8) NOT NULL DEFAULT 'EGP',
    "status" "PaymentIntentStatus" NOT NULL DEFAULT 'REQUIRES_ACTION',
    "idempotencyKey" TEXT NOT NULL,
    "returnUrl" VARCHAR(500),
    "checkoutUrl" VARCHAR(1000),
    "failureCode" VARCHAR(80),
    "failureMessage" VARCHAR(300),
    "expiresAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentIntent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" VARCHAR(40) NOT NULL,
    "eventId" VARCHAR(200) NOT NULL,
    "type" VARCHAR(120) NOT NULL,
    "payloadHash" VARCHAR(64) NOT NULL,
    "payload" JSONB NOT NULL,
    "signatureOk" BOOLEAN NOT NULL DEFAULT false,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "error" VARCHAR(500),

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "paymentId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "currency" VARCHAR(8) NOT NULL DEFAULT 'EGP',
    "destination" "RefundDestination" NOT NULL DEFAULT 'ORIGINAL',
    "status" "RefundStatus" NOT NULL DEFAULT 'PENDING',
    "reason" VARCHAR(300),
    "provider" VARCHAR(40),
    "providerRef" VARCHAR(200),
    "idempotencyKey" TEXT NOT NULL,
    "failureMessage" VARCHAR(300),
    "requestedById" TEXT,
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditAccount" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "currency" VARCHAR(8) NOT NULL DEFAULT 'EGP',
    "balanceCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditEntry" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "kind" "CreditEntryKind" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "balanceAfterCents" INTEGER NOT NULL,
    "reason" VARCHAR(300),
    "invoiceId" TEXT,
    "refundId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipPlan" (
    "id" TEXT NOT NULL,
    "key" VARCHAR(40) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "description" VARCHAR(500),
    "priceCents" INTEGER NOT NULL,
    "currency" VARCHAR(8) NOT NULL DEFAULT 'EGP',
    "period" "BillingPeriod" NOT NULL DEFAULT 'MONTHLY',
    "benefits" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "periodCreditCents" INTEGER NOT NULL DEFAULT 0,
    "freeAssessments" INTEGER NOT NULL DEFAULT 0,
    "priorityBookingDays" INTEGER NOT NULL DEFAULT 0,
    "locationId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MembershipPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "MembershipTermStatus" NOT NULL DEFAULT 'PENDING',
    "startsOn" DATE NOT NULL,
    "endsOn" DATE NOT NULL,
    "autoRenew" BOOLEAN NOT NULL DEFAULT false,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" VARCHAR(300),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Coupon" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "kind" "CouponKind" NOT NULL,
    "value" INTEGER NOT NULL,
    "maxDiscountCents" INTEGER,
    "minSpendCents" INTEGER,
    "appliesTo" "InvoiceLineKind"[] DEFAULT ARRAY[]::"InvoiceLineKind"[],
    "locationId" TEXT,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "maxRedemptions" INTEGER,
    "maxPerPlayer" INTEGER NOT NULL DEFAULT 1,
    "redeemedCount" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CouponRedemption" (
    "id" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "playerId" TEXT,
    "invoiceId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CouponRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentPolicy" (
    "id" TEXT NOT NULL,
    "locationId" TEXT,
    "timing" "PaymentTiming" NOT NULL DEFAULT 'AT_CLUB',
    "depositPercent" INTEGER NOT NULL DEFAULT 0,
    "lateCancellationPercent" INTEGER NOT NULL DEFAULT 0,
    "noShowPercent" INTEGER NOT NULL DEFAULT 0,
    "refundDestination" "RefundDestination" NOT NULL DEFAULT 'ORIGINAL',
    "refundCutoffHours" INTEGER NOT NULL DEFAULT 0,
    "defaultGameCostMode" "GameCostMode" NOT NULL DEFAULT 'SPLIT_EVENLY',
    "allowCredit" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_number_key" ON "Invoice"("number");

-- CreateIndex
CREATE INDEX "Invoice_playerId_createdAt_idx" ON "Invoice"("playerId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Invoice_locationId_status_idx" ON "Invoice"("locationId", "status");

-- CreateIndex
CREATE INDEX "Invoice_status_dueAt_idx" ON "Invoice"("status", "dueAt");

-- CreateIndex
CREATE INDEX "Invoice_bookingId_idx" ON "Invoice"("bookingId");

-- CreateIndex
CREATE INDEX "Invoice_lessonId_idx" ON "Invoice"("lessonId");

-- CreateIndex
CREATE INDEX "Invoice_enrollmentId_idx" ON "Invoice"("enrollmentId");

-- CreateIndex
CREATE INDEX "Invoice_purchaseId_idx" ON "Invoice"("purchaseId");

-- CreateIndex
CREATE INDEX "Invoice_membershipId_idx" ON "Invoice"("membershipId");

-- CreateIndex
CREATE INDEX "InvoiceLine_invoiceId_sortOrder_idx" ON "InvoiceLine"("invoiceId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentIntent_idempotencyKey_key" ON "PaymentIntent"("idempotencyKey");

-- CreateIndex
CREATE INDEX "PaymentIntent_invoiceId_createdAt_idx" ON "PaymentIntent"("invoiceId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "PaymentIntent_status_idx" ON "PaymentIntent"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentIntent_provider_providerRef_key" ON "PaymentIntent"("provider", "providerRef");

-- CreateIndex
CREATE INDEX "WebhookEvent_processedAt_idx" ON "WebhookEvent"("processedAt");

-- CreateIndex
CREATE INDEX "WebhookEvent_receivedAt_idx" ON "WebhookEvent"("receivedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_provider_eventId_key" ON "WebhookEvent"("provider", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "Refund_idempotencyKey_key" ON "Refund"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Refund_invoiceId_idx" ON "Refund"("invoiceId");

-- CreateIndex
CREATE INDEX "Refund_status_createdAt_idx" ON "Refund"("status", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "CreditAccount_playerId_key" ON "CreditAccount"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "CreditEntry_refundId_key" ON "CreditEntry"("refundId");

-- CreateIndex
CREATE INDEX "CreditEntry_accountId_createdAt_idx" ON "CreditEntry"("accountId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "MembershipPlan_key_key" ON "MembershipPlan"("key");

-- CreateIndex
CREATE INDEX "MembershipPlan_active_sortOrder_idx" ON "MembershipPlan"("active", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_code_key" ON "Membership"("code");

-- CreateIndex
CREATE INDEX "Membership_playerId_status_idx" ON "Membership"("playerId", "status");

-- CreateIndex
CREATE INDEX "Membership_status_endsOn_idx" ON "Membership"("status", "endsOn");

-- CreateIndex
CREATE UNIQUE INDEX "Coupon_code_key" ON "Coupon"("code");

-- CreateIndex
CREATE INDEX "Coupon_active_validTo_idx" ON "Coupon"("active", "validTo");

-- CreateIndex
CREATE UNIQUE INDEX "CouponRedemption_invoiceId_key" ON "CouponRedemption"("invoiceId");

-- CreateIndex
CREATE INDEX "CouponRedemption_couponId_playerId_idx" ON "CouponRedemption"("couponId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentPolicy_locationId_key" ON "PaymentPolicy"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Payment_invoiceId_idx" ON "Payment"("invoiceId");

-- CreateIndex
CREATE INDEX "Payment_locationId_paidAt_idx" ON "Payment"("locationId", "paidAt" DESC);

-- CreateIndex
CREATE INDEX "Payment_payerId_createdAt_idx" ON "Payment"("payerId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_intentId_fkey" FOREIGN KEY ("intentId") REFERENCES "PaymentIntent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_payerId_fkey" FOREIGN KEY ("payerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "ProgramEnrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "PackagePurchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_gameParticipantId_fkey" FOREIGN KEY ("gameParticipantId") REFERENCES "GameParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentIntent" ADD CONSTRAINT "PaymentIntent_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentIntent" ADD CONSTRAINT "PaymentIntent_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditAccount" ADD CONSTRAINT "CreditAccount_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditEntry" ADD CONSTRAINT "CreditEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CreditAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditEntry" ADD CONSTRAINT "CreditEntry_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditEntry" ADD CONSTRAINT "CreditEntry_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "Refund"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditEntry" ADD CONSTRAINT "CreditEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipPlan" ADD CONSTRAINT "MembershipPlan_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_planId_fkey" FOREIGN KEY ("planId") REFERENCES "MembershipPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentPolicy" ADD CONSTRAINT "PaymentPolicy_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;


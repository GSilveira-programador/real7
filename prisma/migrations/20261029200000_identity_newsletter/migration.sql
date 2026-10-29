ALTER TABLE "User" ADD COLUMN "roleVersion" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Session" ADD COLUMN "mfaVerifiedAt" TIMESTAMP(3);
ALTER TABLE "AuditLog" ADD COLUMN details JSONB;
ALTER TABLE "Subscriber" ADD COLUMN active BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "confirmHash" TEXT, ADD COLUMN "confirmExpiresAt" TIMESTAMP(3),
ADD COLUMN "unsubscribeHash" TEXT, ADD COLUMN "unsubscribeCipher" TEXT,
ADD COLUMN "confirmedAt" TIMESTAMP(3), ADD COLUMN "unsubscribedAt" TIMESTAMP(3),
ADD COLUMN "consentVersion" TEXT NOT NULL DEFAULT '2026-10-29-v1';
CREATE UNIQUE INDEX "Subscriber_confirmHash_key" ON "Subscriber"("confirmHash");
CREATE UNIQUE INDEX "Subscriber_unsubscribeHash_key" ON "Subscriber"("unsubscribeHash");

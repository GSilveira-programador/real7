ALTER TABLE "ReturnRequest" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "decisionNote" TEXT, ADD COLUMN "refundState" TEXT NOT NULL DEFAULT 'new', ADD COLUMN "refundId" TEXT;
UPDATE "ReturnRequest" SET "refundState" = 'confirmed' WHERE status = 'refunded';
CREATE INDEX "ReturnRequest_orderId_idx" ON "ReturnRequest"("orderId");

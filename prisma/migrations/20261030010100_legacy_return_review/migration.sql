-- Legacy received returns have no reliable record of prior refund attempts.
-- Never retry those financial operations automatically with the new key.
UPDATE "ReturnRequest" SET "refundState" = 'uncertain', "version" = "version" + 1
WHERE status = 'received' AND "refundState" = 'new' AND "version" = 0;

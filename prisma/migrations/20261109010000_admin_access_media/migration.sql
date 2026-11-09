CREATE TABLE "AdminInvitation" (
 id TEXT PRIMARY KEY, "tokenHash" TEXT NOT NULL UNIQUE, email TEXT NOT NULL,
 "expiresAt" TIMESTAMP(3) NOT NULL, "usedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AdminInvitation_expiresAt_idx" ON "AdminInvitation"("expiresAt");
CREATE TABLE "MediaAsset" (
 id TEXT PRIMARY KEY, bytes BYTEA NOT NULL, size INTEGER NOT NULL CHECK(size > 0 AND size <= 5242880),
 width INTEGER NOT NULL CHECK(width > 0 AND width <= 2400), height INTEGER NOT NULL CHECK(height > 0 AND height <= 2400),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

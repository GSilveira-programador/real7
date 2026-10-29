ALTER TABLE "Product" ADD COLUMN version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Variant" ADD COLUMN active BOOLEAN NOT NULL DEFAULT true, ADD COLUMN version INTEGER NOT NULL DEFAULT 0;
CREATE TABLE "Campaign" (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, active BOOLEAN NOT NULL DEFAULT false,
 "startsAt" TIMESTAMP(3) NOT NULL, "endsAt" TIMESTAMP(3) NOT NULL,
 "couponCode" TEXT REFERENCES "Coupon"(code) ON DELETE SET NULL ON UPDATE CASCADE,
 version INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT campaign_period CHECK ("endsAt">"startsAt")
);
CREATE TABLE "Banner" (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, subtitle TEXT NOT NULL,
 image TEXT NOT NULL, "imageAlt" TEXT NOT NULL, "ctaLabel" TEXT NOT NULL,
 href TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0, active BOOLEAN NOT NULL DEFAULT false,
 "startsAt" TIMESTAMP(3) NOT NULL, "endsAt" TIMESTAMP(3) NOT NULL,
 "campaignId" TEXT REFERENCES "Campaign"(id) ON DELETE SET NULL ON UPDATE CASCADE,
 version INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT banner_period CHECK ("endsAt">"startsAt"), CONSTRAINT banner_position CHECK (position>=0)
);
CREATE INDEX "Campaign_active_startsAt_endsAt_idx" ON "Campaign"(active,"startsAt","endsAt");
CREATE INDEX "Banner_active_position_startsAt_endsAt_idx" ON "Banner"(active,position,"startsAt","endsAt");

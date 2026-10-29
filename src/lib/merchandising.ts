import { z } from "zod";
import { db } from "./db";
export const imageUrl = z
  .string()
  .max(2000)
  .refine((value) => {
    if (/^\/images\/[a-zA-Z0-9._-]+$/.test(value)) return true;
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password;
    } catch {
      return false;
    }
  }, "Use uma imagem HTTPS autorizada ou um arquivo em /images/.");
export const internalHref = z
  .string()
  .max(500)
  .refine(
    (value) =>
      value.startsWith("/") &&
      !value.startsWith("//") &&
      !/[\\\x00-\x1f]/.test(value),
    "Use um caminho interno, como /catalogo.",
  );
const dates = { startsAt: z.iso.datetime(), endsAt: z.iso.datetime() };
export const campaignSchema = z
  .object({
    name: z.string().trim().min(3).max(120),
    active: z.boolean(),
    ...dates,
    couponCode: z.string().max(40).nullable(),
  })
  .refine(
    (v) => new Date(v.endsAt) > new Date(v.startsAt),
    "O fim da campanha deve ser posterior ao início.",
  );
export const bannerSchema = z
  .object({
    title: z.string().trim().min(3).max(100),
    subtitle: z.string().max(200),
    image: imageUrl,
    imageAlt: z.string().trim().min(5).max(180),
    ctaLabel: z.string().trim().min(3).max(45),
    href: internalHref,
    position: z.number().int().min(0).max(1000),
    active: z.boolean(),
    ...dates,
    campaignId: z.string().nullable(),
  })
  .refine(
    (v) => new Date(v.endsAt) > new Date(v.startsAt),
    "O fim do banner deve ser posterior ao início.",
  );
export async function activeBanners(now = new Date()) {
  const period = { active: true, startsAt: { lte: now }, endsAt: { gt: now } };
  return db.banner.findMany({
    where: { ...period, OR: [{ campaignId: null }, { campaign: period }] },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      title: true,
      subtitle: true,
      image: true,
      imageAlt: true,
      ctaLabel: true,
      href: true,
    },
    take: 20,
  });
}

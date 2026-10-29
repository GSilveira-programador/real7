import { db } from "@/lib/db";
export default async function sitemap() {
  const base = process.env.APP_URL || "http://localhost:3000";
  if (process.env.DEMO_MODE !== "false") return [];
  const products = await db.product.findMany({
    where: { active: true, demo: false },
    select: { slug: true },
  });
  return [
    { url: base },
    { url: base + "/catalogo" },
    ...products.map((p) => ({ url: base + "/produto/" + p.slug })),
  ];
}

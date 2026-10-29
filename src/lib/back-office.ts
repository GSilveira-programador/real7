import { changeUserRole } from "./user-administration";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "./db";
import { HttpError } from "./security";
import { bannerSchema, campaignSchema } from "./merchandising";
import { addVariant, editProduct, editVariant } from "./inventory";
import { salesReport } from "./reports";
export async function backOffice(
  req: Request,
  path: string[],
  read: () => Promise<unknown>,
  actorId: string,
) {
  const route = path.join("/"),
    method = req.method;
  if (
    path[1] === "users" &&
    path[2] &&
    path[3] === "role" &&
    path.length === 4 &&
    method === "PATCH"
  )
    return NextResponse.json(
      await changeUserRole(actorId, path[2], await read()),
    );
  if (route === "admin/reports" && method === "GET") {
    const q = new URL(req.url).searchParams;
    return NextResponse.json(
      await salesReport({ from: q.get("from"), to: q.get("to") }),
    );
  }
  if (
    path[1] === "products" &&
    path[2] &&
    path.length === 3 &&
    method === "PATCH"
  )
    return NextResponse.json(await editProduct(path[2], await read(), actorId));
  if (
    path[1] === "products" &&
    path[2] &&
    path[3] === "variants" &&
    method === "POST"
  )
    return NextResponse.json(await addVariant(path[2], await read(), actorId), {
      status: 201,
    });
  if (path[1] === "variants" && path[2] && method === "PATCH")
    return NextResponse.json(await editVariant(path[2], await read(), actorId));
  if (["banners", "campaigns"].includes(path[1])) {
    const banner = path[1] === "banners",
      id = path[2];
    if (method === "GET" && !id)
      return NextResponse.json(
        banner
          ? await db.banner.findMany({
              orderBy: [{ position: "asc" }, { createdAt: "desc" }],
            })
          : await db.campaign.findMany({
              orderBy: { createdAt: "desc" },
              include: { coupon: { select: { code: true, active: true } } },
            }),
      );
    if (method === "POST" && !id) {
      const data = banner
        ? bannerSchema.parse(await read())
        : campaignSchema.parse(await read());
      const item = await db.$transaction(async (tx) => {
        const value = banner
          ? await tx.banner.create({
              data: data as z.infer<typeof bannerSchema>,
            })
          : await tx.campaign.create({
              data: data as z.infer<typeof campaignSchema>,
            });
        await tx.auditLog.create({
          data: {
            actorId,
            action: banner ? "banner.create" : "campaign.create",
            entityId: value.id,
          },
        });
        return value;
      });
      return NextResponse.json(item, { status: 201 });
    }
    if ((method === "PUT" || method === "DELETE") && id) {
      const raw = await read();
      const { version } = z
        .object({ version: z.number().int().min(0) })
        .parse(raw);
      const data =
        method === "DELETE"
          ? { active: false }
          : banner
            ? bannerSchema.parse(raw)
            : campaignSchema.parse(raw);
      await db.$transaction(async (tx) => {
        const updated = banner
          ? await tx.banner.updateMany({
              where: { id, version },
              data: {
                ...(data as z.infer<typeof bannerSchema>),
                version: { increment: 1 },
              },
            })
          : await tx.campaign.updateMany({
              where: { id, version },
              data: {
                ...(data as z.infer<typeof campaignSchema>),
                version: { increment: 1 },
              },
            });
        if (!updated.count)
          throw new HttpError(
            409,
            "Conteúdo alterado por outro operador. Recarregue antes de salvar.",
          );
        await tx.auditLog.create({
          data: {
            actorId,
            action:
              (banner ? "banner." : "campaign.") +
              (method === "DELETE" ? "disable" : "update"),
            entityId: id,
          },
        });
      });
      return NextResponse.json({ ok: true });
    }
  }
  return null;
}

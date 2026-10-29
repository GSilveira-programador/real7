import {
  subscribe,
  requestSubscriptionPreferences,
  confirmSubscription,
  unsubscribe,
} from "@/lib/newsletter";
import { CartAvailabilityError } from "@/lib/commerce";
import { backOffice } from "@/lib/back-office";
import { activeBanners } from "@/lib/merchandising";
import { createCheckout } from "@/lib/checkout";
import { encrypt, decrypt } from "@/lib/encryption";
import { upload } from "@/lib/storage";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { Prisma, OrderStatus } from "@prisma/client";
import { Secret } from "otpauth";
import { db } from "@/lib/db";
import {
  user,
  requireUser,
  session,
  hash,
  token,
  origin,
  limit,
  audit,
  totp,
  HttpError,
} from "@/lib/security";
import {
  email,
  password,
  productSchema,
  addressSchema,
  checkoutSchema,
} from "@/lib/validation";
import { quote, shipping, settings, mail } from "@/lib/commerce";
import { mp, verifyWebhook, syncPayment } from "@/lib/payments";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const clean = (u: any) =>
  u
    ? {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        verified: u.verified,
        mfaEnabled: u.mfaEnabled,
      }
    : null;
async function handler(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    const { path } = await params;
    const route = path.join("/");
    const method = req.method;
    const get = method === "GET";
    const url = new URL(req.url);
    if (route === "webhooks/mercadopago" && method === "POST") {
      const id = url.searchParams.get("data.id");
      if (!id) throw new HttpError(400, "ID obrigatório.");
      verifyWebhook(req, id);
      return NextResponse.json(await syncPayment(id));
    }
    origin(req);
    const knownRoots = new Set([
      "health",
      "store",
      "banners",
      "catalog",
      "products",
      "auth",
      "cart",
      "shipping",
      "checkout",
      "orders",
      "favorites",
      "account",
      "reviews",
      "newsletter",
      "contact",
      "admin",
    ]);
    if (!knownRoots.has(path[0]))
      throw new HttpError(404, "Rota não encontrada.");
    await limit(
      "route:" + path[0] + (get ? ":read" : ":write"),
      get ? 2000 : 200,
    );
    const body = async () => {
      const reader = req.body?.getReader();
      if (!reader) return {};
      const chunks: Uint8Array[] = [];
      let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 65536) {
          await reader.cancel();
          throw new HttpError(413, "Conteúdo muito grande.");
        }
        chunks.push(value);
      }
      return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    };
    if (route === "health") {
      await db.$queryRaw`SELECT 1`;
      return NextResponse.json({ database: "ok" });
    }
    if (route === "banners" && get)
      return NextResponse.json(await activeBanners());
    if (route === "store" && get) return NextResponse.json(await settings());
    if (route === "catalog" && get) {
      const s = url.searchParams;
      const page = Math.max(1, Math.min(1000, Number(s.get("page")) || 1));
      const where: Prisma.ProductWhereInput = { active: true };
      if (s.get("q"))
        where.OR = [
          { name: { contains: s.get("q")!, mode: "insensitive" } },
          { brand: { name: { contains: s.get("q")!, mode: "insensitive" } } },
        ];
      if (s.get("category")) where.category = { slug: s.get("category")! };
      if (s.get("brand")) where.brand = { name: s.get("brand")! };
      if (s.get("ground")) where.ground = s.get("ground")!;
      if (s.get("color")) where.color = s.get("color")!;
      if (s.get("model"))
        where.model = { contains: s.get("model")!, mode: "insensitive" };
      if (s.get("min") || s.get("max"))
        where.price = {
          gte: Math.max(0, Math.round((Number(s.get("min")) || 0) * 100)),
          ...(s.get("max")
            ? { lte: Math.round(Number(s.get("max")) * 100) }
            : {}),
        };
      if (s.get("size") || s.get("stock"))
        where.variants = {
          some: {
            active: true,
            ...(s.get("size") ? { size: Number(s.get("size")) } : {}),
            stock: { gt: 0 },
          },
        };
      if (s.get("sale")) where.compareAt = { not: null };
      const orderBy: Prisma.ProductOrderByWithRelationInput =
        s.get("sort") === "price-asc"
          ? { price: "asc" }
          : s.get("sort") === "price-desc"
            ? { price: "desc" }
            : { createdAt: "desc" };
      let ranked: string[] | null = null;
      if (["bestsellers", "rating"].includes(s.get("sort") || "")) {
        const ids = (
          await db.product.findMany({ where, select: { id: true } })
        ).map((p) => p.id);
        if (ids.length) {
          const rows =
            s.get("sort") === "rating"
              ? await db.$queryRaw<{ id: string }[]>(
                  Prisma.sql`SELECT p.id FROM "Product" p LEFT JOIN "Review" r ON r."productId"=p.id AND r.approved=true WHERE p.id IN (${Prisma.join(ids)}) GROUP BY p.id ORDER BY COALESCE(AVG(r.rating),0) DESC,p."createdAt" DESC`,
                )
              : await db.$queryRaw<{ id: string }[]>(
                  Prisma.sql`SELECT p.id FROM "Product" p LEFT JOIN "Variant" v ON v."productId"=p.id LEFT JOIN "OrderItem" i ON i."variantId"=v.id LEFT JOIN "Order" o ON o.id=i."orderId" AND o.status IN ('PAID','PREPARING','SHIPPED','IN_TRANSIT','DELIVERED') WHERE p.id IN (${Prisma.join(ids)}) GROUP BY p.id ORDER BY COALESCE(SUM(CASE WHEN o.id IS NOT NULL THEN i.quantity ELSE 0 END),0) DESC,p."createdAt" DESC`,
                );
          ranked = rows.map((r) => r.id);
        } else ranked = [];
      }
      const [products, total, brands, categories] = await Promise.all([
        db.product.findMany({
          where: ranked
            ? { id: { in: ranked.slice((page - 1) * 12, page * 12) } }
            : where,
          include: {
            brand: true,
            category: true,
            images: { orderBy: { position: "asc" } },
            variants: true,
            reviews: { where: { approved: true }, select: { rating: true } },
          },
          orderBy,
          skip: ranked ? 0 : (page - 1) * 12,
          take: 12,
        }),
        db.product.count({ where }),
        db.brand.findMany(),
        db.category.findMany(),
      ]);
      if (ranked)
        products.sort((a, b) => ranked!.indexOf(a.id) - ranked!.indexOf(b.id));
      return NextResponse.json({
        products,
        total,
        page,
        pages: Math.ceil(total / 12),
        brands,
        categories,
      });
    }
    if (path[0] === "products" && path[1] && get) {
      const p = await db.product.findUnique({
        where: { slug: path[1], active: true },
        include: {
          brand: true,
          category: true,
          images: { orderBy: { position: "asc" } },
          variants: { orderBy: { size: "asc" } },
          reviews: {
            where: { approved: true },
            select: {
              rating: true,
              text: true,
              user: { select: { name: true } },
            },
          },
        },
      });
      if (!p) throw new HttpError(404, "Produto não encontrado.");
      return NextResponse.json(p);
    }
    if (route === "auth/me" && get)
      return NextResponse.json(clean(await user()));
    if (route === "auth/register" && method === "POST") {
      const d = z
        .object({ name: z.string().min(3).max(100), email, password })
        .parse(await body());
      await limit("register:" + hash(d.email), 3);
      if (!(await db.user.findUnique({ where: { email: d.email } }))) {
        const u = await db.user.create({
          data: {
            name: d.name,
            email: d.email,
            passwordHash: await bcrypt.hash(d.password, 12),
          },
        });
        const t = token();
        await db.authToken.create({
          data: {
            id: hash(t),
            userId: u.id,
            kind: "verify",
            expiresAt: new Date(Date.now() + 86400000),
          },
        });
        await mail(
          u.email,
          "Confirme seu cadastro",
          `${process.env.APP_URL}/conta?verify=${t}`,
        );
      }
      return NextResponse.json({
        message: "Se elegível, você receberá um e-mail de confirmação.",
      });
    }
    if (route === "auth/login" && method === "POST") {
      const d = z
        .object({
          email,
          password: z.string().max(100),
          code: z.string().optional(),
        })
        .parse(await body());
      await limit("login:" + hash(d.email), 5);
      const u = await db.user.findUnique({ where: { email: d.email } });
      const valid = await bcrypt.compare(
        d.password,
        u?.passwordHash ||
          "$2b$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW",
      );
      if (!u || u.deletedAt || !valid)
        throw new HttpError(401, "E-mail ou senha inválidos.");
      if (
        u.mfaEnabled &&
        (!d.code || !u.mfaSecret || !totp(decrypt(u.mfaSecret), d.code))
      )
        throw new HttpError(401, "Informe o código MFA.");
      await session(u.id, u.mfaEnabled, {
        passwordHash: u.passwordHash,
        mfaSecret: u.mfaSecret,
        roleVersion: u.roleVersion,
      });
      return NextResponse.json(clean(u));
    }
    if (route === "auth/logout" && method === "POST") {
      const t = (await cookies()).get("elite_session")?.value;
      if (t) await db.session.deleteMany({ where: { id: hash(t) } });
      (await cookies()).delete("elite_session");
      return NextResponse.json({ ok: true });
    }
    if (route === "auth/forgot" && method === "POST") {
      const d = z.object({ email }).parse(await body());
      await limit("forgot:" + hash(d.email), 3);
      const u = await db.user.findUnique({ where: { email: d.email } });
      if (u && !u.deletedAt) {
        const t = token();
        await db.authToken.create({
          data: {
            id: hash(t),
            userId: u.id,
            kind: "reset",
            expiresAt: new Date(Date.now() + 1800000),
          },
        });
        await mail(
          u.email,
          "Recuperar senha",
          `${process.env.APP_URL}/conta?reset=${t}`,
        );
      }
      return NextResponse.json({
        message: "Se houver uma conta, enviaremos instruções por e-mail.",
      });
    }
    if (["auth/reset", "auth/verify"].includes(route) && method === "POST") {
      const d = z
        .object({ token: z.string().length(64), password: password.optional() })
        .parse(await body());
      const kind = route.endsWith("reset") ? "reset" : "verify";
      if (kind === "reset" && !d.password)
        throw new HttpError(400, "Informe a nova senha.");
      await db.$transaction(async (tx) => {
        const t = await tx.authToken.findUnique({
          where: { id: hash(d.token) },
          include: { user: { select: { deletedAt: true } } },
        });
        if (
          !t ||
          t.user.deletedAt ||
          t.kind !== kind ||
          t.expiresAt < new Date()
        )
          throw new HttpError(400, "Link inválido.");
        const claimed = await tx.authToken.deleteMany({ where: { id: t.id } });
        if (!claimed.count) throw new HttpError(409, "Link já utilizado.");
        await tx.user.update({
          where: { id: t.userId, deletedAt: null },
          data:
            kind === "verify"
              ? { verified: true }
              : { passwordHash: await bcrypt.hash(d.password!, 12) },
        });
        if (kind === "reset")
          await tx.session.deleteMany({ where: { userId: t.userId } });
      });
      return NextResponse.json({ message: "Operação concluída." });
    }
    if (route === "auth/mfa/setup" && method === "POST") {
      const u = await requireUser();
      if (u.role === "CUSTOMER" || u.mfaEnabled)
        throw new HttpError(403, "Indisponível.");
      const secret = new Secret({ size: 20 }).base32;
      await db.user.update({
        where: { id: u.id },
        data: { mfaSecret: encrypt(secret) },
      });
      return NextResponse.json({
        secret,
        uri: `otpauth://totp/EliteBoots:${encodeURIComponent(u.email)}?secret=${secret}&issuer=EliteBoots`,
      });
    }
    if (route === "auth/mfa/enable" && method === "POST") {
      const u = await requireUser();
      const d = z.object({ code: z.string().length(6) }).parse(await body());
      await limit("mfa:" + u.id, 5);
      if (!u.mfaSecret || !totp(decrypt(u.mfaSecret), d.code))
        throw new HttpError(400, "Código inválido.");
      await db.user.update({ where: { id: u.id }, data: { mfaEnabled: true } });
      await db.session.deleteMany({ where: { userId: u.id } });
      return NextResponse.json({ message: "MFA ativado. Entre novamente." });
    }
    if (route === "cart/quote" && method === "POST") {
      const d = await body();
      const q = await quote(d.items, d.coupon);
      return NextResponse.json({
        subtotal: q.subtotal,
        discount: q.discount,
        total: q.subtotal - q.discount,
        lines: q.lines,
      });
    }
    if (route === "cart") {
      const jar = await cookies();
      let t = jar.get("elite_cart")?.value;
      if (get)
        return NextResponse.json(
          t
            ? (await db.cart.findUnique({ where: { id: hash(t) } }))?.items ||
                []
            : [],
        );
      if (method === "PUT") {
        const data = z
          .array(
            z.object({
              variantId: z.string().min(1).max(100),
              quantity: z.number().int().min(1).max(10),
            }),
          )
          .max(30)
          .refine(
            (items) =>
              new Set(items.map((i) => i.variantId)).size === items.length,
            "Variações duplicadas.",
          )
          .parse(await body());
        const created = !t;
        t = t || token();
        await db.cart.upsert({
          where: { id: hash(t) },
          create: { id: hash(t), items: data },
          update: { items: data },
        });
        if (created)
          jar.set("elite_cart", t, {
            httpOnly: true,
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
            path: "/",
            maxAge: 2592000,
          });
        return NextResponse.json({ ok: true });
      }
    }
    if (route === "shipping/quote" && method === "POST") {
      const d = await body();
      return NextResponse.json(await shipping(d.postcode, d.items, d.coupon));
    }
    if (route === "checkout" && method === "POST") {
      const result = await createCheckout(await body());
      return NextResponse.json(result.body, { status: result.status });
    }
    if (route === "orders" && get) {
      const u = await requireUser();
      return NextResponse.json(
        await db.order.findMany({
          where: { userId: u.id },
          include: { items: true, shipment: true },
          orderBy: { createdAt: "desc" },
        }),
      );
    }
    if (path[0] === "orders" && path[1]) {
      const u = await user();
      const o = await db.order.findUnique({
        where: { id: path[1] },
        include: { items: true, events: true, shipment: true, returns: true },
      });
      if (
        !o ||
        (u?.id !== o.userId &&
          hash(url.searchParams.get("access") || "") !== o.accessHash)
      )
        throw new HttpError(404, "Pedido não encontrado.");
      if (path[2] === "returns" && method === "POST") {
        const d = z
          .object({ reason: z.string().min(10).max(2000) })
          .parse(await body());
        if (
          !["PAID", "PREPARING", "SHIPPED", "IN_TRANSIT", "DELIVERED"].includes(
            o.status,
          )
        )
          throw new HttpError(400, "Pedido não elegível.");
        if (
          await db.returnRequest.findFirst({
            where: { orderId: o.id, status: "requested" },
          })
        )
          throw new HttpError(409, "Solicitação já existente.");
        return NextResponse.json(
          await db.returnRequest.create({
            data: { orderId: o.id, reason: d.reason },
          }),
        );
      }
      if (get) {
        const {
          accessHash,
          idempotencyKey,
          clientHash,
          requestHash,
          accessCipher,
          ...safe
        } = o;
        return NextResponse.json(safe);
      }
    }
    if (route === "favorites") {
      const u = await requireUser();
      if (get)
        return NextResponse.json(
          await db.favorite.findMany({
            where: { userId: u.id },
            include: {
              product: {
                include: { images: true, brand: true, variants: true },
              },
            },
          }),
        );
      const d = z.object({ productId: z.string() }).parse(await body());
      if (method === "DELETE")
        await db.favorite.deleteMany({
          where: { userId: u.id, productId: d.productId },
        });
      else
        await db.favorite.upsert({
          where: { userId_productId: { userId: u.id, productId: d.productId } },
          create: { userId: u.id, productId: d.productId },
          update: {},
        });
      return NextResponse.json({ ok: true });
    }
    if (route === "account/addresses") {
      const u = await requireUser();
      if (get)
        return NextResponse.json(
          await db.address.findMany({ where: { userId: u.id } }),
        );
      if (method === "POST")
        return NextResponse.json(
          await db.address.create({
            data: { ...addressSchema.parse(await body()), userId: u.id },
          }),
        );
      if (method === "DELETE") {
        const d = z.object({ id: z.string() }).parse(await body());
        await db.address.deleteMany({ where: { id: d.id, userId: u.id } });
        return NextResponse.json({ ok: true });
      }
    }
    if (route === "account" && method === "PATCH") {
      const u = await requireUser();
      const d = z
        .object({ name: z.string().min(3).max(100) })
        .parse(await body());
      return NextResponse.json(
        clean(await db.user.update({ where: { id: u.id }, data: d })),
      );
    }
    if (route === "account/export" && get) {
      const u = await requireUser();
      return NextResponse.json(
        await db.user.findUnique({
          where: { id: u.id },
          select: {
            name: true,
            email: true,
            createdAt: true,
            addresses: true,
            favorites: true,
            reviews: true,
            orders: { include: { items: true } },
          },
        }),
        {
          headers: {
            "Content-Disposition": 'attachment; filename="meus-dados.json"',
          },
        },
      );
    }
    if (route === "account" && method === "DELETE") {
      const u = await requireUser();
      const d = z.object({ password: z.string() }).parse(await body());
      if (
        u.role !== "CUSTOMER" ||
        !(await bcrypt.compare(d.password, u.passwordHash))
      )
        throw new HttpError(403, "Não autorizado.");
      await db.$transaction([
        db.session.deleteMany({ where: { userId: u.id } }),
        db.authToken.deleteMany({ where: { userId: u.id } }),
        db.subscriber.deleteMany({ where: { email: u.email } }),
        db.mail.deleteMany({
          where: {
            recipient: u.email,
            subject: {
              in: [
                "Confirme sua inscrição — Elite Boots",
                "Bem-vindo ao time Elite Boots",
                "Preferências de e-mail — Elite Boots",
                "Confirme seu cadastro",
                "Recuperar senha",
              ],
            },
          },
        }),
        db.address.deleteMany({ where: { userId: u.id } }),
        db.favorite.deleteMany({ where: { userId: u.id } }),
        db.user.update({
          where: { id: u.id },
          data: {
            name: "Conta excluída",
            email: `deleted-${u.id}@invalid.local`,
            passwordHash: token(),
            deletedAt: new Date(),
            verified: false,
            mfaEnabled: false,
            mfaSecret: null,
          },
        }),
      ]);
      (await cookies()).delete("elite_session");
      return NextResponse.json({
        message:
          "Conta anonimizada. Pedidos são retidos conforme obrigações legais.",
      });
    }
    if (route === "reviews" && method === "POST") {
      const u = await requireUser();
      const d = z
        .object({
          productId: z.string(),
          rating: z.number().int().min(1).max(5),
          text: z.string().min(10).max(1500),
        })
        .parse(await body());
      if (
        !(await db.orderItem.findFirst({
          where: {
            variant: { productId: d.productId },
            order: { userId: u.id, status: "DELIVERED" },
          },
        }))
      )
        throw new HttpError(403, "Avaliações somente após compra entregue.");
      return NextResponse.json(
        await db.review.create({ data: { ...d, userId: u.id } }),
      );
    }
    if (route === "newsletter" && method === "POST")
      return NextResponse.json(await subscribe(await body()));
    if (route === "newsletter/preferences" && method === "POST")
      return NextResponse.json(
        await requestSubscriptionPreferences(await body()),
      );
    if (route === "newsletter/confirm" && method === "POST")
      return NextResponse.json(await confirmSubscription(await body()));
    if (route === "newsletter/unsubscribe" && method === "POST")
      return NextResponse.json(await unsubscribe(await body()));
    if (route === "contact" && method === "POST") {
      const d = z
        .object({
          name: z.string().min(3).max(100),
          email,
          message: z.string().min(10).max(2000),
        })
        .parse(await body());
      await db.contact.create({ data: d });
      return NextResponse.json({ message: "Mensagem registrada." });
    }
    if (path[0] === "admin") {
      const u = await requireUser(["ADMIN", "MANAGER", "AGENT"]);
      if (route === "admin/dashboard" && get) {
        const [orders, products, customers, returns, contacts] =
          await Promise.all([
            db.order.findMany({
              take: 200,
              orderBy: { createdAt: "desc" },
              include: { items: true, payment: true, shipment: true },
            }),
            db.product.findMany({
              include: {
                brand: true,
                category: true,
                images: { orderBy: { position: "asc" } },
                variants: { orderBy: { size: "asc" } },
              },
            }),
            db.user.findMany({
              where: { deletedAt: null },
              select: {
                id: true,
                name: true,
                email: true,
                role: true,
                roleVersion: true,
                verified: true,
                mfaEnabled: true,
                deletedAt: true,
              },
              take: 100,
            }),
            db.returnRequest.findMany(),
            db.contact.findMany({ take: 100 }),
          ]);
        return NextResponse.json({
          orders,
          products,
          customers,
          returns,
          contacts,
          coupons: await db.coupon.findMany(),
          reviews: await db.review.findMany(),
          brands: await db.brand.findMany(),
          categories: await db.category.findMany(),
          settings: await settings(),
          campaigns: await db.campaign.findMany({
            orderBy: { createdAt: "desc" },
          }),
          banners: await db.banner.findMany({
            orderBy: [{ position: "asc" }, { createdAt: "desc" }],
          }),
        });
      }
      if (path[1] === "orders" && path[2] && method === "PATCH") {
        const d = z
          .object({
            status: z.nativeEnum(OrderStatus),
            trackingCode: z.string().max(100).optional(),
            trackingUrl: z.string().url().startsWith("https://").optional(),
          })
          .parse(await body());
        const transitions: Record<string, string[]> = {
          PAID: ["PREPARING"],
          PREPARING: ["SHIPPED"],
          SHIPPED: ["IN_TRANSIT", "DELIVERED"],
          IN_TRANSIT: ["DELIVERED"],
        };
        await db.$transaction(async (tx) => {
          const o = await tx.order.findUniqueOrThrow({
            where: { id: path[2] },
          });
          if (!transitions[o.status]?.includes(d.status))
            throw new HttpError(
              400,
              "Transição inválida. Pagamentos dependem do provedor.",
            );
          if (d.status === "SHIPPED" && !d.trackingCode)
            throw new HttpError(400, "Informe rastreio.");
          const changed = await tx.order.updateMany({
            where: { id: o.id, status: o.status },
            data: { status: d.status },
          });
          if (!changed.count) throw new HttpError(409, "Pedido alterado.");
          if (d.trackingCode)
            await tx.shipment.upsert({
              where: { orderId: o.id },
              create: {
                orderId: o.id,
                carrier: o.shippingService,
                trackingCode: d.trackingCode,
                trackingUrl: d.trackingUrl,
              },
              update: {
                trackingCode: d.trackingCode,
                trackingUrl: d.trackingUrl,
              },
            });
          await tx.orderEvent.create({
            data: {
              orderId: o.id,
              status: d.status,
              note: "Atualização logística.",
            },
          });
          await tx.mail.create({
            data: {
              recipient: o.email,
              subject: "Atualização de entrega",
              body: `Pedido ${o.id}: ${d.status}. ${d.trackingCode || ""}`,
            },
          });
        });
        await audit(u.id, "order.update", path[2]);
        return NextResponse.json({ ok: true });
      }
      if (!["ADMIN", "MANAGER"].includes(u.role))
        throw new HttpError(403, "Permissão de gerente necessária.");
      const response = await backOffice(req, path, body, u.id);
      if (response) return response;
      if (
        route === "admin/export" &&
        get &&
        url.searchParams.get("format") === "xlsx"
      ) {
        const Excel = await import("exceljs");
        const workbook = new Excel.Workbook();
        const sheet = workbook.addWorksheet("Pedidos");
        sheet.columns = [
          { header: "Pedido", key: "id", width: 30 },
          { header: "Data", key: "date", width: 24 },
          { header: "Status", key: "status", width: 20 },
          { header: "Total BRL", key: "total", width: 15 },
        ];
        for (const o of await db.order.findMany())
          sheet.addRow({
            id: o.id,
            date: o.createdAt.toISOString(),
            status: o.status,
            total: o.total / 100,
          });
        const bytes = await workbook.xlsx.writeBuffer();
        return new Response(new Uint8Array(bytes), {
          headers: {
            "Content-Type":
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Content-Disposition": "attachment; filename=pedidos.xlsx",
          },
        });
      }
      if (route === "admin/export" && get) {
        const cell = (v: unknown) =>
          '"' +
          String(v ?? "")
            .replace(/^[=+@-]/, "'")
            .replaceAll('"', '""') +
          '"';
        const orders = await db.order.findMany();
        return new Response(
          "\uFEFF" +
            [
              ["Pedido", "Data", "Status", "Total centavos"],
              ...orders.map((o) => [
                o.id,
                o.createdAt.toISOString(),
                o.status,
                o.total,
              ]),
            ]
              .map((row) => row.map(cell).join(";"))
              .join("\r\n"),
          {
            headers: {
              "Content-Type": "text/csv; charset=utf-8",
              "Content-Disposition": 'attachment; filename="pedidos.csv"',
            },
          },
        );
      }
      if (route === "admin/uploads" && method === "POST") {
        const result = await upload(req);
        await audit(u.id, "image.upload", result.url);
        return NextResponse.json(result);
      }
      if (route === "admin/products" && method === "POST") {
        const { image, variants, ...d } = productSchema.parse(await body());
        const p = await db.product.create({
          data: {
            ...d,
            images: { create: { url: image, alt: d.name } },
            variants: { create: variants },
          },
        });
        await audit(u.id, "product.create", p.id);
        return NextResponse.json(p);
      }
      if (path[1] === "products" && path[2] && path.length === 3) {
        if (method === "DELETE") {
          await db.product.update({
            where: { id: path[2] },
            data: { active: false, version: { increment: 1 } },
          });
          await audit(u.id, "product.archive", path[2]);
          return NextResponse.json({ ok: true });
        }
      }

      if (path[1] === "stock" && path[2] && method === "PATCH") {
        const d = z
          .object({ delta: z.number().int().min(-10000).max(10000) })
          .parse(await body());
        const v = await db.variant.updateMany({
          where: { id: path[2], stock: { gte: Math.max(0, -d.delta) } },
          data: { stock: { increment: d.delta } },
        });
        if (!v.count) throw new HttpError(409, "Estoque insuficiente.");
        await audit(u.id, "stock.adjust", path[2]);
        return NextResponse.json({ ok: true });
      }
      if (route === "admin/brands" && method === "POST")
        return NextResponse.json(
          await db.brand.create({
            data: z
              .object({ name: z.string().min(2).max(60) })
              .parse(await body()),
          }),
        );
      if (route === "admin/categories" && method === "POST")
        return NextResponse.json(
          await db.category.create({
            data: z
              .object({
                name: z.string().min(2).max(60),
                slug: z.string().regex(/^[a-z0-9-]+$/),
              })
              .parse(await body()),
          }),
        );
      if (route === "admin/coupons" && method === "POST") {
        const d = z
          .object({
            code: z.string().regex(/^[A-Z0-9-]{3,30}$/),
            percent: z.number().int().min(1).max(80),
            minimum: z.number().int().min(0),
            limit: z.number().int().min(1).nullable(),
          })
          .parse(await body());
        await audit(u.id, "coupon.create", d.code);
        return NextResponse.json(await db.coupon.create({ data: d }));
      }
      if (path[1] === "coupons" && path[2] && method === "DELETE") {
        await db.coupon.update({
          where: { code: path[2] },
          data: { active: false },
        });
        return NextResponse.json({ ok: true });
      }
      if (path[1] === "reviews" && path[2] && method === "PATCH") {
        const d = z.object({ approved: z.boolean() }).parse(await body());
        await db.review.update({ where: { id: path[2] }, data: d });
        await audit(u.id, "review.moderate", path[2]);
        return NextResponse.json({ ok: true });
      }
      if (route === "admin/settings" && method === "PUT") {
        if (u.role !== "ADMIN")
          throw new HttpError(403, "Somente administrador.");
        const d = z
          .object({
            company: z.string().max(150),
            cnpj: z.string().max(18),
            address: z.string().max(300),
            email: z.union([z.email(), z.literal("")]),
            whatsapp: z.string().regex(/^\d{10,13}$|^$/),
            hours: z.string().max(150),
            salesEnabled: z.boolean(),
            freeShippingMinimum: z.number().int().min(0),
            bannerTitle: z.string().min(3).max(100),
            bannerSubtitle: z.string().max(200),
          })
          .parse(await body());
        if (
          d.salesEnabled &&
          (!d.company ||
            !d.cnpj ||
            !d.address ||
            !d.email ||
            process.env.DEMO_MODE !== "false" ||
            !process.env.MP_ACCESS_TOKEN ||
            !process.env.MP_WEBHOOK_SECRET ||
            !process.env.MP_COLLECTOR_ID ||
            !process.env.SHIPPING_TOKEN ||
            !process.env.SMTP_HOST)
        )
          throw new HttpError(
            400,
            "Complete dados comerciais e integrações antes de ativar vendas.",
          );
        await db.setting.upsert({
          where: { key: "store" },
          create: { key: "store", value: d },
          update: { value: d },
        });
        await audit(u.id, "settings.update", "store");
        return NextResponse.json(d);
      }
      if (path[1] === "returns" && path[2] && method === "PATCH") {
        const d = z
          .object({
            status: z.enum(["approved", "rejected", "received", "refunded"]),
          })
          .parse(await body());
        const r = await db.returnRequest.findUniqueOrThrow({
          where: { id: path[2] },
          include: { order: { include: { payment: true } } },
        });
        const allowed: Record<string, string[]> = {
          requested: ["approved", "rejected"],
          approved: ["received"],
          received: ["refunded"],
        };
        if (!allowed[r.status]?.includes(d.status))
          throw new HttpError(409, "Transição de devolução inválida.");
        if (d.status === "refunded") {
          if (!r.order.payment?.providerId)
            throw new HttpError(409, "Pagamento não conciliado.");
          const refund = await mp(
            "/v1/payments/" + r.order.payment.providerId + "/refunds",
            { amount: r.order.total / 100 },
            "refund-" + r.id,
          );
          if (refund.status !== "approved")
            throw new HttpError(
              502,
              "Reembolso ainda não confirmado pelo provedor.",
            );
          await db.order.update({
            where: { id: r.orderId },
            data: { status: "REFUNDING" },
          });
          await db.orderEvent.create({
            data: {
              orderId: r.orderId,
              status: "REFUNDING",
              note: "Reembolso confirmado pela API; devolução em conciliação.",
            },
          });
          await mail(
            r.order.email,
            "Reembolso confirmado",
            `Pedido ${r.orderId}: o provedor confirmou o reembolso. Prazo de crédito depende da instituição financeira.`,
          );
        }
        const changed = await db.returnRequest.updateMany({
          where: { id: r.id, status: r.status },
          data: { status: d.status },
        });
        if (!changed.count) throw new HttpError(409, "Solicitação alterada.");
        await audit(u.id, "return." + d.status, r.id);
        return NextResponse.json({ ok: true });
      }
      if (route === "admin/audit" && get) {
        if (u.role !== "ADMIN") throw new HttpError(403, "Sem permissão.");
        return NextResponse.json(
          await db.auditLog.findMany({
            take: 100,
            orderBy: { createdAt: "desc" },
          }),
        );
      }
    }
    throw new HttpError(404, "Rota não encontrada.");
  } catch (e) {
    if (e instanceof z.ZodError)
      return NextResponse.json(
        {
          error: "Dados inválidos.",
          details: e.issues.map((i) => ({
            field: i.path.join("."),
            message: i.message,
          })),
        },
        { status: 400 },
      );
    if (e instanceof CartAvailabilityError)
      return NextResponse.json(
        { error: e.message, unavailable: e.unavailable },
        { status: 409 },
      );
    if (e instanceof HttpError)
      return NextResponse.json({ error: e.message }, { status: e.status });
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      ["P2002", "P2034"].includes(e.code)
    )
      return NextResponse.json(
        { error: "Conflito. Atualize os dados e tente novamente." },
        { status: 409 },
      );
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003")
      return NextResponse.json(
        {
          error: "Referência inválida ou ainda utilizada por outros registros.",
        },
        { status: 400 },
      );
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025")
      return NextResponse.json(
        { error: "Registro não encontrado." },
        { status: 404 },
      );
    if (e instanceof SyntaxError)
      return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
    console.error("api_error", e instanceof Error ? e.name : "unknown");
    return NextResponse.json(
      { error: "Não foi possível concluir a operação." },
      { status: 500 },
    );
  }
}
export {
  handler as GET,
  handler as POST,
  handler as PUT,
  handler as PATCH,
  handler as DELETE,
};

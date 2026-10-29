import { externalFetch } from "./external";
import { db } from "./db";
import { cartSchema } from "./validation";
import { HttpError } from "./security";
import { z } from "zod";
export function discountFor(subtotal: number, percent: number) {
  return Math.floor((subtotal * percent) / 100);
}
export class CartAvailabilityError extends HttpError {
  constructor(
    public unavailable: {
      variantId: string;
      name: string;
      size: number | null;
      availableStock: number;
    }[],
  ) {
    super(409, "Produto ou tamanho indisponível. Atualize o carrinho.");
  }
}
export async function quote(raw: unknown, code?: string) {
  const items = cartSchema.parse(raw);
  const variants = await db.variant.findMany({
    where: { id: { in: items.map((i) => i.variantId) } },
    include: {
      product: { include: { images: { orderBy: { position: "asc" } } } },
    },
  });
  const unavailable = items.flatMap((i) => {
    const v = variants.find((v) => v.id === i.variantId);
    return !v || !v.product.active || !v.active || v.stock < i.quantity
      ? [
          {
            variantId: i.variantId,
            name: v?.product.name || "Item indisponível",
            size: v?.size ?? null,
            availableStock: v && v.product.active && v.active ? v.stock : 0,
          },
        ]
      : [];
  });
  if (unavailable.length) throw new CartAvailabilityError(unavailable);
  const lines = items.map((i) => {
    const v = variants.find((v) => v.id === i.variantId)!;
    return { ...i, variant: v, price: v.product.price };
  });
  const subtotal = lines.reduce((s, i) => s + i.price * i.quantity, 0);
  const coupon = code
    ? await db.coupon.findUnique({ where: { code: code.trim().toUpperCase() } })
    : null;
  if (
    code &&
    (!coupon ||
      !coupon.active ||
      (coupon.expiresAt && coupon.expiresAt < new Date()) ||
      (coupon.limit !== null && coupon.used >= coupon.limit) ||
      subtotal < coupon.minimum)
  )
    throw new HttpError(
      400,
      "Cupom inválido, esgotado ou valor mínimo não atingido.",
    );
  return {
    lines,
    subtotal,
    discount: coupon ? discountFor(subtotal, coupon.percent) : 0,
    coupon,
  };
}
export async function settings() {
  return (
    ((await db.setting.findUnique({ where: { key: "store" } }))
      ?.value as Record<string, unknown>) || {}
  );
}
export async function shipping(postcode: string, raw: unknown, code?: string) {
  z.string()
    .regex(/^\d{8}$/)
    .parse(postcode);
  const q = await quote(raw, code);
  const s = await settings();
  if (!process.env.SHIPPING_TOKEN || !process.env.SHIPPING_ORIGIN_POSTCODE)
    throw new HttpError(
      503,
      "Frete ainda não configurado. A loja não está habilitada para vendas.",
    );
  const base =
    process.env.SHIPPING_API_URL || "https://sandbox.melhorenvio.com.br/api/v2";
  if (
    ![
      "https://sandbox.melhorenvio.com.br/api/v2",
      "https://melhorenvio.com.br/api/v2",
    ].includes(base)
  )
    throw new HttpError(503, "Endpoint de frete inválido.");
  const res = await externalFetch(base + "/me/shipment/calculate", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.SHIPPING_TOKEN}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "JNChuteiras ecommerce",
    },
    body: JSON.stringify({
      from: { postal_code: process.env.SHIPPING_ORIGIN_POSTCODE },
      to: { postal_code: postcode },
      products: q.lines.map((i) => ({
        id: i.variantId,
        width: i.variant.product.widthCm,
        height: i.variant.product.heightCm,
        length: i.variant.product.lengthCm,
        weight: i.variant.product.weightGrams / 1000,
        insurance_value: i.price / 100,
        quantity: i.quantity,
      })),
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok)
    throw new HttpError(
      502,
      "Não foi possível consultar o frete. Tente novamente.",
    );
  const data: any = await res.json();
  if (!Array.isArray(data))
    throw new HttpError(502, "Resposta de frete inválida.");
  return data
    .filter((v: any) => !v.error && v.price && v.delivery_time)
    .map((v: any) => ({
      id: String(v.id),
      name: `${v.company?.name || ""} ${v.name}`,
      price:
        typeof s.freeShippingMinimum === "number" &&
        s.freeShippingMinimum > 0 &&
        q.subtotal - q.discount >= s.freeShippingMinimum
          ? 0
          : Math.round(Number(v.price) * 100),
      days: Number(v.delivery_time),
    }));
}
export async function mail(recipient: string, subject: string, body: string) {
  await db.mail.create({ data: { recipient, subject, body } });
}
export async function releaseOrder(orderId: string) {
  return db.$transaction(async (tx) => {
    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { items: true },
    });
    const changed = await tx.order.updateMany({
      where: { id: orderId, status: "PENDING", stockReleased: false },
      data: { status: "CANCELLED", stockReleased: true },
    });
    if (!changed.count) return false;
    for (const item of order.items)
      await tx.variant.update({
        where: { id: item.variantId },
        data: { stock: { increment: item.quantity } },
      });
    if (order.couponCode)
      await tx.coupon.update({
        where: { code: order.couponCode },
        data: { used: { decrement: 1 } },
      });
    await tx.orderEvent.create({
      data: {
        orderId,
        status: "CANCELLED",
        note: "Reserva liberada após cancelamento confirmado.",
      },
    });
    return true;
  });
}

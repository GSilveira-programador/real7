import { cookies } from "next/headers";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { checkoutSchema } from "./validation";
import { user, hash, token, HttpError } from "./security";
import { encrypt, decrypt } from "./encryption";
import { quote, shipping, settings } from "./commerce";
import { mp } from "./payments";
export async function createCheckout(raw: unknown) {
  const d = checkoutSchema.parse(raw),
    u = await user(),
    s = await settings();
  if (!s.salesEnabled || process.env.DEMO_MODE !== "false")
    throw new HttpError(
      503,
      "Loja demonstrativa. Compras reais estão desativadas.",
    );
  if (
    !process.env.MP_ACCESS_TOKEN ||
    !process.env.MP_WEBHOOK_SECRET ||
    !process.env.MP_COLLECTOR_ID ||
    !process.env.SMTP_HOST
  )
    throw new HttpError(503, "Integrações pendentes.");
  if (u && !u.verified) throw new HttpError(403, "Verifique seu e-mail.");
  const cookieStore = await cookies();
  let cartToken = cookieStore.get("elite_cart")?.value;
  if (!cartToken) {
    cartToken = token();
    cookieStore.set("elite_cart", cartToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 2592000,
    });
  }
  const clientHash = u ? "user:" + hash(u.id) : hash(cartToken);
  const requestHash = hash(JSON.stringify(d));
  let order = await db.order.findUnique({
    where: { idempotencyKey: d.idempotencyKey },
    include: { payment: true },
  });
  let access: string;
  if (order) {
    if (
      order.clientHash !== clientHash ||
      order.requestHash !== requestHash ||
      !order.accessCipher
    )
      throw new HttpError(
        409,
        "Tentativa já recebida ou dados alterados. Consulte seu pedido.",
      );
    access = decrypt(order.accessCipher);
    if (order.status !== "PENDING")
      return { status: 200, body: { id: order.id, access, checkoutUrl: null } };
    if (order.payment?.checkoutUrl)
      return {
        status: 200,
        body: { id: order.id, access, checkoutUrl: order.payment.checkoutUrl },
      };
  } else {
    const q = await quote(d.items, d.coupon);
    if (q.lines.some((l) => l.variant.product.demo))
      throw new HttpError(400, "Produtos fictícios não podem ser vendidos.");
    const options = await shipping(d.address.postcode, d.items, d.coupon);
    const selected = options.find((s: any) => s.id === d.shippingId);
    if (!selected) throw new HttpError(400, "Frete indisponível.");
    access = token();
    order = await db.$transaction(
      async (tx) => {
        for (const l of q.lines) {
          const changed = await tx.variant.updateMany({
            where: {
              id: l.variantId,
              active: true,
              stock: { gte: l.quantity },
              product: { active: true, price: l.price, demo: false },
            },
            data: { stock: { decrement: l.quantity } },
          });
          if (!changed.count)
            throw new HttpError(409, "Estoque ou preço mudou.");
        }
        if (q.coupon) {
          const changed = await tx.coupon.updateMany({
            where: {
              code: q.coupon.code,
              active: true,
              used: q.coupon.used,
              OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
            },
            data: { used: { increment: 1 } },
          });
          if (!changed.count) throw new HttpError(409, "Cupom mudou.");
        }
        const created = await tx.order.create({
          data: {
            clientHash,
            requestHash,
            accessCipher: encrypt(access),
            accessHash: hash(access),
            idempotencyKey: d.idempotencyKey,
            userId: u?.id,
            email: d.email,
            name: d.name,
            phone: d.phone,
            address: d.address,
            subtotal: q.subtotal,
            discount: q.discount,
            shipping: selected.price,
            total: q.subtotal - q.discount + selected.price,
            shippingService: selected.name,
            couponCode: q.coupon?.code,
            expiresAt: new Date(Date.now() + 86400000),
            items: {
              create: q.lines.map((l) => ({
                variantId: l.variantId,
                name: l.variant.product.name,
                size: l.variant.size,
                quantity: l.quantity,
                price: l.price,
              })),
            },
            payment: { create: {} },
            events: {
              create: {
                status: "PENDING",
                note: "Estoque reservado; aguardando pagamento.",
              },
            },
          },
          include: { payment: true },
        });
        await tx.mail.create({
          data: {
            recipient: d.email,
            subject: "Pedido recebido — Elite Boots",
            body: `Pedido pendente. Acompanhe com segurança: ${process.env.APP_URL}/pedido/${created.id}?access=${access}. Este link é privado.`,
          },
        });
        return created;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
  // Atomic claim ensures only one provider preference creation attempt per order.
  const claimed = await db.payment.updateMany({
    where: { orderId: order.id, creationState: "new" },
    data: { creationState: "creating" },
  });
  if (!claimed.count)
    return {
      status: 202,
      body: {
        id: order.id,
        access,
        checkoutUrl: null,
        message:
          "Pedido reservado. Aguarde a conciliação ou consulte o atendimento antes de tentar pagar novamente.",
      },
    };
  try {
    const base = process.env.APP_URL!;
    const pref = await mp(
      "/checkout/preferences",
      {
        external_reference: order.id,
        items: [
          {
            id: order.id,
            title: `Elite Boots — ${order.id}`,
            quantity: 1,
            currency_id: "BRL",
            unit_price: order.total / 100,
          },
        ],
        payer: { email: d.email },
        back_urls: Object.fromEntries(
          ["success", "pending", "failure"].map((k) => [
            k,
            `${base}/pedido/${order!.id}?access=${access}`,
          ]),
        ),
        notification_url: `${base}/api/webhooks/mercadopago`,
        expires: true,
        expiration_date_to: order.expiresAt.toISOString(),
      },
      d.idempotencyKey,
    );
    const checkoutUrl = String(pref.init_point),
      url = new URL(checkoutUrl);
    if (
      url.protocol !== "https:" ||
      !url.hostname.endsWith(".mercadopago.com.br")
    )
      throw new HttpError(502, "URL de pagamento inválida.");
    await db.payment.update({
      where: { orderId: order.id },
      data: {
        creationState: "ready",
        preferenceId: String(pref.id),
        checkoutUrl,
      },
    });
    return { status: 201, body: { id: order.id, access, checkoutUrl } };
  } catch {
    await db.payment.update({
      where: { orderId: order.id },
      data: { creationState: "uncertain" },
    });
    return {
      status: 202,
      body: {
        id: order.id,
        access,
        checkoutUrl: null,
        message:
          "Pedido recebido; a resposta do provedor não foi confirmada. Nenhuma nova preferência será criada automaticamente. Acompanhe seu pedido ou fale com a loja.",
      },
    };
  }
}

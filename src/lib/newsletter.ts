import { z } from "zod";
import { db } from "./db";
import { email } from "./validation";
import { hash, token, limit, HttpError } from "./security";
import { encrypt, decrypt } from "./encryption";
const privateToken = z.string().regex(/^[a-f0-9]{64}$/);
export const consentVersion = "2026-10-29-v1";
export async function subscribe(input: unknown) {
  const d = z.object({ email, consent: z.literal(true) }).parse(input);
  await limit("newsletter:" + hash(d.email), 3);
  const confirm = token(),
    unsubscribe = token(),
    now = new Date();
  await db.$transaction(async (tx) => {
    const existing = await tx.subscriber.findUnique({
      where: { email: d.email },
    });
    if (existing?.active) return;
    const values = {
      active: false,
      confirmHash: hash(confirm),
      confirmExpiresAt: new Date(now.getTime() + 86400000),
      unsubscribeHash: hash(unsubscribe),
      unsubscribeCipher: encrypt(unsubscribe),
      consentAt: now,
      confirmedAt: null,
      unsubscribedAt: null,
      consentVersion,
    };
    await tx.subscriber.upsert({
      where: { email: d.email },
      create: { email: d.email, ...values },
      update: values,
    });
    const base = process.env.APP_URL || "http://localhost:3000";
    await tx.mail.create({
      data: {
        recipient: d.email,
        subject: "Confirme sua inscrição — Elite Boots",
        body: `Você solicitou receber novidades da Elite Boots. Confirme em até 24 horas: ${base}/newsletter?confirm=${confirm}\n\nNão foi você ou mudou de ideia? Cancele a inscrição: ${base}/newsletter?unsubscribe=${unsubscribe}\n\nA inscrição só será ativada após a confirmação. Política de privacidade: ${base}/legal/privacidade`,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: "newsletter",
        action: "newsletter.requested",
        entityId: hash(d.email),
        details: { consentVersion },
      },
    });
  });
  return {
    message:
      "Se o endereço for elegível, enviaremos um link de confirmação. Confira seu e-mail.",
  };
}
export async function confirmSubscription(input: unknown) {
  const d = z.object({ token: privateToken }).parse(input),
    now = new Date();
  await db.$transaction(async (tx) => {
    const subscriber = await tx.subscriber.findUnique({
      where: { confirmHash: hash(d.token) },
    });
    if (
      !subscriber ||
      !subscriber.confirmExpiresAt ||
      subscriber.confirmExpiresAt <= now ||
      !subscriber.unsubscribeCipher
    )
      throw new HttpError(
        400,
        "Link inválido ou expirado. Solicite uma nova inscrição na página inicial.",
      );
    const changed = await tx.subscriber.updateMany({
      where: {
        email: subscriber.email,
        active: false,
        confirmHash: hash(d.token),
        confirmExpiresAt: { gt: now },
      },
      data: {
        active: true,
        confirmedAt: now,
        confirmHash: null,
        confirmExpiresAt: null,
      },
    });
    if (!changed.count) throw new HttpError(409, "Este link já foi utilizado.");
    const unsubscribe = decrypt(subscriber.unsubscribeCipher),
      base = process.env.APP_URL || "http://localhost:3000";
    await tx.mail.create({
      data: {
        recipient: subscriber.email,
        subject: "Bem-vindo ao time Elite Boots",
        body: `Sua inscrição foi confirmada. Você pode cancelar a qualquer momento: ${base}/newsletter?unsubscribe=${unsubscribe}\n\nNão haverá envio promocional enquanto as campanhas de e-mail não estiverem configuradas.`,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: "newsletter",
        action: "newsletter.confirmed",
        entityId: hash(subscriber.email),
        details: { consentVersion: subscriber.consentVersion },
      },
    });
  });
  return {
    message: "Inscrição confirmada. Você faz parte do time Elite Boots!",
  };
}
export async function unsubscribe(input: unknown) {
  const d = z.object({ token: privateToken }).parse(input);
  await db.$transaction(async (tx) => {
    const subscriber = await tx.subscriber.findUnique({
      where: { unsubscribeHash: hash(d.token) },
    });
    if (!subscriber) return;
    const changed = await tx.subscriber.updateMany({
      where: { email: subscriber.email, unsubscribeHash: hash(d.token) },
      data: {
        active: false,
        unsubscribedAt: new Date(),
        confirmHash: null,
        confirmExpiresAt: null,
        unsubscribeHash: null,
        unsubscribeCipher: null,
      },
    });
    if (changed.count)
      await tx.mail.deleteMany({
        where: {
          recipient: subscriber.email,
          sentAt: null,
          subject: {
            in: [
              "Confirme sua inscrição — Elite Boots",
              "Bem-vindo ao time Elite Boots",
              "Preferências de e-mail — Elite Boots",
            ],
          },
        },
      });
    if (changed.count)
      await tx.auditLog.create({
        data: {
          actorId: "newsletter",
          action: "newsletter.unsubscribed",
          entityId: hash(subscriber.email),
          details: { consentVersion: subscriber.consentVersion },
        },
      });
  });
  return {
    message:
      "Se o link era válido, o descadastro foi aplicado. Você pode fechar esta página.",
  };
}

export async function requestSubscriptionPreferences(input: unknown) {
  const d = z.object({ email }).parse(input);
  await limit("newsletter-preferences:" + hash(d.email), 3);
  const subscriber = await db.subscriber.findUnique({
    where: { email: d.email },
  });
  if (subscriber?.unsubscribeCipher) {
    const raw = decrypt(subscriber.unsubscribeCipher),
      base = process.env.APP_URL || "http://localhost:3000";
    await db.mail.create({
      data: {
        recipient: d.email,
        subject: "Preferências de e-mail — Elite Boots",
        body: `Você solicitou gerenciar sua inscrição. Para cancelar, use este link privado: ${base}/newsletter?unsubscribe=${raw}\n\nNão é necessário entrar em uma conta. Se não fez esta solicitação, ignore a mensagem.`,
      },
    });
  }
  return {
    message:
      "Se houver uma inscrição elegível, enviaremos o link de preferências para esse e-mail.",
  };
}

import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
import {
  subscribe,
  confirmSubscription,
  unsubscribe,
  consentVersion,
} from "../src/lib/newsletter";
import { hash } from "../src/lib/security";
const addresses: string[] = [];
beforeAll(() => {
  process.env.MFA_ENCRYPTION_KEY = "fe".repeat(32);
});
afterAll(async () => {
  await db.mail.deleteMany({ where: { recipient: { in: addresses } } });
  await db.subscriber.deleteMany({ where: { email: { in: addresses } } });
  await db.rateLimit.deleteMany({
    where: { key: { in: addresses.map((a) => "newsletter:" + hash(a)) } },
  });
  await db.auditLog.deleteMany({
    where: { entityId: { in: addresses.map(hash) } },
  });
  await db.$disconnect();
});
function address() {
  const value = "newsletter-" + randomUUID() + "@example.invalid";
  addresses.push(value);
  return value;
}
async function links(email: string) {
  const mail = await db.mail.findFirstOrThrow({
    where: {
      recipient: email,
      subject: "Confirme sua inscrição — Elite Boots",
    },
    orderBy: { createdAt: "desc" },
  });
  return {
    confirm: mail.body.match(/\?confirm=([a-f0-9]{64})/)![1],
    unsubscribe: mail.body.match(/\?unsubscribe=([a-f0-9]{64})/)![1],
  };
}
it("exige consentimento e não ativa newsletter apenas com cadastro", async () => {
  const email = address();
  await expect(subscribe({ email, consent: false })).rejects.toThrow();
  await subscribe({ email, consent: true });
  const row = await db.subscriber.findUniqueOrThrow({ where: { email } }),
    tokens = await links(email);
  expect(row.active).toBe(false);
  expect(row.confirmedAt).toBe(null);
  expect(row.consentVersion).toBe(consentVersion);
  expect(row.confirmHash).toBe(hash(tokens.confirm));
  expect(row.unsubscribeCipher).not.toContain(tokens.unsubscribe);
});
it("confirma uma única vez, cria boas-vindas e não revela cadastro pela resposta", async () => {
  const email = address();
  const first = await subscribe({ email, consent: true });
  const tokens = await links(email);
  await confirmSubscription({ token: tokens.confirm });
  expect(
    (await db.subscriber.findUniqueOrThrow({ where: { email } })).active,
  ).toBe(true);
  await expect(
    confirmSubscription({ token: tokens.confirm }),
  ).rejects.toThrow();
  const again = await subscribe({ email, consent: true });
  expect(again).toEqual(first);
  expect(
    await db.mail.count({
      where: { recipient: email, subject: "Bem-vindo ao time Elite Boots" },
    }),
  ).toBe(1);
  expect(
    await db.mail.count({
      where: {
        recipient: email,
        subject: "Confirme sua inscrição — Elite Boots",
      },
    }),
  ).toBe(1);
});
it("links expirados não ativam a inscrição", async () => {
  const email = address();
  await subscribe({ email, consent: true });
  const tokens = await links(email);
  await db.subscriber.update({
    where: { email },
    data: { confirmExpiresAt: new Date(Date.now() - 1) },
  });
  await expect(confirmSubscription({ token: tokens.confirm })).rejects.toThrow(
    /expirado/,
  );
  expect(
    (await db.subscriber.findUniqueOrThrow({ where: { email } })).active,
  ).toBe(false);
});
it("descadastro é idempotente e invalida confirmação pendente", async () => {
  const email = address();
  await subscribe({ email, consent: true });
  const tokens = await links(email);
  const first = await unsubscribe({ token: tokens.unsubscribe });
  expect(await unsubscribe({ token: tokens.unsubscribe })).toEqual(first);
  await expect(
    confirmSubscription({ token: tokens.confirm }),
  ).rejects.toThrow();
  const row = await db.subscriber.findUniqueOrThrow({ where: { email } });
  expect(row.unsubscribedAt).not.toBe(null);
  expect(row.active).toBe(false);
  expect(row.unsubscribeCipher).toBe(null);
});
it("uma nova inscrição exige novo consentimento; link antigo não cancela a nova", async () => {
  const email = address();
  await subscribe({ email, consent: true });
  const old = await links(email);
  await confirmSubscription({ token: old.confirm });
  await unsubscribe({ token: old.unsubscribe });
  await subscribe({ email, consent: true });
  const fresh = await links(email);
  expect(fresh.confirm).not.toBe(old.confirm);
  expect(fresh.unsubscribe).not.toBe(old.unsubscribe);
  await confirmSubscription({ token: fresh.confirm });
  await unsubscribe({ token: old.unsubscribe });
  expect(
    (await db.subscriber.findUniqueOrThrow({ where: { email } })).active,
  ).toBe(true);
});
it("envia preferências só ao endereço inscrito e mantém resposta genérica", async () => {
  const { requestSubscriptionPreferences } =
    await import("../src/lib/newsletter");
  const email = address();
  await subscribe({ email, consent: true });
  const tokens = await links(email);
  await confirmSubscription({ token: tokens.confirm });
  const answer = await requestSubscriptionPreferences({ email });
  const mail = await db.mail.findFirstOrThrow({
    where: {
      recipient: email,
      subject: "Preferências de e-mail — Elite Boots",
    },
  });
  expect(mail.body).toContain("?unsubscribe=" + tokens.unsubscribe);
  const unknown = address();
  expect(await requestSubscriptionPreferences({ email: unknown })).toEqual(
    answer,
  );
  expect(await db.mail.count({ where: { recipient: unknown } })).toBe(0);
});

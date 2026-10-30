import { beforeAll, beforeEach, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
import {
  configurationReadiness,
  saveStoreSettings,
  storeSettingsSchema,
  validCnpj,
} from "../src/lib/store-settings";
import { settings } from "../src/lib/commerce";
const actor = "settings-test-" + randomUUID();
let original: any;
const input = {
  version: 0,
  company: "",
  cnpj: "",
  address: "",
  email: "",
  whatsapp: "",
  hours: "Atendimento pendente",
  salesEnabled: false,
  freeShippingMinimum: 0,
  bannerTitle: "SEU JOGO.",
  bannerSubtitle: "Ambiente de teste.",
  instagram: "",
  facebook: "",
  youtube: "",
  nationwideShipping: false,
  legalReviewed: false,
};
beforeAll(async () => {
  original = await db.setting.findUnique({ where: { key: "store" } });
});
beforeEach(async () => {
  await db.setting.upsert({
    where: { key: "store" },
    create: { key: "store", value: input, version: 0 },
    update: { value: input, version: 0 },
  });
  await db.auditLog.deleteMany({ where: { actorId: actor } });
});
afterAll(async () => {
  if (original)
    await db.setting.update({
      where: { key: "store" },
      data: { value: original.value, version: original.version },
    });
  else await db.setting.delete({ where: { key: "store" } });
  await db.auditLog.deleteMany({ where: { actorId: actor } });
  await db.$disconnect();
});
it("valida CNPJ numérico e rejeita dígito incorreto ou repetição", () => {
  expect(validCnpj("04.252.011/0001-10")).toBe(true);
  for (const value of [
    "04.252.011/0001-11",
    "00000000000000",
    "11111111111111",
    "",
    "not-a-cnpj",
  ])
    expect(validCnpj(value)).toBe(false);
});
it("aceita formato alfanumérico com algoritmo da Receita e normaliza pontuação", () => {
  expect(validCnpj("12.ABC.345/01DE-35")).toBe(true);
  expect(
    storeSettingsSchema.parse({ ...input, cnpj: "12.abc.345/01de-35" }).cnpj,
  ).toBe("12ABC34501DE35");
  expect(validCnpj("12ABC34501DE36")).toBe(false);
});
it("recusa redes falsas, esquemas inseguros e credenciais embutidas", () => {
  for (const instagram of [
    "http://instagram.com/perfil",
    "https://instagram.com.evil.example/perfil",
    "javascript:alert(1)",
    "https://usuario:senha@instagram.com/perfil",
    "https://instagram.com/",
  ])
    expect(() => storeSettingsSchema.parse({ ...input, instagram })).toThrow();
  expect(
    storeSettingsSchema.parse({
      ...input,
      instagram: "https://www.instagram.com/jn.exemplo/",
    }).instagram,
  ).toContain("jn.exemplo");
});
it("normaliza telefone e mantém valores monetários em centavos", () => {
  const value = storeSettingsSchema.parse({
    ...input,
    whatsapp: "+55 (11) 99999-9999",
    freeShippingMinimum: 30000,
  });
  expect(value.whatsapp).toBe("5511999999999");
  expect(value.freeShippingMinimum).toBe(30000);
  expect(() =>
    storeSettingsSchema.parse({ ...input, freeShippingMinimum: -1 }),
  ).toThrow();
});
it("lista configuração sem expor segredos nem afirmar conexão com provedores", () => {
  const environment = {
    DEMO_MODE: "false",
    APP_URL: "https://example.invalid",
    MP_ACCESS_TOKEN: "PRIVATE-TOKEN",
    MP_WEBHOOK_SECRET: "PRIVATE-SECRET",
    MP_COLLECTOR_ID: "123",
    SHIPPING_TOKEN: "PRIVATE-SHIPPING",
    SHIPPING_ORIGIN_POSTCODE: "01001000",
    SMTP_HOST: "smtp.example.invalid",
    MAIL_FROM: "test@example.invalid",
  };
  const checks = configurationReadiness(
    {
      ...input,
      company: "Empresa fictícia",
      cnpj: "04252011000110",
      email: "test@example.invalid",
      address: "Rua fictícia",
      legalReviewed: true,
    },
    environment,
  );
  expect(checks.every((c) => c.configured)).toBe(true);
  expect(JSON.stringify(checks)).not.toContain("PRIVATE-");
  expect(configurationReadiness(input, {}).some((c) => !c.configured)).toBe(
    true,
  );
});
it("salva com versão e auditoria, impedindo sobrescrita obsoleta", async () => {
  const value = await saveStoreSettings(
    { ...input, company: "Empresa fictícia A" },
    actor,
  );
  expect(value.version).toBe(1);
  await expect(
    saveStoreSettings({ ...input, company: "Empresa fictícia B" }, actor),
  ).rejects.toThrow("alteradas");
  expect((await settings()).company).toBe("Empresa fictícia A");
  expect((await settings()).version).toBe(1);
  expect(
    await db.auditLog.count({
      where: { actorId: actor, action: "settings.update" },
    }),
  ).toBe(1);
});
it("dois administradores concorrentes não sobrescrevem a versão vencedora", async () => {
  const results = await Promise.allSettled([
    saveStoreSettings({ ...input, company: "Primeira fixture" }, actor),
    saveStoreSettings({ ...input, company: "Segunda fixture" }, actor),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect((await settings()).version).toBe(1);
});
it("não ativa vendas quando os dados obrigatórios estão ausentes", async () => {
  await expect(
    saveStoreSettings({ ...input, salesEnabled: true }, actor),
  ).rejects.toThrow("configurações");
  expect((await settings()).salesEnabled).toBe(false);
  expect((await settings()).version).toBe(0);
});

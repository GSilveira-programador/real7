import { z } from "zod";
import { db } from "./db";
import { HttpError } from "./security";
// Receita's numeric/alphanumeric CNPJ algorithm; this does not query legal registration.
export function validCnpj(raw: string) {
  const cnpj = raw.replace(/[.\-/\s]/g, "").toUpperCase();
  if (!/^[A-Z0-9]{12}\d{2}$/.test(cnpj) || /^(\d)\1{13}$/.test(cnpj))
    return false;
  const digit = (text: string, weights: number[]) => {
    const sum = [...text].reduce(
      (n, char, i) => n + (char.charCodeAt(0) - 48) * weights[i],
      0,
    );
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  return (
    digit(cnpj.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) ===
      Number(cnpj[12]) &&
    digit(cnpj.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) ===
      Number(cnpj[13])
  );
}
const social = (hosts: string[]) =>
  z
    .string()
    .trim()
    .max(300)
    .default("")
    .refine((value) => {
      if (!value) return true;
      try {
        const url = new URL(value);
        return (
          url.protocol === "https:" &&
          !url.username &&
          !url.password &&
          hosts.includes(url.hostname) &&
          url.pathname !== "/"
        );
      } catch {
        return false;
      }
    }, "Informe o link HTTPS do perfil na rede correspondente.");
export const storeSettingsSchema = z.object({
  version: z.number().int().min(0),
  company: z.string().trim().max(150),
  cnpj: z
    .string()
    .trim()
    .max(30)
    .transform((value) => value.replace(/[.\-/\s]/g, "").toUpperCase())
    .refine(
      (value) => !value || validCnpj(value),
      "CNPJ com dígitos verificadores inválidos.",
    ),
  address: z.string().trim().max(300),
  email: z.union([z.email(), z.literal("")]),
  whatsapp: z
    .string()
    .trim()
    .transform((value) => value.replace(/[+()\-\s]/g, ""))
    .refine(
      (value) => /^\d{10,15}$|^$/.test(value),
      "Informe DDI, DDD e número.",
    ),
  hours: z.string().trim().max(150),
  salesEnabled: z.boolean(),
  freeShippingMinimum: z.number().int().min(0).max(100000000),
  bannerTitle: z.string().trim().min(3).max(100),
  bannerSubtitle: z.string().trim().max(200),
  instagram: social(["instagram.com", "www.instagram.com"]),
  facebook: social(["facebook.com", "www.facebook.com"]),
  youtube: social(["youtube.com", "www.youtube.com", "youtu.be"]),
  nationwideShipping: z.boolean().default(false),
  legalReviewed: z.boolean().default(false),
});
export function configurationReadiness(
  config: Record<string, unknown>,
  environment: Record<string, string | undefined> = process.env,
) {
  let https = false;
  try {
    https = new URL(environment.APP_URL || "").protocol === "https:";
  } catch {}
  return [
    {
      id: "mode",
      label: "Modo de demonstração desativado",
      configured: environment.DEMO_MODE === "false",
    },
    {
      id: "company",
      label: "Dados comerciais e atendimento",
      configured: Boolean(
        config.company &&
        config.cnpj &&
        validCnpj(String(config.cnpj)) &&
        config.address &&
        config.email &&
        config.hours,
      ),
    },
    {
      id: "legal",
      label: "Revisão das políticas confirmada pela equipe",
      configured: config.legalReviewed === true,
    },
    {
      id: "payment",
      label: "Configuração Mercado Pago",
      configured: Boolean(
        environment.MP_ACCESS_TOKEN &&
        environment.MP_WEBHOOK_SECRET &&
        environment.MP_COLLECTOR_ID,
      ),
    },
    {
      id: "shipping",
      label: "Configuração de frete e CEP de origem",
      configured: Boolean(
        environment.SHIPPING_TOKEN &&
        /^\d{8}$/.test(environment.SHIPPING_ORIGIN_POSTCODE || ""),
      ),
    },
    {
      id: "mail",
      label: "Servidor de e-mail e remetente",
      configured: Boolean(environment.SMTP_HOST && environment.MAIL_FROM),
    },
    {
      id: "https",
      label: "Endereço da aplicação com HTTPS",
      configured: https,
    },
  ];
}
export async function saveStoreSettings(raw: unknown, actorId: string) {
  const input = storeSettingsSchema.parse(raw);
  const { version, ...value } = input;
  if (
    value.salesEnabled &&
    configurationReadiness(value).some((check) => !check.configured)
  )
    throw new HttpError(
      400,
      "Complete as configurações e a revisão das políticas antes de ativar vendas. Consulte as pendências no painel.",
    );
  return db.$transaction(async (tx) => {
    const [lock] = await tx.$queryRaw<
      { locked: boolean }[]
    >`SELECT pg_try_advisory_xact_lock(718327) AS locked`;
    if (!lock.locked)
      throw new HttpError(
        409,
        "Outra configuração está sendo salva. Recarregue o painel.",
      );
    const current = await tx.setting.findUnique({ where: { key: "store" } });
    if ((current?.version ?? 0) !== version)
      throw new HttpError(
        409,
        "Configurações alteradas por outro administrador. Recarregue antes de salvar.",
      );
    const result = await tx.setting.upsert({
      where: { key: "store" },
      create: { key: "store", value, version: 1 },
      update: { value, version: { increment: 1 } },
    });
    await tx.auditLog.create({
      data: {
        actorId,
        action: "settings.update",
        entityId: "store",
        details: { version: result.version, salesEnabled: value.salesEnabled },
      },
    });
    return { ...value, version: result.version };
  });
}

import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "./db";
import { email, password } from "./validation";
import { hash, HttpError } from "./security";
const bootstrapLock = 718330;
export async function createAdminInvitation(address: string) {
  const normalized = email.parse(address);
  const token = randomBytes(32).toString("hex");
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(${bootstrapLock})::text`;
    if (await tx.user.count({ where: { role: "ADMIN", deletedAt: null } }))
      throw new HttpError(
        409,
        "Já existe administrador. Entre em /conta ou utilize a recuperação operacional; o convite inicial não substitui contas existentes.",
      );
    if (await tx.user.findUnique({ where: { email: normalized } }))
      throw new HttpError(
        409,
        "E-mail já cadastrado. Utilize outro e-mail para o primeiro administrador ou o processo operacional de permissões.",
      );
    await tx.adminInvitation.updateMany({
      where: { usedAt: null },
      data: { expiresAt: new Date() },
    });
    const value = await tx.adminInvitation.create({
      data: {
        tokenHash: hash(token),
        email: normalized,
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: "CLI",
        action: "admin.invitation_created",
        entityId: value.id,
      },
    });
  });
  return token;
}
export async function acceptAdminInvitation(raw: unknown) {
  const value = z
    .object({
      token: z.string().regex(/^[a-f0-9]{64}$/),
      email,
      password,
      name: z.string().trim().min(3).max(100),
    })
    .parse(raw);
  const candidate = await db.adminInvitation.findUnique({
    where: { tokenHash: hash(value.token) },
  });
  if (
    !candidate ||
    candidate.usedAt ||
    candidate.expiresAt <= new Date() ||
    candidate.email !== value.email
  )
    throw new HttpError(400, "Convite inválido, expirado ou já utilizado.");
  const passwordHash = await bcrypt.hash(value.password, 12);
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(${bootstrapLock})::text`;
    const invite = await tx.adminInvitation.findUnique({
      where: { tokenHash: hash(value.token) },
    });
    if (
      !invite ||
      invite.usedAt ||
      invite.expiresAt <= new Date() ||
      invite.email !== value.email
    )
      throw new HttpError(400, "Convite inválido, expirado ou já utilizado.");
    if (await tx.user.count({ where: { role: "ADMIN", deletedAt: null } }))
      throw new HttpError(
        409,
        "Já existe administrador. Utilize o login da conta.",
      );
    if (await tx.user.findUnique({ where: { email: value.email } }))
      throw new HttpError(
        409,
        "E-mail já cadastrado. A conta existente não foi alterada.",
      );
    const admin = await tx.user.create({
      data: {
        email: value.email,
        name: value.name,
        passwordHash,
        role: "ADMIN",
        verified: true,
      },
    });
    await tx.adminInvitation.update({
      where: { id: invite.id },
      data: { usedAt: new Date() },
    });
    await tx.auditLog.create({
      data: {
        actorId: admin.id,
        action: "admin.invitation_accepted",
        entityId: invite.id,
      },
    });
  });
  return {
    message:
      "Conta criada. Entre com seu e-mail e senha em Minha conta e configure o autenticador para acessar o painel.",
  };
}

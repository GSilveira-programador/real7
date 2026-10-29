import { Prisma, Role } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import { HttpError, limit, totp } from "./security";
import { decrypt } from "./encryption";
const roleChange = z.object({
  role: z.nativeEnum(Role),
  version: z.number().int().min(0),
  reason: z.string().trim().min(10).max(500),
  code: z.string().regex(/^\d{6}$/),
});
export async function changeUserRole(
  actorId: string,
  targetId: string,
  input: unknown,
) {
  const data = roleChange.parse(input);
  await limit("role-change:" + actorId, 5);
  return db.$transaction(
    async (tx) => {
      const actor = await tx.user.findUnique({ where: { id: actorId } });
      if (
        !actor ||
        actor.deletedAt ||
        actor.role !== "ADMIN" ||
        !actor.verified ||
        !actor.mfaEnabled ||
        !actor.mfaSecret
      )
        throw new HttpError(
          403,
          "Somente administrador verificado com MFA pode alterar permissões.",
        );
      if (!totp(decrypt(actor.mfaSecret), data.code))
        throw new HttpError(401, "Código MFA inválido.");
      const target = await tx.user.findUnique({ where: { id: targetId } });
      if (!target || target.deletedAt)
        throw new HttpError(404, "Conta não encontrada.");
      if (target.roleVersion !== data.version)
        throw new HttpError(
          409,
          "Permissões alteradas por outro operador. Recarregue os dados.",
        );
      if (target.role === data.role)
        throw new HttpError(400, "A conta já possui este perfil.");
      if (data.role !== "CUSTOMER" && !target.verified)
        throw new HttpError(
          400,
          "O e-mail precisa estar verificado antes de conceder acesso à equipe.",
        );
      if (
        target.role === "ADMIN" &&
        target.verified &&
        target.mfaEnabled &&
        data.role !== "ADMIN"
      ) {
        const remaining = await tx.user.count({
          where: {
            id: { not: target.id },
            role: "ADMIN",
            verified: true,
            mfaEnabled: true,
            deletedAt: null,
          },
        });
        if (!remaining)
          throw new HttpError(
            409,
            "Não é possível remover o último administrador com MFA ativo. Prepare outro administrador primeiro.",
          );
      }
      const changed = await tx.user.updateMany({
        where: { id: target.id, roleVersion: data.version },
        data: { role: data.role, roleVersion: { increment: 1 } },
      });
      if (!changed.count)
        throw new HttpError(
          409,
          "A conta foi alterada. Recarregue antes de tentar novamente.",
        );
      await tx.session.deleteMany({ where: { userId: target.id } });
      await tx.auditLog.create({
        data: {
          actorId,
          action: "user.role.changed",
          entityId: target.id,
          details: { from: target.role, to: data.role, reason: data.reason },
        },
      });
      await tx.mail.create({
        data: {
          recipient: target.email,
          subject: "Permissões da conta atualizadas — Elite Boots",
          body: "O perfil de acesso da sua conta foi alterado pela administração. Todas as sessões foram encerradas. Entre novamente. O acesso administrativo exige configurar e validar MFA. Se você não reconhece essa alteração, entre em contato com a loja.",
        },
      });
      return { id: target.id, role: data.role, roleVersion: data.version + 1 };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
export async function recoverMfa(input: unknown) {
  const d = z
    .object({
      email: z.email().transform((v) => v.toLowerCase()),
      reason: z.string().trim().min(10).max(500),
      confirm: z.literal("RESET-MFA"),
      operator: z.string().trim().min(3).max(100),
    })
    .parse(input);
  return db.$transaction(async (tx) => {
    const target = await tx.user.findUnique({ where: { email: d.email } });
    if (!target || target.deletedAt || target.role === "CUSTOMER")
      throw new HttpError(404, "Conta de equipe não encontrada.");
    if (!target.mfaEnabled)
      throw new HttpError(
        409,
        "A conta já está sem MFA ativo. Nenhuma alteração aplicada.",
      );
    await tx.user.update({
      where: { id: target.id },
      data: {
        mfaEnabled: false,
        mfaSecret: null,
        roleVersion: { increment: 1 },
      },
    });
    await tx.session.deleteMany({ where: { userId: target.id } });
    await tx.auditLog.create({
      data: {
        actorId: "CLI:" + d.operator,
        action: "user.mfa.recovered",
        entityId: target.id,
        details: { reason: d.reason },
      },
    });
    await tx.mail.create({
      data: {
        recipient: target.email,
        subject: "MFA reiniciado pela operação — Elite Boots",
        body: "A operação autorizada reiniciou o MFA da sua conta. As sessões anteriores foram revogadas. Sua senha continua necessária para entrar; cadastre um novo autenticador em Minha conta antes de acessar a administração. Se você não solicitou essa recuperação, procure o responsável pela loja imediatamente.",
      },
    });
    return { reset: true };
  });
}

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "./db";
import { TOTP, Secret } from "otpauth";
import type { Role } from "@prisma/client";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const hash = (v: string) => createHash("sha256").update(v).digest("hex");
export const token = () => randomBytes(32).toString("hex");
export const equal = (a: string, b: string) => {
  const left = Buffer.from(a),
    right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};
export async function authSession() {
  const raw = (await cookies()).get("elite_session")?.value;
  if (!raw) return null;
  const result = await db.session.findUnique({
    where: { id: hash(raw) },
    include: { user: true },
  });
  return result && result.expiresAt > new Date() && !result.user.deletedAt
    ? result
    : null;
}
export async function user() {
  return (await authSession())?.user ?? null;
}
export async function requireUser(roles?: Role[]) {
  const authenticated = await authSession();
  if (!authenticated)
    throw new HttpError(401, "Entre na sua conta para continuar.");
  const u = authenticated.user;
  if (roles && (!roles.includes(u.role) || !u.verified || !u.mfaEnabled))
    throw new HttpError(403, "Permissão e MFA administrativo necessários.");
  if (roles && !authenticated.mfaVerifiedAt)
    throw new HttpError(
      403,
      "Entre novamente com senha e MFA para acessar a administração.",
    );
  return u;
}
export function totp(secret: string, code: string) {
  return (
    new TOTP({
      issuer: "JN Chuteiras",
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: Secret.fromBase32(secret),
    }).validate({ token: code, window: 1 }) !== null
  );
}
export async function limit(key: string, max = 30) {
  const rows = await db.$queryRaw<{ count: number }[]>`
 INSERT INTO "RateLimit" ("key","count","resetAt") VALUES (${key},1,CURRENT_TIMESTAMP+INTERVAL '1 minute')
 ON CONFLICT ("key") DO UPDATE SET
 "count"=CASE WHEN "RateLimit"."resetAt"<=CURRENT_TIMESTAMP THEN 1 ELSE "RateLimit"."count"+1 END,
 "resetAt"=CASE WHEN "RateLimit"."resetAt"<=CURRENT_TIMESTAMP THEN CURRENT_TIMESTAMP+INTERVAL '1 minute' ELSE "RateLimit"."resetAt" END
 RETURNING "count"`;
  if (rows[0].count > max)
    throw new HttpError(429, "Muitas tentativas. Aguarde um minuto.");
}
export function origin(req: Request) {
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    const expected = new URL(process.env.APP_URL || "http://localhost:3000")
      .origin;
    if (req.headers.get("origin") !== expected)
      throw new HttpError(403, "Origem inválida.");
  }
}
export async function session(
  userId: string,
  mfaVerified: boolean,
  expected: {
    passwordHash: string;
    mfaSecret: string | null;
    roleVersion: number;
  },
) {
  const raw = token();
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${userId} FOR UPDATE`;
    const current = await tx.user.findUnique({ where: { id: userId } });
    if (
      !current ||
      current.deletedAt ||
      current.passwordHash !== expected.passwordHash ||
      current.mfaSecret !== expected.mfaSecret ||
      current.roleVersion !== expected.roleVersion ||
      current.mfaEnabled !== mfaVerified
    )
      throw new HttpError(
        401,
        "Os dados de acesso foram alterados. Entre novamente.",
      );
    await tx.session.create({
      data: {
        id: hash(raw),
        userId,
        expiresAt: new Date(Date.now() + 7 * 86400000),
        mfaVerifiedAt: mfaVerified ? new Date() : null,
      },
    });
  });
  (await cookies()).set("elite_session", raw, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 86400,
  });
}
export async function audit(actorId: string, action: string, entityId: string) {
  await db.auditLog.create({ data: { actorId, action, entityId } });
}

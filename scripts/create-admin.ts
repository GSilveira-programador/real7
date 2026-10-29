import "dotenv/config";
import { db } from "../src/lib/db";
import { email, password } from "../src/lib/validation";
import bcrypt from "bcryptjs";
async function main() {
  const address = email.parse(process.env.ADMIN_EMAIL);
  const pass = password.parse(process.env.ADMIN_PASSWORD);
  if (await db.user.findUnique({ where: { email: address } }))
    throw new Error(
      "Conta existente: promoção deve ser auditada separadamente.",
    );
  const admin = await db.user.create({
    data: {
      email: address,
      name: "Administrador",
      passwordHash: await bcrypt.hash(pass, 12),
      role: "ADMIN",
      verified: true,
    },
  });
  await db.auditLog.create({
    data: { actorId: "CLI", action: "admin.create", entityId: admin.id },
  });
  console.log(
    "Administrador criado. Entre em /conta e configure MFA antes de acessar /admin.",
  );
}
main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());

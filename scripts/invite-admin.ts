import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { db } from "../src/lib/db";
import { createAdminInvitation } from "../src/lib/admin-invitation";
async function main() {
  const prompt = createInterface({ input: stdin, output: stdout });
  try {
    const address =
      process.env.ADMIN_EMAIL ||
      (await prompt.question("E-mail do primeiro administrador: "));
    const base = new URL(process.env.APP_URL || "http://localhost:3000");
    if (
      !["https:", "http:"].includes(base.protocol) ||
      base.username ||
      base.password
    )
      throw new Error("Configure APP_URL sem credenciais.");
    if (
      base.protocol !== "https:" &&
      !["localhost", "127.0.0.1"].includes(base.hostname)
    )
      throw new Error("APP_URL deve usar HTTPS fora da máquina local.");
    const token = await createAdminInvitation(address.trim());
    console.log(
      "\nAbra este link privado para escolher sua senha no navegador (válido por 1 hora):\n" +
        base.origin +
        "/admin/ativar#token=" +
        token +
        "\nNão compartilhe o link; um novo convite invalida o anterior.",
    );
  } finally {
    prompt.close();
  }
}
main()
  .catch((error) => {
    console.error(error.message || "Não foi possível emitir o convite.");
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());

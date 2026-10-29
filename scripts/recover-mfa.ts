import "dotenv/config";
import { db } from "../src/lib/db";
import { recoverMfa } from "../src/lib/user-administration";
async function main() {
  await recoverMfa({
    email: process.env.RECOVERY_EMAIL,
    reason: process.env.RECOVERY_REASON,
    confirm: process.env.RECOVERY_CONFIRM,
    operator: process.env.RECOVERY_OPERATOR,
  });
  console.log(
    "MFA reiniciado; sessões revogadas. A senha continua obrigatória e um novo autenticador deve ser cadastrado antes do acesso administrativo.",
  );
}
main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());

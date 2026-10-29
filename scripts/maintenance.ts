import "dotenv/config";
import { db } from "../src/lib/db";
import { maintainTemporaryData } from "../src/lib/maintenance";
async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--apply" && !/^--batch=\d+$/.test(arg)))
    throw new Error("Uso: npm run maintenance -- [--apply] [--batch=500]");
  const batch = args.find((arg) => arg.startsWith("--batch="));
  console.log(
    JSON.stringify(
      await maintainTemporaryData({
        apply: args.includes("--apply"),
        batchSize: batch ? Number(batch.slice(8)) : 500,
      }),
      null,
      2,
    ),
  );
}
main()
  .catch(() => {
    console.error(
      "Manutenção não concluída. Verifique os argumentos, a conexão e concorrência; nenhuma credencial é registrada.",
    );
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());

import "dotenv/config";
import { getGenerators } from "@prisma/internals";
import { PrismaClientJsGenerator } from "@prisma/client-generator-js";
async function main() {
  const generators = await getGenerators({
    schemaPath: "prisma/schema.prisma",
    registry: {
      "prisma-client-js": {
        type: "in-process",
        generator: new PrismaClientJsGenerator({
          cliCommand: "npm run db:generate",
        }),
      },
    },
    skipDownload: true,
    cliCommand: "npm run db:generate",
  });
  try {
    for (const g of generators) await g.generate();
    console.log("Cliente Prisma JavaScript gerado sem engine nativa.");
  } finally {
    for (const g of generators) g.stop();
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});

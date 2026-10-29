import { readFile, writeFile, chmod } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { Client } from "pg";
import dotenv from "dotenv";
async function main() {
  let file: string;
  try {
    file = await readFile(".env", "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    const password = randomBytes(24).toString("hex");
    file = `DATABASE_URL=postgresql://elite:${password}@127.0.0.1:5432/elite_boots\nAPP_URL=http://localhost:3000\nDEMO_MODE=true\nMFA_ENCRYPTION_KEY=${randomBytes(32).toString("hex")}\n`;
    await writeFile(".env", file, { flag: "wx", mode: 0o600 });
  }
  await chmod(".env", 0o600);
  const values = dotenv.parse(file);
  const target = new URL(process.env.DATABASE_URL || values.DATABASE_URL);
  if (
    !["127.0.0.1", "localhost"].includes(target.hostname) ||
    !["/elite_boots"].includes(target.pathname) ||
    values.DEMO_MODE !== "true"
  )
    throw new Error(
      "cloud-local só pode configurar o banco local demonstrativo elite_boots. Configure bancos externos separadamente.",
    );
  const environment = { ...process.env };
  for (const name of [
    "DOCKER_HOST",
    "DOCKER_CONTEXT",
    "DOCKER_TLS",
    "DOCKER_TLS_VERIFY",
    "DOCKER_CERT_PATH",
  ])
    delete environment[name];
  const docker = (args: string[], input?: string) =>
    spawnSync("docker", ["--host=unix:///var/run/docker.sock", ...args], {
      encoding: "utf8",
      env: environment,
      input,
      stdio: ["pipe", "pipe", "pipe"],
    });
  const info = docker(["info", "--format", "{{.ServerVersion}}"]);
  if (info.status !== 0)
    throw new Error(
      "Docker local indisponível. Recupere o runtime ou configure PostgreSQL externo.",
    );
  const existing = docker([
    "container",
    "inspect",
    "elite-postgres",
    "--format",
    "{{.State.Running}}",
  ]);
  if (existing.status === 0) {
    if (existing.stdout.trim() !== "true") {
      const start = docker(["start", "elite-postgres"]);
      if (start.status !== 0)
        throw new Error("Não foi possível iniciar elite-postgres.");
    }
  } else {
    const list = docker(["ps", "-a", "--format", "{{.Names}}"]);
    if (list.status !== 0) throw new Error("Falha ao listar containers.");
    if (list.stdout.split("\n").includes("elite-postgres"))
      throw new Error("Container existente não pôde ser inspecionado.");
    const result = docker(
      [
        "run",
        "-d",
        "--name",
        "elite-postgres",
        "--env-file",
        "/dev/stdin",
        "-p",
        "127.0.0.1:5432:5432",
        "-v",
        "elite-pgdata:/var/lib/postgresql/data",
        "postgres:17-alpine",
      ],
      `POSTGRES_USER=${decodeURIComponent(target.username)}\nPOSTGRES_PASSWORD=${decodeURIComponent(target.password)}\nPOSTGRES_DB=elite_boots\n`,
    );
    if (result.status !== 0)
      throw new Error(
        "Falha ao criar PostgreSQL local. Confira a disponibilidade da imagem e da porta; nenhum dado existente foi removido.",
      );
  }
  let ready = false;
  for (let i = 0; i < 40; i++) {
    const client = new Client({ connectionString: target.toString() });
    try {
      await client.connect();
      await client.query("SELECT 1");
      ready = true;
      break;
    } catch {
    } finally {
      await client.end().catch(() => {});
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!ready)
    throw new Error(
      "PostgreSQL não ficou pronto com a configuração atual. Não altere credenciais/volumes existentes sem diagnóstico.",
    );
  console.log(
    "PostgreSQL local pronto. Execute db:generate, db:migrate e db:seed.",
  );
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});

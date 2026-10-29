import { randomBytes } from "node:crypto";
import { writeFile, access } from "node:fs/promises";

// This setup is solely for an isolated, private demonstration Codespace.
if (process.env.CODESPACES !== "true")
  throw new Error(
    "Execute esta configuração apenas dentro do GitHub Codespaces.",
  );
const name = process.env.CODESPACE_NAME;
const domain = process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;
if (
  !name ||
  !/^[a-zA-Z0-9-]+$/.test(name) ||
  !domain ||
  !/^[a-zA-Z0-9.-]+$/.test(domain)
)
  throw new Error("Endereço de encaminhamento do Codespaces indisponível.");
try {
  await access(".env");
  console.log(
    ".env existente preservado. Confira APP_URL se recriou o Codespace.",
  );
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  await writeFile(
    ".env",
    [
      "DATABASE_URL=postgresql://demo:codespaces-demo-only@db:5432/jn_preview",
      `APP_URL=https://${name}-3000.${domain}`,
      "DEMO_MODE=true",
      `MFA_ENCRYPTION_KEY=${randomBytes(32).toString("hex")}`,
      "NEXT_TELEMETRY_DISABLED=1",
      "",
    ].join("\n"),
    { flag: "wx", mode: 0o600 },
  );
  console.log(
    "Demonstração configurada; vendas e serviços externos continuam desativados.",
  );
}

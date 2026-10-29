import "dotenv/config";
import nodemailer from "nodemailer";
import { db } from "../src/lib/db";
async function main() {
  if (!process.env.SMTP_HOST || !process.env.MAIL_FROM)
    throw new Error(
      "Configure SMTP_HOST e MAIL_FROM. Nenhum e-mail foi enviado.",
    );
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_PORT === "465",
    requireTLS: true,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
      : undefined,
    tls: { rejectUnauthorized: true },
  });
  await transport.verify();
  // Single worker guarded by a PostgreSQL advisory transaction lock.
  await db.$transaction(
    async (tx) => {
      const lock = await tx.$queryRaw<
        { locked: boolean }[]
      >`SELECT pg_try_advisory_xact_lock(718324) AS locked`;
      if (!lock[0].locked) return;
      const jobs = await tx.mail.findMany({
        where: { sentAt: null, attempts: { lt: 5 } },
        orderBy: { createdAt: "asc" },
        take: 20,
      });
      for (const job of jobs) {
        try {
          await transport.sendMail({
            from: process.env.MAIL_FROM,
            to: job.recipient,
            subject: job.subject,
            text: job.body,
            messageId: `<${job.id}@${new URL(process.env.APP_URL!).hostname}>`,
          });
          await tx.mail.update({
            where: { id: job.id },
            data: { sentAt: new Date(), attempts: { increment: 1 } },
          });
        } catch {
          await tx.mail.update({
            where: { id: job.id },
            data: { attempts: { increment: 1 } },
          });
          console.error("mail_delivery_failed", job.id);
        }
      }
    },
    { timeout: 120000 },
  );
  console.log(
    "Fila de e-mail processada. Falhas após 5 tentativas exigem análise.",
  );
}
main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());

import { NodeHttpHandler } from "@smithy/node-http-handler";
import { HttpsProxyAgent } from "https-proxy-agent";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";
import { HttpError } from "./security";
export async function upload(req: Request) {
  if (!process.env.S3_BUCKET || !process.env.S3_PUBLIC_URL)
    throw new HttpError(503, "Armazenamento S3 não configurado.");
  const reader = req.body?.getReader();
  if (!reader) throw new HttpError(400, "Arquivo ausente.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 5 * 1024 * 1024) {
      await reader.cancel();
      throw new HttpError(413, "Imagem deve ter no máximo 5 MB.");
    }
    chunks.push(value);
  }
  const bytes = Buffer.concat(chunks);
  let ext = "";
  let type = "";
  if (bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) {
    ext = "jpg";
    type = "image/jpeg";
  } else if (
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    ext = "png";
    type = "image/png";
  } else if (
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  ) {
    ext = "webp";
    type = "image/webp";
  } else
    throw new HttpError(
      400,
      "Use JPEG, PNG ou WebP. SVG e arquivos executáveis não são aceitos.",
    );
  const endpoint = process.env.S3_ENDPOINT;
  if (endpoint && new URL(endpoint).protocol !== "https:")
    throw new HttpError(503, "Endpoint S3 requer HTTPS.");
  const client = new S3Client({
    ...(process.env.HTTPS_PROXY
      ? {
          requestHandler: new NodeHttpHandler({
            httpsAgent: new HttpsProxyAgent(process.env.HTTPS_PROXY),
          }),
        }
      : {}),
    region: process.env.S3_REGION || "us-east-1",
    ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
    ...(process.env.S3_ACCESS_KEY_ID
      ? {
          credentials: {
            accessKeyId: process.env.S3_ACCESS_KEY_ID,
            secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
          },
        }
      : {}),
  });
  const key = `products/${randomUUID()}.${ext}`;
  await client.send(
    new PutObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: key,
      Body: bytes,
      ContentType: type,
      CacheControl: "public,max-age=31536000,immutable",
    }),
  );
  const publicBase = process.env.S3_PUBLIC_URL.replace(/\/$/, "");
  if (new URL(publicBase).protocol !== "https:")
    throw new HttpError(503, "URL pública requer HTTPS.");
  return { url: publicBase + "/" + key };
}

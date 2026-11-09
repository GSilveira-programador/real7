import { NodeHttpHandler } from "@smithy/node-http-handler";
import { HttpsProxyAgent } from "https-proxy-agent";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";
import { HttpError } from "./security";
import { db } from "./db";
import sharp from "sharp";

export async function normalizeProductImage(bytes: Buffer) {
  if (!bytes.length || bytes.length > 5 * 1024 * 1024)
    throw new HttpError(413, "Imagem deve ter no máximo 5 MB.");
  try {
    const image = sharp(bytes, {
      limitInputPixels: 20_000_000,
      failOn: "warning",
    });
    const metadata = await image.metadata();
    if (
      !["jpeg", "png", "webp"].includes(metadata.format || "") ||
      (metadata.pages || 1) > 1
    )
      throw new Error("Unsupported image");
    const result = await image
      .rotate()
      .resize({
        width: 2400,
        height: 2400,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 85 })
      .toBuffer({ resolveWithObject: true });
    if (result.data.length > 5 * 1024 * 1024)
      throw new HttpError(
        413,
        "A imagem otimizada excedeu 5 MB. Reduza as dimensões e tente novamente.",
      );
    return result;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(
      400,
      "Use uma imagem JPEG, PNG ou WebP válida, estática, com até 20 megapixels.",
    );
  }
}

export async function upload(req: Request) {
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
  const { data: bytes, info } = await normalizeProductImage(
    Buffer.concat(chunks),
  );
  if (
    process.env.MEDIA_STORAGE === "database" ||
    (!process.env.S3_BUCKET && process.env.MEDIA_STORAGE !== "s3")
  ) {
    const asset = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(718331)::text`;
      const used = await tx.mediaAsset.aggregate({ _sum: { size: true } });
      if ((used._sum.size || 0) + bytes.length > 500 * 1024 * 1024)
        throw new HttpError(
          507,
          "Limite de fotos no banco atingido. Configure armazenamento S3 para ampliar.",
        );
      return tx.mediaAsset.create({
        data: {
          bytes: new Uint8Array(bytes),
          size: bytes.length,
          width: info.width,
          height: info.height,
        },
      });
    });
    return { url: `/images/uploads/${asset.id}.webp` };
  }
  if (!process.env.S3_BUCKET || !process.env.S3_PUBLIC_URL)
    throw new HttpError(503, "Armazenamento S3 não configurado.");
  const publicBase = process.env.S3_PUBLIC_URL.replace(/\/$/, "");
  if (new URL(publicBase).protocol !== "https:")
    throw new HttpError(503, "URL pública requer HTTPS.");
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
  const key = `products/${randomUUID()}.webp`;
  await client.send(
    new PutObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: key,
      Body: bytes,
      ContentType: "image/webp",
      CacheControl: "public,max-age=31536000,immutable",
    }),
  );
  return { url: publicBase + "/" + key };
}

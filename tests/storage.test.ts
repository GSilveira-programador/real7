import { it, expect, afterAll } from "vitest";
import sharp from "sharp";
import { db } from "../src/lib/db";
import { normalizeProductImage, upload } from "../src/lib/storage";
import { GET } from "../src/app/images/uploads/[file]/route";
import { imageUrl } from "../src/lib/merchandising";
const assets: string[] = [];
afterAll(async () => {
  await db.mediaAsset.deleteMany({ where: { id: { in: assets } } });
  await db.$disconnect();
});
it("reencoda fotos, remove metadados e limita dimensões", async () => {
  const image = await sharp({
    create: { width: 3000, height: 1500, channels: 3, background: "red" },
  })
    .withMetadata({ orientation: 1 })
    .jpeg()
    .toBuffer();
  const result = await normalizeProductImage(image);
  expect(result.info.width).toBe(2400);
  expect(result.info.height).toBe(1200);
  const metadata = await sharp(result.data).metadata();
  expect(metadata.format).toBe("webp");
  expect(metadata.exif).toBeUndefined();
});
it("recusa SVG, arquivo falso, imagem truncada e excesso de bytes", async () => {
  for (const image of [
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>',
    ),
    Buffer.from("<html>fake image</html>"),
    Buffer.from([255, 216, 255]),
  ])
    await expect(normalizeProductImage(image)).rejects.toThrow("válida");
  await expect(
    normalizeProductImage(Buffer.alloc(5 * 1024 * 1024 + 1)),
  ).rejects.toThrow("5 MB");
});
it("foto válida pode ser enviada sem S3 e servida com tipo seguro", async () => {
  const old = process.env.MEDIA_STORAGE;
  process.env.MEDIA_STORAGE = "database";
  try {
    const image = await sharp({
      create: { width: 40, height: 40, channels: 3, background: "green" },
    })
      .png()
      .toBuffer();
    const response = await upload(
      new Request("http://localhost/api/admin/uploads", {
        method: "POST",
        body: new Uint8Array(image),
      }),
    );
    expect(() => imageUrl.parse(response.url)).not.toThrow();
    const file = response.url.split("/").pop()!;
    assets.push(file.slice(0, -5));
    const served = await GET(new Request("http://localhost" + response.url), {
      params: Promise.resolve({ file }),
    });
    expect(served.status).toBe(200);
    expect(served.headers.get("Content-Type")).toBe("image/webp");
    expect(served.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect((await served.arrayBuffer()).byteLength).toBeGreaterThan(0);
  } finally {
    if (old === undefined) delete process.env.MEDIA_STORAGE;
    else process.env.MEDIA_STORAGE = old;
  }
});
it("rota de mídia recusa caminhos e arquivos inexistentes", async () => {
  expect(
    (
      await GET(new Request("http://localhost"), {
        params: Promise.resolve({ file: "../private.env" }),
      })
    ).status,
  ).toBe(404);
  expect(
    (
      await GET(new Request("http://localhost"), {
        params: Promise.resolve({ file: "missingasset.webp" }),
      })
    ).status,
  ).toBe(404);
});

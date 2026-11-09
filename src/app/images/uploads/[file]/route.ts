import { db } from "@/lib/db";
export const runtime = "nodejs";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ file: string }> },
) {
  const { file } = await params;
  if (!/^[a-z0-9]+\.webp$/.test(file))
    return new Response(null, { status: 404 });
  const asset = await db.mediaAsset.findUnique({
    where: { id: file.slice(0, -5) },
    select: { bytes: true, size: true },
  });
  if (!asset)
    return new Response(null, {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  return new Response(new Uint8Array(asset.bytes), {
    headers: {
      "Content-Type": "image/webp",
      "Content-Length": String(asset.size),
      "Cache-Control": "public,max-age=31536000,immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}

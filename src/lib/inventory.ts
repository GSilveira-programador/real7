import { z } from "zod";
import { db } from "./db";
import { HttpError } from "./security";
import { imageUrl } from "./merchandising";
export const gallerySchema = z
  .array(
    z.object({
      id: z.string().optional(),
      url: imageUrl,
      alt: z.string().trim().min(5).max(180),
    }),
  )
  .min(1)
  .max(10)
  .refine((v) => {
    const ids = v.flatMap((i) => (i.id ? [i.id] : []));
    return new Set(ids).size === ids.length;
  }, "Imagens duplicadas.");
export const productPatch = z
  .object({
    version: z.number().int().min(0),
    name: z.string().trim().min(3).max(120),
    brandId: z.string().min(1),
    categoryId: z.string().min(1),
    model: z.string().max(80),
    color: z.string().max(40),
    ground: z.enum(["Campo", "Society", "Futsal"]),
    description: z.string().min(20).max(5000),
    material: z.string().max(150),
    sole: z.string().max(150),
    weightGrams: z.number().int().min(1).max(30000),
    widthCm: z.number().int().min(1).max(100),
    heightCm: z.number().int().min(1).max(100),
    lengthCm: z.number().int().min(1).max(100),
    price: z.number().int().min(100).max(100000000),
    compareAt: z.number().int().positive().max(100000000).nullable(),
    active: z.boolean(),
    featured: z.boolean(),
    images: gallerySchema,
  })
  .refine(
    (v) => v.compareAt === null || v.compareAt > v.price,
    "Preço anterior deve ser maior que o preço atual.",
  );
export async function editProduct(id: string, input: unknown, actorId: string) {
  const { version, images, ...data } = productPatch.parse(input);
  return db.$transaction(async (tx) => {
    const current = await tx.product.findUnique({
      where: { id },
      include: { images: true },
    });
    if (!current) throw new HttpError(404, "Produto não encontrado.");
    if (
      images.some((i) => i.id && !current.images.some((own) => own.id === i.id))
    )
      throw new HttpError(400, "A imagem não pertence a este produto.");
    const changed = await tx.product.updateMany({
      where: { id, version },
      data: { ...data, version: { increment: 1 } },
    });
    if (!changed.count)
      throw new HttpError(
        409,
        "Produto alterado por outro operador. Recarregue antes de salvar.",
      );
    await tx.productImage.deleteMany({
      where: {
        productId: id,
        id: { notIn: images.flatMap((i) => (i.id ? [i.id] : [])) },
      },
    });
    for (const [position, image] of images.entries()) {
      const entry = { url: image.url, alt: image.alt, position };
      if (image.id)
        await tx.productImage.update({ where: { id: image.id }, data: entry });
      else await tx.productImage.create({ data: { ...entry, productId: id } });
    }
    await tx.auditLog.create({
      data: { actorId, action: "product.update", entityId: id },
    });
    return tx.product.findUniqueOrThrow({
      where: { id },
      include: {
        images: { orderBy: { position: "asc" } },
        variants: { orderBy: { size: "asc" } },
      },
    });
  });
}
export const newVariant = z.object({
  size: z.number().int().min(20).max(48),
  sku: z.string().trim().min(1).max(80),
  stock: z.number().int().min(0).max(100000),
});
export async function addVariant(
  productId: string,
  input: unknown,
  actorId: string,
) {
  const data = newVariant.parse(input);
  return db.$transaction(async (tx) => {
    if (!(await tx.product.findUnique({ where: { id: productId } })))
      throw new HttpError(404, "Produto não encontrado.");
    const v = await tx.variant.create({ data: { ...data, productId } });
    await tx.auditLog.create({
      data: { actorId, action: "variant.create", entityId: v.id },
    });
    return v;
  });
}
export async function editVariant(id: string, input: unknown, actorId: string) {
  const d = z
    .object({
      version: z.number().int().min(0),
      sku: z.string().trim().min(1).max(80),
      active: z.boolean(),
    })
    .parse(input);
  return db.$transaction(async (tx) => {
    const v = await tx.variant.updateMany({
      where: { id, version: d.version },
      data: { sku: d.sku, active: d.active, version: { increment: 1 } },
    });
    if (!v.count)
      throw new HttpError(
        409,
        "Variação alterada ou inexistente. Recarregue o catálogo.",
      );
    await tx.auditLog.create({
      data: { actorId, action: "variant.update", entityId: id },
    });
    return tx.variant.findUniqueOrThrow({ where: { id } });
  });
}

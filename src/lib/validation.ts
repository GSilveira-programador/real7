import { z } from "zod";
export const email = z
  .email()
  .max(254)
  .transform((v) => v.toLowerCase());
export const password = z
  .string()
  .min(12)
  .max(72)
  .refine(
    (v) => Buffer.byteLength(v, "utf8") <= 72,
    "Senha deve ter no máximo 72 bytes.",
  );
export const cartSchema = z
  .array(
    z.object({
      variantId: z.string().min(1),
      quantity: z.number().int().min(1).max(10),
    }),
  )
  .min(1)
  .max(30)
  .refine(
    (a) => new Set(a.map((i) => i.variantId)).size === a.length,
    "Variações duplicadas.",
  );
export const addressSchema = z.object({
  postcode: z.string().regex(/^\d{8}$/),
  street: z.string().min(3).max(150),
  number: z.string().min(1).max(20),
  complement: z.string().max(100).optional(),
  district: z.string().min(2).max(80),
  city: z.string().min(2).max(80),
  state: z.string().regex(/^[A-Z]{2}$/),
});
export const checkoutSchema = z.object({
  items: cartSchema,
  coupon: z.string().max(40).optional(),
  shippingId: z.string().min(1),
  email,
  name: z.string().min(3).max(100),
  phone: z.string().regex(/^\d{10,11}$/),
  address: addressSchema,
  idempotencyKey: z.uuid(),
});
export const productSchema = z
  .object({
    name: z.string().min(3).max(120),
    slug: z.string().regex(/^[a-z0-9-]+$/),
    brandId: z.string(),
    categoryId: z.string(),
    model: z.string().max(80),
    color: z.string().max(40),
    ground: z.enum(["Campo", "Society", "Futsal"]),
    weightGrams: z.number().int().min(1).max(30000),
    widthCm: z.number().int().min(1).max(100),
    heightCm: z.number().int().min(1).max(100),
    lengthCm: z.number().int().min(1).max(100),
    description: z.string().min(20).max(5000),
    material: z.string().max(150),
    sole: z.string().max(150),
    price: z.number().int().min(100),
    compareAt: z.number().int().positive().nullable().optional(),
    active: z.boolean().default(true),
    featured: z.boolean().default(false),
    demo: z.boolean().default(false),
    image: z
      .string()
      .url()
      .refine((v) => new URL(v).protocol === "https:"),
    variants: z
      .array(
        z.object({
          size: z.number().int().min(20).max(48),
          stock: z.number().int().min(0).max(100000),
          sku: z.string().min(1).max(80),
        }),
      )
      .min(1)
      .refine((a) => new Set(a.map((v) => v.size)).size === a.length),
  })
  .refine(
    (p) => !p.compareAt || p.compareAt > p.price,
    "Preço anterior deve ser maior que o preço atual.",
  );

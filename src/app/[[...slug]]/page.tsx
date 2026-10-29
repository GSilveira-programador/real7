import { activeBanners } from "@/lib/merchandising";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import Store from "@/components/Store";
import { db } from "@/lib/db";
import { settings } from "@/lib/commerce";
import type { Metadata } from "next";
export const dynamic = "force-dynamic";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}): Promise<Metadata> {
  const { slug = [] } = await params;
  if (
    [
      "newsletter",
      "conta",
      "admin",
      "pedido",
      "carrinho",
      "checkout",
      "favoritos",
    ].includes(slug[0])
  )
    return {
      title: (
        {
          newsletter: "Preferências de e-mail",
          conta: "Minha conta",
          admin: "Administração",
          pedido: "Acompanhar pedido",
          carrinho: "Carrinho",
          checkout: "Finalizar compra",
          favoritos: "Favoritos",
        } as Record<string, string>
      )[slug[0]],
      robots: { index: false, follow: false },
      referrer: "no-referrer",
    };
  if (slug[0] === "produto" && slug[1]) {
    const p = await db.product.findUnique({ where: { slug: slug[1] } });
    return {
      title: p?.name || "Produto não encontrado",
      description: p?.description,
      alternates: { canonical: "/produto/" + slug[1] },
    };
  }
  return {
    title: slug[0]
      ? (
          {
            catalogo: "Todas as chuteiras",
            carrinho: "Seu carrinho",
            conta: "Minha conta",
            admin: "Administração",
            checkout: "Finalizar compra",
          } as Record<string, string>
        )[slug[0]] || "JN Chuteiras"
      : "Seu jogo. Outro nível.",
  };
}
export default async function Page({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug = [] } = await params;
  const known = [
    "newsletter",
    "catalogo",
    "produto",
    "carrinho",
    "checkout",
    "conta",
    "favoritos",
    "pedido",
    "contato",
    "ajuda",
    "legal",
    "admin",
  ];
  if (slug[0] && !known.includes(slug[0])) notFound();
  const product =
    slug[0] === "produto"
      ? await db.product.findUnique({
          where: { slug: slug[1] || "", active: true },
          include: {
            brand: true,
            category: true,
            images: true,
            variants: true,
            reviews: {
              where: { approved: true },
              include: { user: { select: { name: true } } },
            },
          },
        })
      : null;
  if (slug[0] === "produto" && !product) notFound();
  const [products, brands, categories, config] = await Promise.all([
    db.product.findMany({
      where: { active: true },
      include: {
        brand: true,
        category: true,
        images: { orderBy: { position: "asc" } },
        variants: { orderBy: { size: "asc" } },
      },
      orderBy: { createdAt: "asc" },
      take: 12,
    }),
    db.brand.findMany(),
    db.category.findMany(),
    settings(),
  ]);
  const nonce = (await headers()).get("x-nonce") || undefined;
  const jsonld =
    product && !product.demo
      ? {
          "@context": "https://schema.org",
          "@type": "Product",
          name: product.name,
          description: product.description,
          image: product.images.map((i) => i.url),
          brand: { "@type": "Brand", name: product.brand.name },
          offers: {
            "@type": "Offer",
            priceCurrency: "BRL",
            price: (product.price / 100).toFixed(2),
            availability: product.variants.some((v) => v.active && v.stock > 0)
              ? "https://schema.org/InStock"
              : "https://schema.org/OutOfStock",
          },
        }
      : null;
  return (
    <>
      {jsonld && (
        <script
          nonce={nonce}
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(jsonld).replace(/</g, "\\u003c"),
          }}
        />
      )}
      <Store
        initialProduct={product ? JSON.parse(JSON.stringify(product)) : null}
        initialProducts={JSON.parse(JSON.stringify(products))}
        brands={brands}
        categories={categories}
        config={{ ...config, banners: await activeBanners() }}
      />
    </>
  );
}

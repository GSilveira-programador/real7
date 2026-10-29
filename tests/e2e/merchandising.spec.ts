import "dotenv/config";
import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { db } from "../../src/lib/db";
const createdBanners = new Set<string>();
test.afterEach(async () => {
  if (createdBanners.size)
    await db.banner.deleteMany({ where: { id: { in: [...createdBanners] } } });
  createdBanners.clear();
});
test("banners publicados permitem avançar e voltar sem reprodução automática", async ({
  page,
}) => {
  const key = randomUUID().slice(0, 8);
  const ids: string[] = [];
  try {
    for (let i = 0; i < 2; i++) {
      const banner = await db.banner.create({
        data: {
          title: `SEU JOGO.\nBANNER DE TESTE ${key}-${i}`,
          subtitle: "Conteúdo fictício temporário de teste.",
          image: "/images/boot-" + i + ".svg",
          imageAlt: "Ilustração original utilizada em teste",
          ctaLabel: "ENCONTRE SUA CHUTEIRA",
          href: "/catalogo",
          position: i,
          active: true,
          startsAt: new Date(Date.now() - 60000),
          endsAt: new Date(Date.now() + 300000),
        },
      });
      ids.push(banner.id);
      createdBanners.add(banner.id);
    }
    await page.goto("/");
    await page.getByRole("button", { name: "Somente essenciais" }).click();
    const heading = page.locator(".hero h1");
    const initial = (await heading.textContent())!;
    await page
      .getByRole("button", { name: "Próximo banner", exact: true })
      .click();
    await expect(heading).not.toHaveText(initial);
    await page
      .getByRole("button", { name: "Banner anterior", exact: true })
      .click();
    await expect(heading).toHaveText(initial);
    await expect(page.locator(".hero-cta")).toHaveAttribute(
      "href",
      "/catalogo",
    );
  } finally {
    await db.banner.deleteMany({ where: { id: { in: ids } } });
  }
});
test("guia e zoom respondem ao teclado e devolvem foco ao botão de origem", async ({
  page,
}) => {
  await page.goto("/produto/velocity-pro");
  await page.getByRole("button", { name: "Somente essenciais" }).click();
  const guide = page.getByRole("button", { name: "Guia de medidas" });
  await guide.click();
  await expect(
    page.getByRole("dialog", { name: "Guia de medidas" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "Guia de medidas" }),
  ).toHaveCount(0);
  await expect(guide).toBeFocused();
  const zoom = page.getByRole("button", {
    name: "Ampliar imagem",
    exact: true,
  });
  await zoom.click();
  const close = page.getByRole("button", {
    name: "Fechar ampliação",
    exact: true,
  });
  await expect(close).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(zoom).toBeFocused();
});

"use client";
import { useState } from "react";
import { ArrowUp, ArrowDown, Plus, Trash2 } from "lucide-react";
import { money } from "./Store";
type Mutation = (
  path: string,
  data: unknown,
  method?: string,
) => Promise<boolean>;
export default function ProductEditor({
  product: p,
  brands,
  categories,
  mutate,
}: {
  product: any;
  brands: any[];
  categories: any[];
  mutate: Mutation;
}) {
  const [uploading, setUploading] = useState(false),
    [uploadError, setUploadError] = useState("");
  const [images, setImages] = useState<
    { id?: string; url: string; alt: string }[]
  >(p.images.map((i: any) => ({ id: i.id, url: i.url, alt: i.alt })));
  const move = (index: number, delta: number) => {
    const next = [...images];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    setImages(next);
  };
  return (
    <details className="panel product-editor">
      <summary>
        {p.name}{" "}
        <span className="muted">
          {money(p.price)} · {p.active ? "Ativo" : "Inativo"}{" "}
          {p.demo ? "· Fictício" : ""}
        </span>
      </summary>
      <form
        className="form-grid"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = Object.fromEntries(new FormData(e.currentTarget));
          const numbers = ["weightGrams", "widthCm", "heightCm", "lengthCm"];
          const values = Object.fromEntries(
            numbers.map((k) => [k, Number(f[k])]),
          );
          await mutate(
            "admin/products/" + p.id,
            {
              ...f,
              ...values,
              version: p.version,
              price: Math.round(Number(f.price) * 100),
              compareAt: f.compareAt
                ? Math.round(Number(f.compareAt) * 100)
                : null,
              active: f.active === "on",
              featured: f.featured === "on",
              images,
            },
            "PATCH",
          );
        }}
      >
        {(["name", "model", "color", "material", "sole"] as const).map(
          (key, i) => (
            <label key={key}>
              {["Nome", "Linha/modelo", "Cor", "Material", "Solado"][i]}
              <input name={key} defaultValue={p[key]} required />
            </label>
          ),
        )}
        <label>
          Marca
          <select name="brandId" defaultValue={p.brandId}>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Categoria
          <select name="categoryId" defaultValue={p.categoryId}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Terreno
          <select name="ground" defaultValue={p.ground}>
            {["Campo", "Society", "Futsal"].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <label>
          Preço em R$
          <input
            required
            name="price"
            type="number"
            min="1"
            step="0.01"
            defaultValue={p.price / 100}
          />
        </label>
        <label>
          Preço anterior em R$
          <input
            name="compareAt"
            type="number"
            min="1"
            step="0.01"
            defaultValue={p.compareAt ? p.compareAt / 100 : ""}
          />
        </label>
        {(
          [
            ["weightGrams", "Peso embalado (g)"],
            ["widthCm", "Largura (cm)"],
            ["heightCm", "Altura (cm)"],
            ["lengthCm", "Comprimento (cm)"],
          ] as const
        ).map(([key, label]) => (
          <label key={key}>
            {label}
            <input
              required
              type="number"
              min="1"
              name={key}
              defaultValue={p[key]}
            />
          </label>
        ))}
        <label className="span-two">
          Descrição
          <textarea
            name="description"
            required
            minLength={20}
            maxLength={5000}
            defaultValue={p.description}
          />
        </label>
        <label className="check-label">
          <input type="checkbox" name="active" defaultChecked={p.active} />{" "}
          Produto ativo
        </label>
        <label className="check-label">
          <input type="checkbox" name="featured" defaultChecked={p.featured} />{" "}
          Destaque
        </label>
        <fieldset className="span-two gallery-editor" disabled={uploading}>
          <legend>Galeria — a primeira imagem é a capa</legend>
          {uploadError && (
            <p className="notice error" role="alert">
              {uploadError}
            </p>
          )}
          {uploading && <p role="status">Enviando imagem…</p>}
          {images.map((image, i) => (
            <div className="gallery-row" key={image.id || "new-" + i}>
              <img src={image.url} alt={image.alt || "Imagem em edição"} />
              <div>
                <label>
                  URL da imagem {i + 1}
                  <input
                    value={image.url}
                    required
                    onChange={(e) =>
                      setImages(
                        images.map((v, j) =>
                          i === j ? { ...v, url: e.target.value } : v,
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  Enviar imagem {i + 1}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setUploading(true);
                      setUploadError("");
                      try {
                        const r = await fetch("/api/admin/uploads", {
                          method: "POST",
                          headers: { "Content-Type": file.type },
                          body: file,
                        });
                        const result = await r.json();
                        if (!r.ok)
                          throw new Error(
                            result.error || "Não foi possível enviar a imagem.",
                          );
                        setImages((current) =>
                          current.map((v, j) =>
                            i === j ? { ...v, url: result.url } : v,
                          ),
                        );
                      } catch (err) {
                        setUploadError((err as Error).message);
                      } finally {
                        setUploading(false);
                      }
                    }}
                  />
                </label>
                <label>
                  Texto alternativo {i + 1}
                  <input
                    value={image.alt}
                    required
                    minLength={5}
                    onChange={(e) =>
                      setImages(
                        images.map((v, j) =>
                          i === j ? { ...v, alt: e.target.value } : v,
                        ),
                      )
                    }
                  />
                </label>
              </div>
              <div className="gallery-actions">
                <button
                  type="button"
                  className="icon"
                  aria-label={"Mover imagem " + (i + 1) + " para cima"}
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                >
                  <ArrowUp size={16} />
                </button>
                <button
                  type="button"
                  className="icon"
                  aria-label={"Mover imagem " + (i + 1) + " para baixo"}
                  disabled={i === images.length - 1}
                  onClick={() => move(i, 1)}
                >
                  <ArrowDown size={16} />
                </button>
                <button
                  type="button"
                  className="icon"
                  aria-label={"Remover imagem " + (i + 1)}
                  disabled={images.length <= 1}
                  onClick={() => setImages(images.filter((_, j) => i !== j))}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
          <button
            className="btn secondary btn-small"
            type="button"
            disabled={images.length >= 10}
            onClick={() => setImages([...images, { url: "", alt: p.name }])}
          >
            <Plus size={15} /> Adicionar imagem
          </button>
        </fieldset>
        <button className="btn" disabled={uploading}>
          Salvar produto e galeria
        </button>
        <p className="muted">
          Versão {p.version}. Conflitos de edição exigem recarregar os dados.
        </p>
      </form>
      <h3>Variações e estoque</h3>
      <p className="muted">
        Tamanho é uma identidade permanente da variação. Para outro tamanho,
        crie uma nova variação; o histórico de pedidos é preservado.
      </p>
      {p.variants.map((v: any) => (
        <section className="variant-editor" key={v.id + ":" + v.version}>
          <div className="variant-label">
            <b>BR {v.size}</b>
            <span>
              {v.stock} unidades disponíveis ·{" "}
              {v.active ? "Ativa" : "Arquivada"}
            </span>
          </div>
          <form
            className="inline-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = Object.fromEntries(new FormData(e.currentTarget));
              await mutate(
                "admin/variants/" + v.id,
                { version: v.version, sku: f.sku, active: f.active === "on" },
                "PATCH",
              );
            }}
          >
            <label>
              SKU tamanho {v.size}
              <input name="sku" defaultValue={v.sku} required />
            </label>
            <label className="check-label">
              <input name="active" type="checkbox" defaultChecked={v.active} />{" "}
              Ativa
            </label>
            <button className="btn secondary btn-small">Salvar variação</button>
          </form>
          <form
            className="inline-form"
            onSubmit={async (e) => {
              e.preventDefault();
              await mutate(
                "admin/stock/" + v.id,
                { delta: Number(new FormData(e.currentTarget).get("delta")) },
                "PATCH",
              );
            }}
          >
            <label>
              Ajuste de estoque tamanho {v.size}
              <input
                name="delta"
                type="number"
                required
                placeholder="Ex.: +3 ou −2"
              />
            </label>
            <button className="btn secondary btn-small">Ajustar estoque</button>
          </form>
        </section>
      ))}
      <details>
        <summary>Adicionar numeração</summary>
        <form
          className="form-grid"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = Object.fromEntries(new FormData(e.currentTarget));
            await mutate("admin/products/" + p.id + "/variants", {
              size: Number(f.size),
              sku: f.sku,
              stock: Number(f.stock),
            });
          }}
        >
          <label>
            Tamanho
            <input name="size" type="number" min="20" max="48" required />
          </label>
          <label>
            SKU
            <input name="sku" required />
          </label>
          <label>
            Estoque inicial
            <input
              name="stock"
              type="number"
              min="0"
              max="100000"
              required
              defaultValue={0}
            />
          </label>
          <button className="btn btn-small">Criar variação</button>
        </form>
      </details>
      <button
        className="text-button"
        onClick={() => mutate("admin/products/" + p.id, {}, "DELETE")}
      >
        <Trash2 size={15} /> Arquivar produto
      </button>
    </details>
  );
}

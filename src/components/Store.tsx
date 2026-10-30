"use client";
import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type FormEvent,
} from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowUpRight,
  ArrowRight,
  Search,
  Heart,
  ShoppingBag,
  User,
  Menu,
  X,
  ChevronRight,
  ChevronLeft,
  Truck,
  ShieldCheck,
  RefreshCcw,
  Headphones,
  Check,
  Plus,
  Minus,
  Trash2,
  SlidersHorizontal,
  Star,
  Zap,
  MoveUpRight,
  Instagram,
  Mail,
  Sun,
  Moon,
  LockKeyhole,
  Package,
  LogOut,
  Share2,
  ChartNoAxesCombined,
  LayoutDashboard,
  Users,
  Settings,
  Tag,
  ClipboardList,
  MessageCircle,
} from "lucide-react";
import Admin from "./Admin";
import NewsletterPreferences from "./NewsletterPreferences";
export type Product = {
  id: string;
  slug: string;
  name: string;
  model: string;
  color: string;
  ground: string;
  description: string;
  material: string;
  sole: string;
  price: number;
  compareAt: number | null;
  demo: boolean;
  active: boolean;
  featured: boolean;
  brand: { id: string; name: string };
  category: { id: string; name: string; slug: string };
  images: { url: string; alt: string }[];
  variants: {
    id: string;
    size: number;
    stock: number;
    sku: string;
    active: boolean;
  }[];
  reviews?: { rating: number; text: string; user?: { name: string } }[];
};
type Item = { variantId: string; quantity: number };
export const money = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    v / 100,
  );
export class ApiError extends Error {
  constructor(
    message: string,
    public payload: any,
  ) {
    super(message);
  }
}
export async function api(path: string, data?: unknown, method?: string) {
  const r = await fetch("/api/" + path, {
    method: method || (data ? "POST" : "GET"),
    headers: { "Content-Type": "application/json" },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  const result = await r.json();
  if (!r.ok)
    throw new ApiError(
      result.error +
        (result.details
          ? " " +
            result.details
              .map((d: any) => d.field + ": " + d.message)
              .join("; ")
          : ""),
      result,
    );
  return result;
}
const legalTitles: Record<string, string> = {
  privacidade: "Política de Privacidade",
  cookies: "Política de Cookies",
  termos: "Termos de Uso",
  entrega: "Política de Entrega",
  trocas: "Trocas e Devoluções",
  reembolso: "Política de Reembolso",
  empresa: "Informações da Empresa",
  direitos: "Direitos do Consumidor",
};
export default function Store({
  initialProducts,
  brands,
  categories,
  config,
  initialProduct,
}: {
  initialProduct?: Product | null;
  initialProducts: Product[];
  brands: any[];
  categories: any[];
  config: Record<string, any>;
}) {
  const pathname = usePathname(),
    router = useRouter(),
    params = useSearchParams();
  const [cart, setCart] = useState<Item[]>([]),
    [ready, setReady] = useState(false),
    [me, setMe] = useState<any>(null),
    [toast, setToast] = useState(""),
    [mobile, setMobile] = useState(false),
    [consent, setConsent] = useState<string | null>("loading"),
    [theme, setTheme] = useState("dark");
  const [cartLoadError, setCartLoadError] = useState(""),
    [cartReload, setCartReload] = useState(0);
  const cartInitialization = useRef<{
    revision: number;
    promise: Promise<Item[]>;
  } | null>(null);
  const cartRevision = useRef(0),
    cartWriting = useRef(false);
  const notify = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(""), 6000);
  }, []);
  useEffect(() => {
    api("auth/me")
      .then(setMe)
      .catch(() => {});
    setConsent(localStorage.getItem("elite-consent"));
    const t = localStorage.getItem("elite-theme") || "dark";
    setTheme(t);
    document.documentElement.dataset.theme = t;
  }, []);
  useEffect(() => {
    let active = true;
    const initialization = (cartInitialization.current ??= {
      revision: cartRevision.current,
      promise: api("cart"),
    });
    initialization.promise
      .then((items) => {
        if (!active) return;
        if (initialization.revision === cartRevision.current) setCart(items);
        setCartLoadError("");
        setReady(true);
      })
      .catch((e) => {
        if (!active) return;
        setCartLoadError((e as Error).message);
        setReady(false);
      });
    return () => {
      active = false;
    };
  }, [cartReload]);
  const retryCart = () => {
    cartInitialization.current = null;
    setReady(false);
    setCartLoadError("");
    setCartReload((v) => v + 1);
  };
  const updateCart = async (items: Item[]) => {
    if (!ready || cartWriting.current) {
      notify("Aguarde o carrinho terminar de atualizar.");
      return;
    }
    cartWriting.current = true;
    cartRevision.current++;
    try {
      await api("cart", items, "PUT");
      setCart(items);
    } catch (e) {
      notify((e as Error).message);
    } finally {
      cartWriting.current = false;
    }
  };
  const add = async (p: Product, variantId: string, quantity = 1) => {
    const v = p.variants.find((v) => v.id === variantId);
    if (!v || !v.active || v.stock < quantity) {
      notify("Selecione um tamanho disponível.");
      return false;
    }
    const current = cart.find((i) => i.variantId === variantId);
    if ((current?.quantity || 0) + quantity > Math.min(v.stock, 10)) {
      notify("Quantidade máxima disponível atingida.");
      return false;
    }
    if (!ready || cartWriting.current) {
      notify("Aguarde o carrinho terminar de atualizar.");
      return false;
    }
    cartWriting.current = true;
    cartRevision.current++;
    try {
      const items = current
        ? cart.map((i) =>
            i.variantId === variantId
              ? { ...i, quantity: i.quantity + quantity }
              : i,
          )
        : [...cart, { variantId, quantity }];
      await api("cart", items, "PUT");
      setCart(items);
      notify("Produto adicionado ao carrinho.");
      return true;
    } catch (e) {
      notify((e as Error).message);
      return false;
    } finally {
      cartWriting.current = false;
    }
  };
  const favorite = async (p: Product) => {
    try {
      await api("favorites", { productId: p.id });
      notify("Produto salvo nos favoritos.");
    } catch (e) {
      notify((e as Error).message);
    }
  };
  const logout = async () => {
    await api("auth/logout", {});
    setMe(null);
    router.push("/");
  };
  const parts = pathname.split("/").filter(Boolean);
  let content;
  if (parts[0] === "admin") content = <Admin me={me} notify={notify} />;
  else if (parts[0] === "produto")
    content = (
      <ProductPage
        cartReady={ready}
        initialProduct={initialProduct}
        slug={parts[1]}
        add={add}
        favorite={favorite}
        notify={notify}
      />
    );
  else if (parts[0] === "catalogo")
    content = (
      <Catalog
        brands={brands}
        categories={categories}
        favorite={favorite}
        notify={notify}
      />
    );
  else if (["carrinho", "checkout"].includes(parts[0]))
    content = (
      <CartPage
        cart={cart}
        update={updateCart}
        ready={ready}
        checkout={parts[0] === "checkout"}
        me={me}
        notify={notify}
      />
    );
  else if (parts[0] === "newsletter") content = <NewsletterPreferences />;
  else if (parts[0] === "conta")
    content = <Account me={me} setMe={setMe} notify={notify} logout={logout} />;
  else if (parts[0] === "favoritos")
    content = <Favorites favorite={favorite} notify={notify} />;
  else if (parts[0] === "pedido")
    content = <OrderPage id={parts[1]} notify={notify} />;
  else if (parts[0] === "contato" || parts[0] === "ajuda")
    content = <Contact config={config} notify={notify} />;
  else if (parts[0] === "legal")
    content = <Legal page={parts[1]} config={config} />;
  else if (parts.length)
    content = (
      <div className="container empty">
        <h1>Página não encontrada</h1>
        <Link className="btn" href="/">
          Voltar para a loja
        </Link>
      </div>
    );
  else
    content = (
      <Home
        products={initialProducts}
        favorite={favorite}
        config={config}
        notify={notify}
      />
    );
  return (
    <>
      <div className="announcement">
        <span>
          <Zap size={13} /> PERFORMANCE COMEÇA NA ESCOLHA CERTA
        </span>
        <span>
          {config.salesEnabled
            ? config.nationwideShipping
              ? "Entrega para todo o Brasil · Consulte seu CEP"
              : "Consulte entrega para seu CEP"
            : "AMBIENTE DEMONSTRATIVO · VENDAS DESATIVADAS"}
        </span>
        <Link href="/ajuda">
          Central de ajuda <ArrowUpRight size={13} />
        </Link>
      </div>
      <header className="header">
        <div className="container header-inner">
          <Link href="/" className="logo" aria-label="JN Chuteiras início">
            <span className="logo-mark">
              J<span>N</span>
            </span>
            <span>
              JN<span className="logo-light">CHUTEIRAS</span>
              <small>SEU JOGO. OUTRO NÍVEL.</small>
            </span>
            <i>↗</i>
          </Link>
          <form
            className="search"
            onSubmit={(e) => {
              e.preventDefault();
              const value = new FormData(e.currentTarget).get("q");
              router.push("/catalogo?q=" + encodeURIComponent(String(value)));
            }}
          >
            <Search size={19} />
            <input
              name="q"
              placeholder="Encontre sua próxima chuteira"
              aria-label="Buscar chuteiras"
            />
            <kbd>↵</kbd>
          </form>
          <div className="header-actions">
            <button
              aria-label="Alternar tema"
              className="icon theme"
              onClick={() => {
                const t = theme === "dark" ? "light" : "dark";
                setTheme(t);
                localStorage.setItem("elite-theme", t);
                document.documentElement.dataset.theme = t;
              }}
            >
              {theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}
            </button>
            <Link className="account-link" href="/conta">
              <User size={22} />
              <span>
                Bem-vindo(a)
                <strong>
                  {me ? me.name.split(" ")[0] : "Entrar / Cadastrar"}
                </strong>
              </span>
            </Link>
            <Link className="icon" aria-label="Favoritos" href="/favoritos">
              <Heart size={22} />
            </Link>
            <Link
              className="icon cart-icon"
              aria-label={`Carrinho com ${cart.reduce((s, i) => s + i.quantity, 0)} itens`}
              href="/carrinho"
            >
              <ShoppingBag size={22} />
              <b>{cart.reduce((s, i) => s + i.quantity, 0)}</b>
            </Link>
            <Link
              className="icon mobile-account"
              href="/conta"
              aria-label="Minha conta"
            >
              <User size={20} />
            </Link>
            <button
              className="icon mobile-toggle"
              aria-label="Abrir menu"
              onClick={() => setMobile(!mobile)}
            >
              {mobile ? <X /> : <Menu />}
            </button>
          </div>
        </div>
        <nav
          className={"navigation container " + (mobile ? "is-open" : "")}
          aria-label="Categorias"
        >
          <Link href="/catalogo" onClick={() => setMobile(false)}>
            <Menu size={16} /> Todas as chuteiras
          </Link>
          {[
            ["Campo", "campo"],
            ["Society", "society"],
            ["Futsal", "futsal"],
            ["Infantil", "infantis"],
          ].map(([n, c]) => (
            <Link
              key={c}
              href={"/catalogo?category=" + c}
              onClick={() => setMobile(false)}
            >
              {n}
            </Link>
          ))}
          <Link href="/catalogo?sort=newest">
            Lançamentos <span className="tiny-badge">NEW</span>
          </Link>
          <Link className="sale-link" href="/catalogo?sale=1">
            <Tag size={15} /> Outlet
          </Link>
          <Link href="/ajuda" className="nav-help">
            Precisa de uma assistência? <ArrowUpRight size={14} />
          </Link>
        </nav>
      </header>
      <a className="skip-link" href="#main">
        Pular para o conteúdo
      </a>
      {cartLoadError && (
        <div className="container cart-load-error notice error" role="alert">
          <span>Não foi possível carregar seu carrinho. {cartLoadError}</span>
          <button className="btn secondary btn-small" onClick={retryCart}>
            Recarregar carrinho
          </button>
        </div>
      )}
      <main id="main" tabIndex={-1}>
        {content}
      </main>
      <footer>
        <div className="container footer-grid">
          <div>
            <Link href="/" className="footer-logo">
              JN<span>CHUTEIRAS</span>↗
            </Link>
            <p>
              O próximo nível do seu jogo
              <br />
              começa aqui.
            </p>
            <small>Design original. Paixão pelo futebol.</small>
          </div>
          <div>
            <h3>Explore o jogo</h3>
            <Link href="/catalogo?category=campo">Chuteiras de campo</Link>
            <Link href="/catalogo?category=society">Chuteiras society</Link>
            <Link href="/catalogo?category=futsal">Chuteiras futsal</Link>
            <Link href="/catalogo?sale=1">Ofertas</Link>
          </div>
          <div>
            <h3>Conte com a gente</h3>
            <Link href="/conta">Minha conta e pedidos</Link>
            <Link href="/contato">Fale com a JN Chuteiras</Link>
            <Link href="/legal/entrega">Entregas e fretes</Link>
            <Link href="/legal/trocas">Trocas e devoluções</Link>
          </div>
          <div>
            <h3>Jogo transparente</h3>
            <Link href="/legal/privacidade">Privacidade e LGPD</Link>
            <Link href="/newsletter">Preferências de e-mail</Link>
            <Link href="/legal/termos">Termos de uso</Link>
            <Link href="/legal/empresa">Informações da empresa</Link>
            <button className="text-button" onClick={() => setConsent(null)}>
              Preferências de cookies
            </button>
          </div>
        </div>
        <div className="container footer-bottom">
          <span>
            © {new Date().getFullYear()} JN Chuteiras.{" "}
            {config.company || "Empresa ainda não configurada."}
          </span>
          <span>
            {config.cnpj
              ? `CNPJ: ${config.cnpj}`
              : "PROJETO DEMONSTRATIVO · PRODUTOS FICTÍCIOS"}
          </span>
          <Link href="/admin">
            Administração <ArrowUpRight size={12} />
          </Link>
        </div>
      </footer>
      {config.whatsapp && (
        <a
          className="whatsapp"
          aria-label="Atendimento no WhatsApp"
          href={"https://wa.me/" + config.whatsapp}
          target="_blank"
          rel="noreferrer"
        >
          <MessageCircle />
        </a>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          {toast}
          <button aria-label="Fechar aviso" onClick={() => setToast("")}>
            <X size={16} />
          </button>
        </div>
      )}
      {consent === null && (
        <div className="cookie">
          <div>
            <b>Sua privacidade entra em campo.</b>
            <p>
              Usamos cookies essenciais para conta e carrinho. Cookies opcionais
              permanecem desativados.{" "}
              <Link href="/legal/cookies">Saiba mais</Link>
            </p>
          </div>
          <button
            className="btn btn-small"
            onClick={() => {
              localStorage.setItem("elite-consent", "essential");
              setConsent("essential");
            }}
          >
            Somente essenciais <Check size={16} />
          </button>
        </div>
      )}
    </>
  );
}
function ProductCard({
  p,
  favorite,
}: {
  p: Product;
  favorite: (p: Product) => void;
}) {
  const off =
    p.compareAt && p.compareAt > p.price
      ? Math.round((1 - p.price / p.compareAt) * 100)
      : 0;
  return (
    <article className="product-card">
      <div className="product-photo">
        <Link href={"/produto/" + p.slug} aria-label={p.name}>
          <img
            src={p.images[0]?.url}
            alt={p.images[0]?.alt || p.name}
            loading="lazy"
          />
        </Link>
        <span className={"product-badge " + (off ? "discount" : "")}>
          {off ? `−${off}%` : "NOVA COLEÇÃO"}
        </span>
        <button
          className="favorite"
          aria-label={"Favoritar " + p.name}
          onClick={() => favorite(p)}
        >
          <Heart size={18} />
        </button>
        <span className="ground-label">
          {p.ground.toUpperCase()} <ArrowUpRight size={12} />
        </span>
        <Link href={"/produto/" + p.slug} className="product-quick">
          Escolher meu tamanho <Plus size={16} />
        </Link>
      </div>
      <div className="product-info">
        <div className="product-eyebrow">
          JN LAB <span>ILUSTRATIVO</span>
        </div>
        <Link href={"/produto/" + p.slug}>
          <h3>{p.name}</h3>
        </Link>
        <p>
          Chuteira {p.ground.toLowerCase()} · {p.color}
        </p>
        <div className="price-line">
          <strong>{money(p.price)}</strong>
          {off > 0 && <del>{money(p.compareAt!)}</del>}
        </div>
        <small>Produto fictício · Não disponível para venda</small>
      </div>
    </article>
  );
}
function SectionTitle({
  eyebrow,
  title,
  href,
  link = "Ver todas",
}: {
  eyebrow: string;
  title: string;
  href?: string;
  link?: string;
}) {
  return (
    <div className="section-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
      </div>
      {href && (
        <Link href={href}>
          {link} <ArrowUpRight size={18} />
        </Link>
      )}
    </div>
  );
}
function Home({
  products,
  favorite,
  config,
  notify,
}: {
  products: Product[];
  favorite: (p: Product) => void;
  config: any;
  notify: (m: string) => void;
}) {
  const banners = config.banners || [];
  const [slide, setSlide] = useState(0);
  const banner = banners[slide] || banners[0];
  return (
    <>
      <section className="hero">
        <div className="hero-grid" />
        <div className="container hero-inner">
          <div className="hero-copy">
            <div className="hero-label">
              <span /> A PRÓXIMA GERAÇÃO DO SEU FUTEBOL
            </div>
            <h1>
              {String(
                banner?.title ||
                  config.bannerTitle ||
                  "SEU JOGO.\nOUTRO NÍVEL.",
              )
                .split("\n")
                .map((s, i) => (
                  <span key={i} className={i ? "outline-text" : ""}>
                    {s}
                    <br />
                  </span>
                ))}
            </h1>
            <p>{banner?.subtitle ?? config.bannerSubtitle}</p>
            <Link href={banner?.href || "/catalogo"} className="btn hero-cta">
              {banner?.ctaLabel || "ENCONTRE SUA CHUTEIRA"}{" "}
              <ArrowUpRight size={20} />
            </Link>
            <div className="hero-bottom">
              <span className="small-line" />
              <span>DO PRIMEIRO TOQUE AO ÚLTIMO GOL.</span>
            </div>
          </div>
          <div className="hero-art">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="hero-word">{banner ? "JN" : "VELOCITY"}</div>
            <span className="art-plus plus-one">+</span>
            <span className="art-plus plus-two">+</span>
            <img
              className="hero-boot"
              src={banner?.image || "/images/boot-0.svg"}
              alt={
                banner?.imageAlt ||
                "Ilustração original de chuteira verde neon Velocity Pro, produto fictício"
              }
            />
            <div className="shoe-caption">
              <span>
                {banner ? "SELEÇÃO JN CHUTEIRAS" : "01 / JN LAB CONCEPT"}
              </span>
              <b>
                {banner ? "ESCOLHAS DO SEU JOGO" : "VELOCITY PRO"}{" "}
                <ArrowUpRight size={16} />
              </b>
              <small>VELOCIDADE EM CADA DETALHE</small>
            </div>
            <span className="vertical-text">
              ENGINEERED TO GO BEYOND — 2026
            </span>
            <div className="hero-art-tag">
              FG <span>CAMPO</span>
            </div>
          </div>
        </div>
        <div className="hero-pagination">
          {banners.length > 1 && (
            <button
              aria-label="Banner anterior"
              onClick={() =>
                setSlide((slide + banners.length - 1) % banners.length)
              }
            >
              <ChevronLeft size={16} />
            </button>
          )}
          <b>
            {String((slide < banners.length ? slide : 0) + 1).padStart(2, "0")}{" "}
            <i>/ {String(Math.max(1, banners.length)).padStart(2, "0")}</i>
          </b>
          {banners.length > 1 && (
            <button
              aria-label="Próximo banner"
              onClick={() => setSlide((slide + 1) % banners.length)}
            >
              <ChevronRight size={16} />
            </button>
          )}
        </div>
      </section>
      <section className="benefits container">
        {[
          [Truck, "Do campo à sua casa", "Entrega: consulte disponibilidade"],
          [
            ShieldCheck,
            "Transparência sempre",
            "Catálogo demonstrativo identificado",
          ],
          [RefreshCcw, "Compra sem dúvidas", "Políticas claras de troca"],
          [Headphones, "Estamos no seu time", "Central de ajuda e atendimento"],
        ].map(([Icon, title, text], i) => {
          const I = Icon as typeof Truck;
          return (
            <div key={i}>
              <I size={24} strokeWidth={1.5} />
              <span>
                <b>{title as string}</b>
                <small>{text as string}</small>
              </span>
            </div>
          );
        })}
      </section>
      <section className="section container">
        <SectionTitle
          eyebrow="CADA TERRENO, UMA NOVA POSSIBILIDADE"
          title="Onde você faz a diferença?"
        />
        <div className="category-grid">
          {[
            ["CAMPO", "Domine o gramado.", "campo", 0],
            ["SOCIETY", "Velocidade no sintético.", "society", 1],
            ["FUTSAL", "Controle em cada toque.", "futsal", 3],
          ].map(([name, text, slug, img], i) => (
            <Link
              key={String(slug)}
              href={"/catalogo?category=" + slug}
              className={"category-card cat-" + i}
            >
              <span className="category-number">0{i + 1} /</span>
              <img src={"/images/boot-" + img + ".svg"} alt="" />
              <div>
                <h3>{name}</h3>
                <p>{text}</p>
              </div>
              <span className="category-arrow">
                <ArrowUpRight />
              </span>
            </Link>
          ))}
        </div>
      </section>
      <section className="section container">
        <SectionTitle
          eyebrow="ESCOLHAS PARA ENTRAR EM CAMPO"
          title="Destaques da coleção"
          href="/catalogo"
        />
        <div className="product-grid">
          {products.slice(0, 4).map((p) => (
            <ProductCard key={p.id} p={p} favorite={favorite} />
          ))}
        </div>
        <p className="demo-note">
          Catálogo conceitual: todos os produtos, preços e estoques apresentados
          são fictícios.
        </p>
      </section>
      <section className="statement">
        <div className="container">
          <span>MAIS QUE UMA CHUTEIRA.</span>
          <strong>
            É O SEU PRÓXIMO <em>NÍVEL.</em>
          </strong>
          <Link href="/catalogo">
            ESCOLHA A SUA <ArrowUpRight size={24} />
          </Link>
        </div>
      </section>
      <section className="section container">
        <SectionTitle
          eyebrow="O PRÓXIMO LANCE COMEÇA AQUI"
          title="Novos nomes. Novas possibilidades."
          href="/catalogo?sort=newest"
          link="Explorar lançamentos"
        />
        <div className="product-grid">
          {products.slice(2, 6).map((p) => (
            <ProductCard key={p.id} p={p} favorite={favorite} />
          ))}
        </div>
      </section>
      <section className="editorial container">
        <div>
          <span className="eyebrow">FEITA PARA QUEM VIVE O JOGO</span>
          <h2>
            CADA DETALHE.
            <br />
            CADA JOGADA.
            <br />
            <em>TODO SEU.</em>
          </h2>
          <p>
            Encontre o solado, o ajuste e o estilo para o seu futebol. Do treino
            de terça à decisão de domingo.
          </p>
          <Link className="btn" href="/ajuda">
            CONHEÇA SEU TERRENO <ArrowUpRight size={20} />
          </Link>
        </div>
        <div className="editorial-art">
          <span>
            CONTROL
            <br />
            THE GAME.
          </span>
          <img
            src="/images/boot-2.svg"
            alt="Chuteira conceitual preta, ilustração original"
          />
        </div>
      </section>
      <section className="section container review-section">
        <SectionTitle
          eyebrow="CONFIANÇA SE CONSTRÓI DENTRO DE CAMPO"
          title="Histórias que ainda vamos viver."
        />
        <div className="review-empty">
          <div>
            <Star />
            <Star />
            <Star />
            <Star />
            <Star />
          </div>
          <p>As primeiras avaliações chegam com as primeiras entregas.</p>
          <small>
            Publicaremos avaliações apenas de compradores verificados. Sem
            opiniões inventadas.
          </small>
        </div>
      </section>
      <section className="newsletter">
        <div className="container">
          <div>
            <span className="eyebrow">FIQUE UM PASSO À FRENTE</span>
            <h2>Faça parte do nosso time.</h2>
            <p>Cadastre-se para receber novidades quando a loja for lançada.</p>
          </div>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = e.currentTarget;
              try {
                notify(
                  (
                    await api("newsletter", {
                      email: new FormData(f).get("email"),
                      consent: true,
                    })
                  ).message,
                );
                f.reset();
              } catch (err) {
                notify((err as Error).message);
              }
            }}
          >
            <div>
              <Mail size={18} />
              <input
                required
                name="email"
                type="email"
                placeholder="Seu melhor e-mail"
                aria-label="E-mail da newsletter"
              />
              <button type="submit" aria-label="Inscrever-se">
                <ArrowRight size={23} />
              </button>
            </div>
            <label>
              <input type="checkbox" required /> Aceito receber novidades e li a{" "}
              <Link href="/legal/privacidade">Política de Privacidade</Link>.
            </label>
          </form>
        </div>
      </section>
    </>
  );
}
function Catalog({
  brands,
  categories,
  favorite,
  notify,
}: {
  brands: any[];
  categories: any[];
  favorite: (p: Product) => void;
  notify: (m: string) => void;
}) {
  const params = useSearchParams(),
    router = useRouter();
  const [data, setData] = useState<any>(null),
    [loading, setLoading] = useState(true),
    [filters, setFilters] = useState(false);
  const key = params.toString();
  useEffect(() => {
    let alive = true;
    setLoading(true);
    api("catalog?" + key)
      .then((d) => {
        if (alive) setData(d);
      })
      .catch((e) => notify(e.message))
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [key, notify]);
  const change = (name: string, value: string) => {
    const s = new URLSearchParams(key);
    value ? s.set(name, value) : s.delete(name);
    if (name !== "page") s.delete("page");
    router.push("/catalogo?" + s.toString());
  };
  return (
    <div className="container page">
      <Breadcrumb current="Catálogo" />
      <div className="page-intro">
        <span className="eyebrow">SEU PRÓXIMO PAR ESTÁ AQUI</span>
        <h1>
          Encontre seu jogo<span>.</span>
        </h1>
        <p>Para cada terreno, um jeito de ir além.</p>
      </div>
      <div className="catalog-toolbar">
        <button className="text-button" onClick={() => setFilters(!filters)}>
          <SlidersHorizontal size={17} /> Filtros
        </button>
        <span>{data?.total ?? "…"} produtos</span>
        <label>
          Ordenar por{" "}
          <select
            value={params.get("sort") || "newest"}
            onChange={(e) => change("sort", e.target.value)}
          >
            <option value="newest">Mais recentes</option>
            <option value="price-asc">Menor preço</option>
            <option value="price-desc">Maior preço</option>
            <option value="bestsellers">Mais vendidos</option>
            <option value="rating">Melhor avaliação</option>
          </select>
        </label>
      </div>
      <div className="catalog-layout">
        <aside className={"filters " + (filters ? "show" : "")}>
          <div>
            <b>BUSCA</b>
            <input
              placeholder="Produto ou marca"
              aria-label="Filtrar por busca"
              defaultValue={params.get("q") || ""}
              onBlur={(e) => change("q", e.target.value)}
            />
          </div>
          <div>
            <b>TIPO DE JOGO</b>
            <button
              className={!params.get("category") ? "selected" : ""}
              onClick={() => change("category", "")}
            >
              Todas as chuteiras
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                className={params.get("category") === c.slug ? "selected" : ""}
                onClick={() => change("category", c.slug)}
              >
                {c.name}
                <ChevronRight size={13} />
              </button>
            ))}
          </div>
          <div>
            <b>MARCA</b>
            <select
              aria-label="Filtrar marca"
              value={params.get("brand") || ""}
              onChange={(e) => change("brand", e.target.value)}
            >
              <option value="">Todas as marcas</option>
              {brands.map((b) => (
                <option key={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
          <div>
            <b>NUMERAÇÃO</b>
            <div className="sizes compact">
              {[36, 37, 38, 39, 40, 41, 42, 43, 44].map((s) => (
                <button
                  key={s}
                  className={params.get("size") === String(s) ? "selected" : ""}
                  onClick={() =>
                    change(
                      "size",
                      params.get("size") === String(s) ? "" : String(s),
                    )
                  }
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div>
            <b>PREÇO</b>
            <div className="price-filter">
              <input
                aria-label="Preço mínimo"
                type="number"
                min="0"
                placeholder="Mínimo"
                defaultValue={params.get("min") || ""}
                onBlur={(e) => change("min", e.target.value)}
              />
              <input
                aria-label="Preço máximo"
                type="number"
                min="0"
                placeholder="Máximo"
                defaultValue={params.get("max") || ""}
                onBlur={(e) => change("max", e.target.value)}
              />
            </div>
          </div>
          <div>
            <b>COR E MODELO</b>
            <input
              aria-label="Filtrar cor"
              placeholder="Ex.: Preto"
              defaultValue={params.get("color") || ""}
              onBlur={(e) => change("color", e.target.value)}
            />
            <input
              aria-label="Filtrar modelo"
              placeholder="Ex.: Velocity"
              defaultValue={params.get("model") || ""}
              onBlur={(e) => change("model", e.target.value)}
            />
          </div>
          <label>
            <input
              type="checkbox"
              checked={!!params.get("stock")}
              onChange={(e) => change("stock", e.target.checked ? "1" : "")}
            />{" "}
            Somente em estoque
          </label>
          <label>
            <input
              type="checkbox"
              checked={!!params.get("sale")}
              onChange={(e) => change("sale", e.target.checked ? "1" : "")}
            />{" "}
            Com desconto
          </label>
          <Link className="text-button" href="/catalogo">
            Limpar filtros <X size={14} />
          </Link>
        </aside>
        <div>
          {loading ? (
            <div className="product-grid three">
              {[1, 2, 3].map((i) => (
                <div key={i} className="skeleton" style={{ height: 370 }} />
              ))}
            </div>
          ) : data?.products.length ? (
            <>
              <div className="product-grid three">
                {data.products.map((p: Product) => (
                  <ProductCard key={p.id} p={p} favorite={favorite} />
                ))}
              </div>
              <div className="pagination">
                <button
                  disabled={data.page <= 1}
                  onClick={() => change("page", String(data.page - 1))}
                >
                  <ChevronLeft size={17} /> Anterior
                </button>
                <span>
                  Página {data.page} de {data.pages}
                </span>
                <button
                  disabled={data.page >= data.pages}
                  onClick={() => change("page", String(data.page + 1))}
                >
                  Próxima <ChevronRight size={17} />
                </button>
              </div>
            </>
          ) : (
            <div className="empty">
              <Search size={40} />
              <h2>Nenhum par por aqui.</h2>
              <p>Tente combinar outros filtros.</p>
              <Link href="/catalogo" className="btn">
                Limpar filtros
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
function Breadcrumb({ current }: { current: string }) {
  return (
    <div className="breadcrumb">
      <Link href="/">Início</Link>
      <ChevronRight size={12} />
      <span>{current}</span>
    </div>
  );
}
function ProductPage({
  slug,
  add,
  favorite,
  notify,
  initialProduct,
  cartReady,
}: {
  cartReady: boolean;
  initialProduct?: Product | null;
  slug: string;
  add: (p: Product, id: string, q?: number) => Promise<boolean>;
  favorite: (p: Product) => void;
  notify: (m: string) => void;
}) {
  const [p, setP] = useState<Product | null>(initialProduct ?? null),
    [error, setError] = useState(""),
    [size, setSize] = useState(""),
    [qty, setQty] = useState(1),
    [image, setImage] = useState(0),
    [zoom, setZoom] = useState(false),
    [guide, setGuide] = useState(false),
    [postcode, setPostcode] = useState(""),
    [shipping, setShipping] = useState<any[]>([]),
    [related, setRelated] = useState<Product[]>([]);
  const router = useRouter();
  const modalTrigger = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!zoom && !guide) return;
    const previous = modalTrigger.current;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setZoom(false);
        setGuide(false);
      }
      if (e.key === "Tab") {
        const els = document.querySelectorAll<HTMLElement>(
          ".modal button,.modal a,.modal input",
        );
        if (!els.length) return;
        const first = els[0],
          last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      previous?.focus();
    };
  }, [zoom, guide]);
  useEffect(() => {
    if (initialProduct?.slug !== slug) setP(null);
    setSize("");
    api("products/" + slug)
      .then((p) => {
        setP(p);
        api("catalog?category=" + p.category.slug).then((d) =>
          setRelated(
            d.products.filter((r: Product) => r.id !== p.id).slice(0, 4),
          ),
        );
      })
      .catch((e) => setError(e.message));
  }, [slug]);
  if (error)
    return (
      <div className="container empty">
        <h1>{error}</h1>
        <Link href="/catalogo">Voltar ao catálogo</Link>
      </div>
    );
  if (!p)
    return (
      <div className="container page">
        <div className="skeleton" style={{ height: 600 }} />
      </div>
    );
  return (
    <div className="container page">
      <Breadcrumb current={p.name} />
      <div className="product-detail">
        <div>
          <button
            className="main-image"
            aria-label="Ampliar imagem"
            onClick={(e) => {
              modalTrigger.current = e.currentTarget;
              setZoom(true);
            }}
          >
            <img src={p.images[image]?.url} alt={p.images[image]?.alt} />
            <span>
              <Plus size={16} /> Ampliar
            </span>
          </button>
          <div className="thumbs">
            {p.images.map((img, i) => (
              <button
                key={i}
                className={image === i ? "selected" : ""}
                onClick={() => setImage(i)}
                aria-label={"Imagem " + (i + 1)}
              >
                <img src={img.url} alt={img.alt} />
              </button>
            ))}
          </div>
        </div>
        <div className="product-purchase">
          <span className="eyebrow">
            {p.brand.name} / {p.ground}
          </span>
          <h1>{p.name}</h1>
          <p className="muted">
            {p.color} · Solado {p.sole}
          </p>
          <div className="detail-price">
            {p.compareAt && <del>{money(p.compareAt)}</del>}
            <strong>{money(p.price)}</strong>
            <small>
              Preço demonstrativo. Parcelamento depende do provedor no checkout.
            </small>
          </div>
          <div className="size-heading">
            <b>ESCOLHA SEU TAMANHO</b>
            <button
              className="text-button"
              onClick={(e) => {
                modalTrigger.current = e.currentTarget;
                setGuide(true);
              }}
            >
              Guia de medidas ↗
            </button>
          </div>
          <div className="sizes">
            {p.variants.map((v) => (
              <button
                key={v.id}
                disabled={!v.stock || !v.active}
                className={size === v.id ? "selected" : ""}
                onClick={() => setSize(v.id)}
                aria-label={
                  "Tamanho " +
                  v.size +
                  (!v.stock || !v.active ? " indisponível" : "")
                }
              >
                {v.size}
              </button>
            ))}
          </div>
          <div className="quantity">
            <button
              aria-label="Diminuir quantidade"
              disabled={qty === 1}
              onClick={() => setQty((q) => q - 1)}
            >
              <Minus size={15} />
            </button>
            <span>{qty}</span>
            <button
              aria-label="Aumentar quantidade"
              disabled={qty >= 10}
              onClick={() => setQty((q) => q + 1)}
            >
              <Plus size={15} />
            </button>
            <small>Quantidade</small>
          </div>
          <button
            className="btn full"
            disabled={!cartReady}
            aria-busy={!cartReady}
            onClick={() => add(p, size, qty)}
          >
            ADICIONAR AO CARRINHO <ShoppingBag size={18} />
          </button>
          <button
            className="btn secondary full"
            disabled={!cartReady}
            onClick={async () => {
              if (await add(p, size, qty)) router.push("/checkout");
            }}
          >
            COMPRAR AGORA <ArrowUpRight size={18} />
          </button>
          <div className="product-extra">
            <button className="text-button" onClick={() => favorite(p)}>
              <Heart size={17} /> Favoritar
            </button>
            <button
              className="text-button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(location.href);
                  notify("Link copiado.");
                } catch {
                  notify("Copie o endereço da barra do navegador.");
                }
              }}
            >
              <Share2 size={17} /> Compartilhar
            </button>
          </div>
          {p.demo && (
            <p className="notice">
              <ShieldCheck size={20} /> Produto fictício para testes. A compra
              real deste item está bloqueada.
            </p>
          )}
          <form
            className="shipping-form"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                if (!size)
                  throw new Error("Selecione um tamanho antes de calcular.");
                setShipping(
                  await api("shipping/quote", {
                    postcode: postcode.replace(/\D/g, ""),
                    items: [{ variantId: size, quantity: qty }],
                  }),
                );
              } catch (err) {
                notify((err as Error).message);
              }
            }}
          >
            <label htmlFor="postcode">
              Calcule a entrega <Truck size={17} />
            </label>
            <div>
              <input
                id="postcode"
                required
                placeholder="00000-000"
                value={postcode}
                onChange={(e) => setPostcode(e.target.value)}
                maxLength={9}
              />
              <button className="btn secondary">Calcular</button>
            </div>
            {shipping.map((s) => (
              <p key={s.id}>
                {s.name} — {money(s.price)} · estimativa {s.days} dias úteis
              </p>
            ))}
          </form>
        </div>
      </div>
      <div className="details-grid">
        <section>
          <h2>Feita para o seu jogo.</h2>
          <p>{p.description}</p>
          <dl>
            <dt>Material</dt>
            <dd>{p.material}</dd>
            <dt>Tipo de solado</dt>
            <dd>{p.sole}</dd>
            <dt>Indicação</dt>
            <dd>{p.ground}</dd>
          </dl>
        </section>
        <section>
          <h2>Informações que importam.</h2>
          <details>
            <summary>Trocas e devoluções</summary>
            <p>
              Consulte a política provisória, sujeita à revisão jurídica.{" "}
              <Link href="/legal/trocas">Ver política</Link>
            </p>
          </details>
          <details>
            <summary>Entrega e prazos</summary>
            <p>
              A disponibilidade depende do CEP e da configuração da
              transportadora. Nenhum prazo é prometido sem consulta real.
            </p>
          </details>
          <details>
            <summary>Avaliações de compradores</summary>
            {p.reviews?.length ? (
              p.reviews.map((r, i) => (
                <p key={i}>
                  {"★".repeat(r.rating)} {r.text} — {r.user?.name}
                </p>
              ))
            ) : (
              <p>Este produto ainda não possui avaliações verificadas.</p>
            )}
            <form
              className="review-form"
              onSubmit={async (e) => {
                e.preventDefault();
                const f = e.currentTarget;
                const d = Object.fromEntries(new FormData(f));
                try {
                  await api("reviews", {
                    productId: p.id,
                    rating: Number(d.rating),
                    text: d.text,
                  });
                  notify("Avaliação enviada para moderação.");
                  f.reset();
                } catch (err) {
                  notify((err as Error).message);
                }
              }}
            >
              <label>
                Sua nota
                <select name="rating">
                  {[5, 4, 3, 2, 1].map((n) => (
                    <option key={n} value={n}>
                      {n} estrelas
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Conte sua experiência
                <textarea
                  name="text"
                  required
                  minLength={10}
                  maxLength={1500}
                />
              </label>
              <button className="btn btn-small">Enviar avaliação</button>
              <p>Somente para compradores com pedido entregue.</p>
            </form>
          </details>
        </section>
      </div>
      {related.length > 0 && (
        <section className="section">
          <SectionTitle
            eyebrow="OUTRAS POSSIBILIDADES"
            title="No mesmo ritmo."
          />
          <div className="product-grid">
            {related.map((r) => (
              <ProductCard key={r.id} p={r} favorite={favorite} />
            ))}
          </div>
        </section>
      )}
      {zoom && (
        <div
          className="modal"
          role="dialog"
          aria-modal="true"
          aria-label="Imagem ampliada"
          onClick={() => setZoom(false)}
        >
          <button
            autoFocus
            className="modal-close"
            aria-label="Fechar ampliação"
            onClick={() => setZoom(false)}
          >
            <X />
          </button>
          <img src={p.images[image]?.url} alt={p.images[image]?.alt} />
        </div>
      )}
      {guide && (
        <div
          className="modal"
          role="dialog"
          aria-modal="true"
          aria-label="Guia de medidas"
        >
          <div className="modal-panel">
            <button
              autoFocus
              className="icon"
              aria-label="Fechar guia"
              onClick={() => setGuide(false)}
            >
              <X />
            </button>
            <h2>Seu ajuste ideal.</h2>
            <p>
              Guia ilustrativo. Antes da venda, substitua pela tabela oficial de
              cada fabricante.
            </p>
            <table>
              <thead>
                <tr>
                  <th>BR</th>
                  <th>Comprimento aproximado</th>
                </tr>
              </thead>
              <tbody>
                {[36, 37, 38, 39, 40, 41, 42, 43, 44].map((s) => (
                  <tr key={s}>
                    <td>{s}</td>
                    <td>{(24 + (s - 36) * 0.65).toFixed(1)} cm</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
function CartPage({
  cart,
  update,
  ready,
  checkout,
  me,
  notify,
}: {
  cart: Item[];
  update: (i: Item[]) => Promise<void>;
  ready: boolean;
  checkout: boolean;
  me: any;
  notify: (m: string) => void;
}) {
  const quoteRevision = useRef(0);
  const [quoting, setQuoting] = useState(false);
  const [unavailable, setUnavailable] = useState<any[]>([]);
  const [quote, setQuote] = useState<any>(null),
    [coupon, setCoupon] = useState(""),
    [applied, setApplied] = useState(""),
    [postcode, setPostcode] = useState(""),
    [shipping, setShipping] = useState<any[]>([]),
    [shippingId, setShippingId] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const refresh = useCallback(async () => {
    const revision = ++quoteRevision.current;
    if (!cart.length) {
      setQuote(null);
      setQuoting(false);
      return;
    }
    setQuoting(true);
    try {
      const result = await api("cart/quote", {
        items: cart,
        coupon: applied || undefined,
      });
      if (revision !== quoteRevision.current) return;
      setQuote(result);
      setError("");
      setUnavailable([]);
    } catch (e) {
      if (revision !== quoteRevision.current) return;
      setError((e as Error).message);
      setQuote(null);
      setUnavailable(e instanceof ApiError ? e.payload.unavailable || [] : []);
    } finally {
      if (revision === quoteRevision.current) setQuoting(false);
    }
  }, [cart, applied]);
  useEffect(() => {
    refresh();
    setShipping([]);
    setShippingId("");
    return () => {
      quoteRevision.current++;
    };
  }, [refresh]);
  const selected = shipping.find((s) => s.id === shippingId);
  const total = (quote?.total || 0) + (selected?.price || 0);
  if (!ready)
    return <div className="container page skeleton" style={{ height: 400 }} />;
  if (!cart.length)
    return (
      <div className="container empty">
        <ShoppingBag size={46} />
        <h1>Seu próximo jogo começa aqui.</h1>
        <p>Seu carrinho ainda está vazio.</p>
        <Link className="btn" href="/catalogo">
          EXPLORAR CHUTEIRAS <ArrowUpRight size={19} />
        </Link>
      </div>
    );
  return (
    <div className="container page">
      <Breadcrumb current={checkout ? "Finalizar compra" : "Carrinho"} />
      <div className="page-intro">
        <span className="eyebrow">
          {checkout
            ? "ÚLTIMO PASSO ANTES DO PRÓXIMO NÍVEL"
            : "ESCOLHAS DO SEU JOGO"}
        </span>
        <h1>{checkout ? "Finalize sua compra." : "Seu carrinho."}</h1>
      </div>
      <div className="checkout-layout">
        <div>
          {error && (
            <section className="panel" aria-label="Itens indisponíveis">
              <p className="notice error" role="alert">
                {error}
              </p>
              {unavailable.map((item) => (
                <div className="unavailable-item" key={item.variantId}>
                  <div>
                    <b>{item.name}</b>
                    <p>
                      {item.size ? "Tamanho " + item.size + " · " : ""}
                      {item.availableStock
                        ? "Disponível: " + item.availableStock + " unidade(s)."
                        : "Esta opção não está mais disponível."}
                    </p>
                  </div>
                  <div>
                    {item.availableStock > 0 && (
                      <button
                        className="btn secondary btn-small"
                        onClick={() =>
                          update(
                            cart.map((i) =>
                              i.variantId === item.variantId
                                ? {
                                    ...i,
                                    quantity: Math.min(10, item.availableStock),
                                  }
                                : i,
                            ),
                          )
                        }
                      >
                        Ajustar quantidade
                      </button>
                    )}
                    <button
                      className="text-button"
                      aria-label={"Remover " + item.name}
                      onClick={() =>
                        update(
                          cart.filter((i) => i.variantId !== item.variantId),
                        )
                      }
                    >
                      <Trash2 size={14} /> Remover item
                    </button>
                  </div>
                </div>
              ))}
              {!unavailable.length && (
                <button
                  className="btn secondary btn-small"
                  onClick={() => update([])}
                >
                  Esvaziar carrinho
                </button>
              )}
              <Link className="text-button" href="/catalogo">
                Continuar no catálogo ↗
              </Link>
            </section>
          )}
          {quote?.lines.map((l: any) => (
            <div className="cart-row" key={l.variantId}>
              <Link href={"/produto/" + l.variant.product.slug}>
                <img
                  src={l.variant.product.images[0]?.url}
                  alt={l.variant.product.name}
                />
              </Link>
              <div>
                <Link href={"/produto/" + l.variant.product.slug}>
                  <h3>{l.variant.product.name}</h3>
                </Link>
                <p>
                  Tamanho {l.variant.size} · {l.variant.product.color}
                </p>
                <small>Preço unitário: {money(l.price)}</small>
                <div className="quantity">
                  <button
                    aria-label={"Diminuir " + l.variant.product.name}
                    disabled={l.quantity <= 1}
                    onClick={() =>
                      update(
                        cart.map((i) =>
                          i.variantId === l.variantId
                            ? { ...i, quantity: i.quantity - 1 }
                            : i,
                        ),
                      )
                    }
                  >
                    <Minus size={14} />
                  </button>
                  <span>{l.quantity}</span>
                  <button
                    aria-label={"Aumentar " + l.variant.product.name}
                    disabled={l.quantity >= Math.min(10, l.variant.stock)}
                    onClick={() =>
                      update(
                        cart.map((i) =>
                          i.variantId === l.variantId
                            ? { ...i, quantity: i.quantity + 1 }
                            : i,
                        ),
                      )
                    }
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>
              <div>
                <strong>{money(l.price * l.quantity)}</strong>
                <button
                  className="text-button"
                  aria-label={"Remover " + l.variant.product.name}
                  onClick={() =>
                    update(cart.filter((i) => i.variantId !== l.variantId))
                  }
                >
                  <Trash2 size={16} /> Remover
                </button>
              </div>
            </div>
          ))}
          {checkout && (
            <form
              id="checkout-form"
              className="panel form-grid"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!selected) {
                  notify("Consulte e selecione uma opção de entrega.");
                  return;
                }
                setBusy(true);
                try {
                  const d = Object.fromEntries(new FormData(e.currentTarget));
                  const stored =
                    sessionStorage.getItem("elite-checkout-key") ||
                    crypto.randomUUID();
                  sessionStorage.setItem("elite-checkout-key", stored);
                  const result = await api("checkout", {
                    items: cart,
                    coupon: applied || undefined,
                    shippingId,
                    email: d.email,
                    name: d.name,
                    phone: String(d.phone).replace(/\D/g, ""),
                    address: {
                      postcode: postcode.replace(/\D/g, ""),
                      street: d.street,
                      number: d.number,
                      complement: d.complement,
                      district: d.district,
                      city: d.city,
                      state: d.state,
                    },
                    idempotencyKey: stored,
                  });
                  sessionStorage.setItem("elite-last-order", result.id);
                  if (result.checkoutUrl) location.assign(result.checkoutUrl);
                  else
                    location.assign(
                      "/pedido/" +
                        result.id +
                        "?access=" +
                        encodeURIComponent(result.access || ""),
                    );
                } catch (err) {
                  notify((err as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <h2 className="span-two">Seus dados</h2>
              <label className="span-two">
                Nome completo
                <input
                  required
                  name="name"
                  autoComplete="name"
                  defaultValue={me?.name}
                  minLength={3}
                />
              </label>
              <label>
                E-mail
                <input
                  required
                  name="email"
                  type="email"
                  autoComplete="email"
                  defaultValue={me?.email}
                />
              </label>
              <label>
                Telefone
                <input
                  required
                  name="phone"
                  autoComplete="tel"
                  minLength={10}
                />
              </label>
              <h2 className="span-two">Endereço de entrega</h2>
              <label>
                CEP
                <input
                  required
                  value={postcode}
                  onChange={(e) => {
                    setPostcode(e.target.value);
                    setShipping([]);
                    setShippingId("");
                  }}
                  maxLength={9}
                />
              </label>
              <label>
                Estado
                <select name="state" required>
                  <option value="">Selecione</option>
                  {"AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO"
                    .split(" ")
                    .map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                </select>
              </label>
              <label className="span-two">
                Endereço
                <input
                  required
                  name="street"
                  autoComplete="street-address"
                  minLength={3}
                />
              </label>
              <label>
                Número
                <input required name="number" />
              </label>
              <label>
                Complemento
                <input name="complement" />
              </label>
              <label>
                Bairro
                <input required name="district" minLength={2} />
              </label>
              <label>
                Cidade
                <input
                  required
                  name="city"
                  autoComplete="address-level2"
                  minLength={2}
                />
              </label>
              <label className="span-two check-label">
                <input type="checkbox" required /> Li os{" "}
                <Link href="/legal/termos">termos</Link> e a{" "}
                <Link href="/legal/privacidade">política de privacidade</Link>.
              </label>
              <p className="span-two muted">
                <LockKeyhole size={14} /> Cartão e PIX serão processados no
                checkout hospedado do provedor. Não coletamos dados de cartão.
              </p>
            </form>
          )}
        </div>
        <aside className="panel order-summary">
          <h2>Resumo do pedido</h2>
          {quoting && (
            <p role="status" className="muted">
              Atualizando preços e disponibilidade…
            </p>
          )}
          <div>
            <span>Subtotal</span>
            <b>{money(quote?.subtotal || 0)}</b>
          </div>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await api("cart/quote", { items: cart, coupon });
                setApplied(coupon.toUpperCase());
                notify("Cupom aplicado.");
              } catch (err) {
                notify((err as Error).message);
              }
            }}
          >
            <label htmlFor="coupon">Tem um cupom?</label>
            <div className="inline-form">
              <input
                aria-label="Código do cupom"
                id="coupon"
                placeholder="Código do cupom"
                value={coupon}
                onChange={(e) => setCoupon(e.target.value.toUpperCase())}
              />
              <button className="btn secondary btn-small">Aplicar</button>
            </div>
          </form>
          {applied && (
            <div>
              <span>
                {applied}{" "}
                <button className="text-button" onClick={() => setApplied("")}>
                  remover
                </button>
              </span>
              <b>−{money(quote?.discount || 0)}</b>
            </div>
          )}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                const options = await api("shipping/quote", {
                  postcode: postcode.replace(/\D/g, ""),
                  items: cart,
                  coupon: applied || undefined,
                });
                setShipping(options);
                if (!options.length)
                  notify("Nenhum serviço disponível para este CEP.");
              } catch (err) {
                notify((err as Error).message);
              }
            }}
          >
            <label htmlFor="cart-postcode">Entrega</label>
            <div className="inline-form">
              <input
                required
                id="cart-postcode"
                placeholder="Seu CEP"
                maxLength={9}
                value={postcode}
                onChange={(e) => {
                  setPostcode(e.target.value);
                  setShipping([]);
                  setShippingId("");
                }}
              />
              <button className="btn secondary btn-small">Calcular</button>
            </div>
            {shipping.map((s) => (
              <label className="shipping-option" key={s.id}>
                <input
                  type="radio"
                  name="shipping"
                  value={s.id}
                  checked={shippingId === s.id}
                  onChange={() => setShippingId(s.id)}
                />
                <span>
                  {s.name}
                  <small>{s.days} dias úteis estimados</small>
                </span>
                <b>{money(s.price)}</b>
              </label>
            ))}
          </form>
          <div>
            <span>Frete</span>
            <b>{selected ? money(selected.price) : "A calcular"}</b>
          </div>
          <div className="summary-total">
            <span>Total</span>
            <strong>{money(total)}</strong>
          </div>
          {checkout ? (
            <button
              className="btn full"
              type="submit"
              form="checkout-form"
              disabled={busy || !quote || quoting}
            >
              {busy ? "Processando…" : "IR PARA PAGAMENTO"}{" "}
              <LockKeyhole size={17} />
            </button>
          ) : (
            <Link className="btn full" href="/checkout">
              FINALIZAR COMPRA <ArrowUpRight size={18} />
            </Link>
          )}
          <p className="muted">
            Ambiente demonstrativo. Pagamentos reais bloqueados até a
            configuração comercial.
          </p>
          <Link className="text-button" href="/catalogo">
            Continuar comprando <ArrowRight size={15} />
          </Link>
        </aside>
      </div>
    </div>
  );
}
function Account({
  me,
  setMe,
  notify,
  logout,
}: {
  me: any;
  setMe: (m: any) => void;
  notify: (m: string) => void;
  logout: () => void;
}) {
  const [mode, setMode] = useState("login"),
    [busy, setBusy] = useState(false),
    [orders, setOrders] = useState<any[]>([]),
    [addresses, setAddresses] = useState<any[]>([]),
    [mfa, setMfa] = useState<any>(null),
    [qr, setQr] = useState("");
  const params = useSearchParams();
  useEffect(() => {
    if (me) {
      api("orders")
        .then(setOrders)
        .catch(() => {});
      api("account/addresses")
        .then(setAddresses)
        .catch(() => {});
    }
  }, [me]);
  const action = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    try {
      const d = Object.fromEntries(new FormData(e.currentTarget));
      const route = params.has("reset")
        ? "reset"
        : params.has("verify")
          ? "verify"
          : mode;
      const r = await api("auth/" + route, {
        ...d,
        token: params.get("reset") || params.get("verify") || undefined,
      });
      if (route === "login") setMe(r);
      else notify(r.message);
    } catch (err) {
      notify((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!me || params.has("reset") || params.has("verify"))
    return (
      <div className="container page auth-layout">
        <div className="auth-art">
          <span className="eyebrow">SEU JOGO TEM UM LUGAR.</span>
          <h1>
            BEM-VINDO
            <br />
            AO SEU
            <br />
            <em>PRÓXIMO NÍVEL.</em>
          </h1>
          <img src="/images/boot-0.svg" alt="Ilustração de chuteira" />
        </div>
        <form className="panel auth-form" onSubmit={action}>
          <span className="eyebrow">JN CHUTEIRAS CLUB</span>
          <h2>
            {params.has("reset")
              ? "Nova senha"
              : params.has("verify")
                ? "Verificar e-mail"
                : mode === "register"
                  ? "Entre para o time."
                  : mode === "forgot"
                    ? "Recupere seu acesso."
                    : "Bom ter você de volta."}
          </h2>
          {!params.has("verify") && (
            <>
              {mode === "register" && (
                <label>
                  Nome completo
                  <input
                    required
                    name="name"
                    autoComplete="name"
                    minLength={3}
                  />
                </label>
              )}
              {!params.has("reset") && (
                <label>
                  E-mail
                  <input
                    required
                    type="email"
                    name="email"
                    autoComplete="email"
                  />
                </label>
              )}
              {mode !== "forgot" && (
                <label>
                  Senha
                  <input
                    required
                    aria-label="Senha"
                    name="password"
                    type="password"
                    autoComplete={
                      mode === "register" ? "new-password" : "current-password"
                    }
                    minLength={
                      mode === "register" || params.has("reset") ? 12 : 1
                    }
                    maxLength={72}
                  />
                  <small>
                    {mode === "register" ? "Mínimo de 12 caracteres." : ""}
                  </small>
                </label>
              )}
              {mode === "login" && !params.has("reset") && (
                <label>
                  Código MFA (administradores)
                  <input
                    name="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                  />
                </label>
              )}
            </>
          )}
          <button className="btn full" disabled={busy}>
            {busy
              ? "Aguarde…"
              : params.has("verify")
                ? "CONFIRMAR E-MAIL"
                : params.has("reset")
                  ? "SALVAR NOVA SENHA"
                  : mode === "register"
                    ? "CRIAR MINHA CONTA"
                    : mode === "forgot"
                      ? "ENVIAR INSTRUÇÕES"
                      : "ENTRAR"}{" "}
            <ArrowUpRight size={18} />
          </button>
          {!params.has("verify") && !params.has("reset") && (
            <>
              <button
                type="button"
                className="text-button"
                onClick={() => setMode(mode === "login" ? "register" : "login")}
              >
                {mode === "login"
                  ? "Ainda não tem conta? Cadastre-se"
                  : "Já tenho conta"}
              </button>
              <button
                type="button"
                className="text-button"
                onClick={() => setMode("forgot")}
              >
                Esqueci minha senha
              </button>
            </>
          )}
          <p className="muted">
            Seus dados são tratados conforme nossa{" "}
            <Link href="/legal/privacidade">política de privacidade</Link>. O
            envio de e-mail requer SMTP configurado.
          </p>
        </form>
      </div>
    );
  return (
    <div className="container page">
      <div className="section-heading">
        <div>
          <span className="eyebrow">SEU ESPAÇO NO TIME</span>
          <h1>Olá, {me.name.split(" ")[0]}.</h1>
        </div>
        <button className="text-button" onClick={logout}>
          <LogOut size={16} /> Sair
        </button>
      </div>
      {!me.verified && (
        <p className="notice">
          Confirme seu e-mail pelo link enviado ao cadastrar. O envio depende da
          configuração SMTP.
        </p>
      )}
      <div className="account-grid">
        <section className="panel">
          <h2>Meus dados</h2>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                setMe(
                  await api(
                    "account",
                    { name: new FormData(e.currentTarget).get("name") },
                    "PATCH",
                  ),
                );
                notify("Dados atualizados.");
              } catch (err) {
                notify((err as Error).message);
              }
            }}
          >
            <label>
              Nome
              <input
                name="name"
                defaultValue={me.name}
                required
                minLength={3}
              />
            </label>
            <label>
              E-mail
              <input value={me.email} disabled />
            </label>
            <button className="btn btn-small">Salvar dados</button>
          </form>
          <Link className="text-button" href="/favoritos">
            <Heart size={16} /> Meus favoritos
          </Link>
          <a className="text-button" href="/api/account/export">
            Exportar meus dados LGPD <ArrowUpRight size={16} />
          </a>
          <details>
            <summary>Excluir minha conta</summary>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  notify(
                    (
                      await api(
                        "account",
                        {
                          password: new FormData(e.currentTarget).get(
                            "password",
                          ),
                        },
                        "DELETE",
                      )
                    ).message,
                  );
                  setMe(null);
                } catch (err) {
                  notify((err as Error).message);
                }
              }}
            >
              <p>
                Dados pessoais da conta serão anonimizados. Pedidos e documentos
                fiscais podem ter retenção legal.
              </p>
              <label>
                Confirme sua senha
                <input type="password" required name="password" />
              </label>
              <button className="btn danger">Solicitar exclusão</button>
            </form>
          </details>
        </section>
        <section className="panel">
          <h2>Meus pedidos</h2>
          {orders.length ? (
            orders.map((o) => (
              <Link className="order-link" key={o.id} href={"/pedido/" + o.id}>
                <Package />
                <span>
                  Pedido {o.id.slice(-8).toUpperCase()}
                  <small>
                    {new Date(o.createdAt).toLocaleDateString("pt-BR")} ·{" "}
                    {statusLabel[o.status]}
                  </small>
                </span>
                <b>{money(o.total)}</b>
                <ChevronRight size={16} />
              </Link>
            ))
          ) : (
            <div className="empty small">
              <Package size={32} />
              <p>Seu histórico começa com a primeira compra.</p>
              <Link href="/catalogo">Explorar a coleção ↗</Link>
            </div>
          )}
        </section>
      </div>
      <section className="panel">
        <h2>Endereços salvos</h2>
        <div className="address-list">
          {addresses.map((a) => (
            <div key={a.id}>
              {a.street}, {a.number}
              <p>
                {a.city} / {a.state} — {a.postcode}
              </p>
              <button
                className="text-button"
                onClick={async () => {
                  await api("account/addresses", { id: a.id }, "DELETE");
                  setAddresses(addresses.filter((v) => v.id !== a.id));
                }}
              >
                Excluir
              </button>
            </div>
          ))}
        </div>
        <details>
          <summary>Adicionar endereço</summary>
          <form
            className="form-grid"
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget;
              try {
                const a = await api(
                  "account/addresses",
                  Object.fromEntries(new FormData(form)),
                );
                setAddresses([...addresses, a]);
                form.reset();
                notify("Endereço salvo.");
              } catch (err) {
                notify((err as Error).message);
              }
            }}
          >
            {[
              ["postcode", "CEP (8 dígitos)"],
              ["street", "Rua"],
              ["number", "Número"],
              ["complement", "Complemento"],
              ["district", "Bairro"],
              ["city", "Cidade"],
              ["state", "Estado (UF)"],
            ].map(([n, l]) => (
              <label key={n}>
                {l}
                <input name={n} required={n !== "complement"} />
              </label>
            ))}
            <button className="btn">Salvar endereço</button>
          </form>
        </details>
      </section>
      {me.role !== "CUSTOMER" && (
        <section className="panel">
          <h2>Segurança administrativa</h2>
          {me.mfaEnabled ? (
            <Link className="btn" href="/admin">
              Abrir painel <ArrowUpRight size={18} />
            </Link>
          ) : (
            <>
              <p>
                Ative MFA para acessar o painel. Guarde a chave no seu
                aplicativo autenticador em local seguro.
              </p>
              <button
                className="btn"
                onClick={async () => {
                  try {
                    const m = await api("auth/mfa/setup", {});
                    setMfa(m);
                    const QR = await import("qrcode");
                    setQr(await QR.toDataURL(m.uri));
                  } catch (e) {
                    notify((e as Error).message);
                  }
                }}
              >
                Configurar autenticador
              </button>
              {mfa && (
                <>
                  <img
                    className="qr"
                    src={qr}
                    alt="QR code de configuração MFA"
                  />
                  <code className="mfa-key">{mfa.secret}</code>
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      try {
                        notify(
                          (
                            await api("auth/mfa/enable", {
                              code: new FormData(e.currentTarget).get("code"),
                            })
                          ).message,
                        );
                        setMe(null);
                      } catch (err) {
                        notify((err as Error).message);
                      }
                    }}
                  >
                    <label>
                      Código de 6 dígitos
                      <input required name="code" pattern="[0-9]{6}" />
                    </label>
                    <button className="btn">Ativar MFA</button>
                  </form>
                </>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}
export const statusLabel: Record<string, string> = {
  PENDING: "Aguardando pagamento",
  PAID: "Pagamento aprovado",
  PREPARING: "Em preparação",
  SHIPPED: "Enviado",
  IN_TRANSIT: "Em transporte",
  DELIVERED: "Entregue",
  CANCELLED: "Cancelado",
  REFUNDING: "Devolução/reembolso em andamento",
};
function OrderPage({
  id,
  notify,
}: {
  id: string;
  notify: (m: string) => void;
}) {
  const params = useSearchParams();
  const [order, setOrder] = useState<any>(null),
    [error, setError] = useState("");
  const access = params.get("access");
  useEffect(() => {
    api("orders/" + id + "?access=" + (access || ""))
      .then(setOrder)
      .catch((e) => setError(e.message));
  }, [id, access]);
  if (error)
    return (
      <div className="container empty">
        <h1>{error}</h1>
        <Link href="/conta">Entrar na conta</Link>
      </div>
    );
  if (!order) return <div className="container page">Carregando pedido…</div>;
  return (
    <div className="container page">
      <Breadcrumb current="Meu pedido" />
      <h1>Pedido #{id.slice(-8).toUpperCase()}</h1>
      <p className="status">{statusLabel[order.status]}</p>
      <p className="notice">
        O retorno do navegador não confirma o pagamento. O status acima vem
        exclusivamente do servidor.
      </p>
      <div className="account-grid">
        <section className="panel">
          <h2>Itens</h2>
          {order.items.map((i: any) => (
            <p key={i.id}>
              {i.quantity}× {i.name} · tamanho {i.size}{" "}
              <b>{money(i.price * i.quantity)}</b>
            </p>
          ))}
          <hr />
          <strong>Total: {money(order.total)}</strong>
          {order.shipment && (
            <>
              <h3>Rastreio</h3>
              <p>
                {order.shipment.carrier} — {order.shipment.trackingCode}
              </p>
              {order.shipment.trackingUrl && (
                <a
                  href={order.shipment.trackingUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  Acompanhar entrega ↗
                </a>
              )}
            </>
          )}
        </section>
        <section className="panel">
          <h2>Acompanhe cada etapa</h2>
          {order.events.map((e: any) => (
            <div className="timeline" key={e.id}>
              <Check size={16} />
              <div>
                <b>{statusLabel[e.status]}</b>
                <small>{new Date(e.createdAt).toLocaleString("pt-BR")}</small>
                <p>{e.note}</p>
              </div>
            </div>
          ))}
        </section>
      </div>
      <section className="panel">
        <h2>Troca, devolução ou cancelamento</h2>
        {["PAID", "PREPARING", "SHIPPED", "IN_TRANSIT", "DELIVERED"].includes(
          order.status,
        ) && !order.returns.some((r: any) => r.status !== "rejected") ? (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                const created = await api(
                  "orders/" + id + "/returns?access=" + (access || ""),
                  {
                    reason: new FormData(e.currentTarget).get("reason"),
                  },
                );
                setOrder({ ...order, returns: [...order.returns, created] });
                notify("Solicitação registrada para análise da equipe.");
              } catch (err) {
                notify((err as Error).message);
              }
            }}
          >
            <label>
              Conte o que aconteceu
              <textarea
                required
                minLength={10}
                maxLength={2000}
                name="reason"
              />
            </label>
            <button className="btn">Enviar solicitação</button>
          </form>
        ) : (
          <p>
            Acompanhe a solicitação existente abaixo. Novas solicitações
            dependem da situação do pedido e da análise anterior.
          </p>
        )}
        {order.returns.map((r: any) => (
          <p key={r.id}>
            Solicitação: {r.reason} —{" "}
            {(
              {
                requested: "Em análise",
                approved: "Aprovada",
                rejected: "Não aprovada",
                received: "Produto recebido",
                refunded: "Reembolso confirmado",
              } as Record<string, string>
            )[r.status] || r.status}
            {r.decisionNote && (
              <span> · Observação da equipe: {r.decisionNote}</span>
            )}
          </p>
        ))}
      </section>
    </div>
  );
}
function Favorites({
  favorite,
  notify,
}: {
  favorite: (p: Product) => void;
  notify: (m: string) => void;
}) {
  const [data, setData] = useState<any[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    api("favorites")
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  return (
    <div className="container page">
      <Breadcrumb current="Favoritos" />
      <div className="page-intro">
        <h1>Seu time dos sonhos.</h1>
        <p>Os pares que você quer levar para o jogo.</p>
      </div>
      {error ? (
        <div className="empty">
          <p>{error}</p>
          <Link className="btn" href="/conta">
            Entrar na conta
          </Link>
        </div>
      ) : data.length ? (
        <div className="product-grid">
          {data.map((v) => (
            <div key={v.productId}>
              <ProductCard p={v.product} favorite={favorite} />
              <button
                className="text-button"
                onClick={async () => {
                  try {
                    await api(
                      "favorites",
                      { productId: v.productId },
                      "DELETE",
                    );
                    setData(data.filter((d) => d.productId !== v.productId));
                  } catch (e) {
                    notify((e as Error).message);
                  }
                }}
              >
                <Trash2 size={14} /> Remover favorito
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty">
          <Heart size={38} />
          <h2>Ainda nenhum favorito.</h2>
          <Link href="/catalogo" className="btn">
            Encontre seu par
          </Link>
        </div>
      )}
    </div>
  );
}
function Contact({
  config,
  notify,
}: {
  config: any;
  notify: (m: string) => void;
}) {
  return (
    <div className="container page">
      <Breadcrumb current="Central de ajuda" />
      <div className="page-intro">
        <span className="eyebrow">ESTAMOS NO SEU TIME</span>
        <h1>Uma assistência para você.</h1>
        <p>Como podemos ajudar no seu próximo lance?</p>
      </div>
      <div className="account-grid">
        <section className="panel">
          <h2>Fale com a JN Chuteiras</h2>
          <p>{config.hours}</p>
          {config.email ? (
            <a href={"mailto:" + config.email}>{config.email}</a>
          ) : (
            <p>E-mail comercial pendente de configuração.</p>
          )}
          {config.whatsapp ? (
            <a className="btn" href={"https://wa.me/" + config.whatsapp}>
              WhatsApp <MessageCircle size={18} />
            </a>
          ) : (
            <p>WhatsApp comercial ainda não informado.</p>
          )}
          {[
            ["instagram", "Instagram"],
            ["facebook", "Facebook"],
            ["youtube", "YouTube"],
          ]
            .filter(([key]) => config[key])
            .map(([key, label]) => (
              <p key={key}>
                <a href={config[key]} target="_blank" rel="noopener noreferrer">
                  {label} ↗
                </a>
              </p>
            ))}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget;
              try {
                notify(
                  (await api("contact", Object.fromEntries(new FormData(form))))
                    .message,
                );
                form.reset();
              } catch (err) {
                notify((err as Error).message);
              }
            }}
          >
            <label>
              Nome
              <input required name="name" minLength={3} />
            </label>
            <label>
              E-mail
              <input required type="email" name="email" />
            </label>
            <label>
              Sua mensagem
              <textarea
                required
                name="message"
                minLength={10}
                maxLength={2000}
              />
            </label>
            <button className="btn">
              Enviar mensagem <ArrowUpRight size={18} />
            </button>
          </form>
        </section>
        <section>
          <h2>Dúvidas de quem vive o jogo.</h2>
          {[
            [
              "Qual chuteira usar?",
              "FG para gramado natural; TF/AG para gramado sintético, conforme indicação do fabricante; IC para quadras indoor. Confira as especificações reais antes de comprar.",
            ],
            [
              "A loja já está vendendo?",
              "Este ambiente utiliza produtos fictícios. Vendas reais ficam bloqueadas até a configuração comercial, pagamentos, frete, e-mail e revisão jurídica.",
            ],
            [
              "Quais são os meios de pagamento?",
              "A integração usa checkout hospedado Mercado Pago. Métodos, aprovação e parcelamento dependem da conta do lojista e da elegibilidade informada pelo provedor.",
            ],
            [
              "Qual o prazo de entrega?",
              "O prazo será consultado pelo CEP na integração com a transportadora. Não exibimos prazos ou frete grátis sem configuração real.",
            ],
            [
              "Como pedir troca ou devolução?",
              "Acesse seu pedido e registre uma solicitação com o motivo. A equipe analisará conforme a legislação e a política publicada.",
            ],
          ].map(([q, a]) => (
            <details key={q}>
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </section>
      </div>
    </div>
  );
}
function Legal({ page, config }: { page: string; config: any }) {
  const text: Record<string, string[]> = {
    privacidade: [
      "Coletamos dados necessários para cadastro, autenticação, atendimento e execução de pedidos. Dados de cartão e CVV não são coletados pela loja.",
      "As finalidades, bases legais, operadores, transferências internacionais e prazos de retenção precisam ser confirmados pelo controlador antes do lançamento.",
      "Você pode exportar dados pela sua conta e solicitar anonimização. Registros fiscais e pedidos podem ser retidos por obrigação legal. O canal oficial do encarregado deve ser configurado pela empresa.",
    ],
    cookies: [
      "Cookies essenciais mantêm sessões e carrinhos. Não há analytics ou publicidade ativados nesta versão.",
      "Preferências de tema e consentimento são armazenadas no navegador. Cookies opcionais exigirão consentimento específico antes de qualquer integração futura.",
    ],
    termos: [
      "Este ambiente é demonstrativo. Produtos, preços, imagens e estoque fictícios não constituem oferta comercial.",
      "Na operação comercial, disponibilidade e preços serão revalidados pelo servidor. Pagamentos dependerão da aprovação do provedor e confirmação pelo backend.",
    ],
    entrega: [
      "As opções de envio, custos e prazos serão consultados pelo CEP. A origem, dimensões e regras comerciais precisam ser conferidas antes da operação.",
      "Frete grátis só poderá ser divulgado quando a regra estiver ativa e o endereço estiver elegível.",
    ],
    trocas: [
      "O consumidor pode exercer o direito de arrependimento nas condições e prazos previstos na legislação brasileira, inclusive o prazo legal de sete dias para compras à distância, quando aplicável.",
      "Registre a solicitação no pedido ou no canal de atendimento. O procedimento logístico, a análise de vícios e as condições de troca comercial deverão ser definidos e revisados antes da publicação.",
    ],
    reembolso: [
      "Reembolsos exigem validação da solicitação e processamento pelo meio de pagamento original, respeitando a legislação e as regras do provedor.",
      "Prazos bancários, conciliação e devoluções de estoque precisam ser confirmados pela operação. Nenhuma solicitação é automaticamente considerada reembolsada.",
    ],
    empresa: [
      `Razão social: ${config.company || "PENDENTE"}`,
      `CNPJ: ${config.cnpj || "PENDENTE"}`,
      `Endereço: ${config.address || "PENDENTE"}`,
      `Atendimento: ${config.email || "PENDENTE"}`,
    ],
    direitos: [
      "Informações claras, proteção de dados e atendimento acessível são direitos do consumidor.",
      "Antes do lançamento, disponibilize os dados obrigatórios do fornecedor e procedimentos para arrependimento, garantia, troca e reembolso. Esta minuta não substitui assessoria jurídica.",
    ],
  };
  return (
    <article className="container page legal">
      <Breadcrumb current={legalTitles[page] || "Informações legais"} />
      <h1>{legalTitles[page] || "Informações legais"}</h1>
      <div className="notice">
        <ShieldCheck /> TEXTO PROVISÓRIO — revisão jurídica obrigatória antes da
        publicação comercial.
      </div>
      {(text[page] || []).map((t, i) => (
        <p key={i}>{t}</p>
      ))}
      <Link href="/contato" className="btn secondary">
        Falar com a loja <ArrowUpRight size={17} />
      </Link>
    </article>
  );
}

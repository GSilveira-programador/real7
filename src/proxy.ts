import { NextResponse, type NextRequest } from "next/server";
export function proxy(req: NextRequest) {
  const production = process.env.NODE_ENV === "production";
  if (
    production &&
    new URL(process.env.APP_URL || "http://localhost:3000").protocol !==
      "https:"
  )
    return new NextResponse("Configure APP_URL HTTPS para produção.", {
      status: 503,
    });
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = `default-src 'self'; script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${production ? "" : "'unsafe-eval'"}; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' ${production ? "" : "ws: http:"}; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`;
  const headers = new Headers(req.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("Content-Security-Policy", csp);
  const sensitive =
    /^\/(newsletter|conta|admin|pedido|carrinho|checkout|favoritos)(\/|$)/.test(
      req.nextUrl.pathname,
    );
  if (sensitive || req.nextUrl.pathname.startsWith("/api/")) {
    res.headers.set("Cache-Control", "private, no-store");
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  if (sensitive) res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|images/).*)"],
};

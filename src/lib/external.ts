import { fetch, EnvHttpProxyAgent } from "undici";
const dispatcher = process.env.HTTPS_PROXY
  ? new EnvHttpProxyAgent()
  : undefined;
export async function externalFetch(
  url: string,
  options: Parameters<typeof fetch>[1] = {},
) {
  return fetch(url, { ...options, ...(dispatcher ? { dispatcher } : {}) });
}

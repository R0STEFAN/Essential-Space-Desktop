import { fetch as tauriFetch } from '@tauri-apps/plugin-http';

/**
 * Native Direct Fetcher for Nothing Cloud API.
 * Uses Tauri v2 native sockets via @tauri-apps/plugin-http to bypass CORS entirely.
 * Falls back to standard fetch in web environment.
 */
export async function nothingFetch(
  targetUrl: string,
  options: RequestInit & { maxRedirections?: number } = {}
): Promise<Response> {
  const isTauri =
    typeof window !== 'undefined' &&
    ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);

  if (isTauri) {
    try {
      const fetchOpts = { ...options };
      // When redirect: 'manual' is requested, pass maxRedirections: 0 to ensure Tauri's reqwest client
      // does not follow redirects automatically, allowing the caller to inspect 302 Location headers
      if (fetchOpts.redirect === 'manual' && fetchOpts.maxRedirections === undefined) {
        fetchOpts.maxRedirections = 0;
      }
      return await tauriFetch(targetUrl, fetchOpts as any);
    } catch (tauriErr) {
      console.error(`Tauri native fetch error for [${targetUrl}]:`, tauriErr);
      throw tauriErr;
    }
  }

  return fetch(targetUrl, options);
}

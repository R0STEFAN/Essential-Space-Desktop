import { fetch as tauriFetch } from '@tauri-apps/plugin-http';

/**
 * Native Direct Fetcher for Nothing Cloud API.
 * Uses Tauri v2 native sockets via @tauri-apps/plugin-http to bypass CORS entirely.
 * Falls back to standard fetch in web environment.
 */
export async function nothingFetch(
  targetUrl: string,
  options: RequestInit = {}
): Promise<Response> {
  // Check if running inside Tauri runtime
  if (typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)) {
    try {
      return await tauriFetch(targetUrl, options as any);
    } catch (tauriErr) {
      console.warn('Tauri native fetch encountered an issue, falling back to standard fetch:', tauriErr);
    }
  }

  return fetch(targetUrl, options);
}

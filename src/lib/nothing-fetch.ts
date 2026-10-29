import { invoke } from '@tauri-apps/api/core';

export interface NativeFetchOptions extends RequestInit {
  maxRedirections?: number;
  connectTimeout?: number;
  proxy?: any;
  danger?: any;
}

const ERROR_REQUEST_CANCELLED = 'Request cancelled';

/**
 * Native Direct Fetcher for Nothing Cloud API.
 * Uses Tauri v2 IPC ('plugin:http|fetch') directly, ensuring target origin spoofing
 * and strictly stripping browser CORS headers (such as `origin: http://tauri.localhost`,
 * `sec-fetch-*`) that cause Nothing's Cloudflare / AWS CloudFront gateway to reject
 * requests with HTTP 403.
 */
export async function nothingFetch(
  targetUrl: string,
  options: NativeFetchOptions = {}
): Promise<Response> {
  const signal = options.signal;
  if (signal?.aborted) {
    throw new Error(ERROR_REQUEST_CANCELLED);
  }

  const method = (options.method || 'GET').toUpperCase();
  let maxRedirections = options.maxRedirections;
  if (options.redirect === 'manual' && maxRedirections === undefined) {
    maxRedirections = 0;
  }

  // Process body into number[] byte array
  let data: number[] | null = null;
  if (options.body) {
    if (typeof options.body === 'string') {
      const encoded = new TextEncoder().encode(options.body);
      data = Array.from(encoded);
    } else if (options.body instanceof ArrayBuffer) {
      data = Array.from(new Uint8Array(options.body));
    } else if (ArrayBuffer.isView(options.body)) {
      data = Array.from(
        new Uint8Array(options.body.buffer, options.body.byteOffset, options.body.byteLength)
      );
    } else {
      const blob = await new Response(options.body).blob();
      const buf = await blob.arrayBuffer();
      data = Array.from(new Uint8Array(buf));
    }
  }

  let targetOrigin = '';
  try {
    targetOrigin = new URL(targetUrl).origin;
  } catch {}

  // Strip browser-injected / CORS headers that trigger Cloudflare / CloudFront 403 blocks
  const BLOCKED_HEADERS = new Set([
    'sec-fetch-mode',
    'sec-fetch-site',
    'sec-fetch-dest',
    'sec-ch-ua',
    'sec-ch-ua-mobile',
    'sec-ch-ua-platform',
    'host',
  ]);

  let hasOrigin = false;
  const mappedHeaders: [string, string][] = [];

  const addHeader = (rawKey: string, rawVal: any) => {
    if (rawVal === undefined || rawVal === null) return;
    const key = rawKey.trim();
    const lower = key.toLowerCase();
    if (BLOCKED_HEADERS.has(lower)) return;

    if (lower === 'origin') {
      hasOrigin = true;
      const strVal = String(rawVal);
      if (!strVal || strVal.includes('localhost') || strVal.includes('tauri:')) {
        if (targetOrigin) mappedHeaders.push(['Origin', targetOrigin]);
      } else {
        mappedHeaders.push(['Origin', strVal]);
      }
      return;
    }

    if (lower === 'referer') {
      const strVal = String(rawVal);
      if (strVal.includes('localhost') || strVal.includes('tauri:')) {
        if (targetOrigin) mappedHeaders.push(['Referer', `${targetOrigin}/`]);
      } else {
        mappedHeaders.push([key, strVal]);
      }
      return;
    }

    mappedHeaders.push([key, String(rawVal)]);
  };

  if (options.headers) {
    if (options.headers instanceof Headers) {
      options.headers.forEach((value, key) => addHeader(key, value));
    } else if (Array.isArray(options.headers)) {
      for (const [key, value] of options.headers) {
        addHeader(key, value);
      }
    } else if (typeof options.headers === 'object') {
      for (const [key, value] of Object.entries(options.headers)) {
        addHeader(key, value);
      }
    }
  }

  // CRUCIAL: If no Origin was provided, supply the target URL's origin.
  // Otherwise, tauri-plugin-http's Rust client injects 'Origin: http://tauri.localhost',
  // which causes Cloudflare / Nothing CloudFront to immediately return HTTP 403 Forbidden!
  if (!hasOrigin && targetOrigin) {
    mappedHeaders.push(['Origin', targetOrigin]);
  }

  try {
    const rid = await invoke<number>('plugin:http|fetch', {
      clientConfig: {
        method,
        url: targetUrl,
        headers: mappedHeaders,
        data,
        maxRedirections,
        connectTimeout: options.connectTimeout,
        proxy: options.proxy,
        danger: options.danger,
      },
    });

    const abort = () => invoke('plugin:http|fetch_cancel', { rid }).catch(() => {});
    if (signal?.aborted) {
      void abort();
      throw new Error(ERROR_REQUEST_CANCELLED);
    }
    signal?.addEventListener('abort', () => void abort());

    const {
      status,
      statusText,
      url: responseUrl,
      headers: responseHeaders,
      rid: responseRid,
    } = await invoke<{
      status: number;
      statusText: string;
      url: string;
      headers: [string, string][];
      rid: number;
    }>('plugin:http|fetch_send', { rid });

    let bodyDropped = false;
    const dropBody = async (): Promise<void> => {
      if (bodyDropped) return;
      bodyDropped = true;
      try {
        await invoke('plugin:http|fetch_cancel_body', { rid: responseRid });
      } catch {}
    };

    const readChunk = async (controller: ReadableStreamDefaultController<Uint8Array>) => {
      let chunkData: number[];
      try {
        chunkData = await invoke<number[]>('plugin:http|fetch_read_body', {
          rid: responseRid,
        });
      } catch (e) {
        controller.error(e);
        void dropBody();
        return;
      }

      const dataUint8 = new Uint8Array(chunkData);
      const lastByte = dataUint8[dataUint8.byteLength - 1];
      const actualData = dataUint8.slice(0, dataUint8.byteLength - 1);

      if (actualData.byteLength > 0) {
        controller.enqueue(actualData);
      }
      if (lastByte === 1) {
        controller.close();
        void dropBody();
      } else {
        await readChunk(controller);
      }
    };

    const stream = new ReadableStream({
      async start(controller) {
        await readChunk(controller);
      },
      async cancel() {
        await dropBody();
      },
    });

    const res = new Response(stream, {
      status,
      statusText,
    });

    Object.defineProperty(res, 'url', { value: responseUrl, writable: false });
    Object.defineProperty(res, 'headers', {
      value: new Headers(responseHeaders),
      writable: false,
    });
    // Attach rawHeaders for reliable Set-Cookie extraction
    (res as any).rawHeaders = responseHeaders;

    const originalClone = res.clone.bind(res);
    Object.defineProperty(res, 'clone', {
      value: () => {
        const cloned = originalClone();
        Object.defineProperty(cloned, 'url', { value: responseUrl, writable: false });
        Object.defineProperty(cloned, 'headers', {
          value: new Headers(responseHeaders),
          writable: false,
        });
        (cloned as any).rawHeaders = responseHeaders;
        return cloned;
      },
    });

    return res;
  } catch (ipcErr: any) {
    console.warn('Tauri IPC fetch failed, falling back to browser fetch:', ipcErr);
    return fetch(targetUrl, options);
  }
}

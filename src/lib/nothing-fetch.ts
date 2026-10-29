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
 * Uses Tauri v2 IPC ('plugin:http|fetch') directly, strictly stripping browser CORS
 * headers (such as `origin`, `referer`, `sec-fetch-*`) that cause Nothing's gateway
 * to reject requests with HTTP 403.
 */
export async function nothingFetch(
  targetUrl: string,
  options: NativeFetchOptions = {}
): Promise<Response> {
  const isTauri =
    typeof window !== 'undefined' &&
    ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);

  if (isTauri) {
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

    // Normalize and filter headers:
    // Strip forbidden / browser-injected headers that cause Cloudflare/Nothing WAF to 403
    const BLOCKED_HEADERS = new Set([
      'origin',
      'referer',
      'sec-fetch-mode',
      'sec-fetch-site',
      'sec-fetch-dest',
      'sec-ch-ua',
      'sec-ch-ua-mobile',
      'sec-ch-ua-platform',
      'host',
    ]);

    const mappedHeaders: [string, string][] = [];

    if (options.headers) {
      if (options.headers instanceof Headers) {
        options.headers.forEach((value, key) => {
          if (!BLOCKED_HEADERS.has(key.toLowerCase())) {
            mappedHeaders.push([key, String(value)]);
          }
        });
      } else if (Array.isArray(options.headers)) {
        for (const [key, value] of options.headers) {
          if (!BLOCKED_HEADERS.has(key.toLowerCase())) {
            mappedHeaders.push([key, String(value)]);
          }
        }
      } else if (typeof options.headers === 'object') {
        for (const [key, value] of Object.entries(options.headers)) {
          if (value !== undefined && value !== null && !BLOCKED_HEADERS.has(key.toLowerCase())) {
            mappedHeaders.push([key, String(value)]);
          }
        }
      }
    }

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
    const dropBody = () => {
      if (bodyDropped) return Promise.resolve();
      bodyDropped = true;
      return invoke('plugin:http|fetch_cancel_body', { rid: responseRid }).catch(() => {});
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

      if (lastByte === 1) {
        if (actualData.byteLength > 0) {
          controller.enqueue(actualData);
        }
        controller.close();
        return;
      }
      controller.enqueue(actualData);
    };

    const bodyStream = [101, 103, 204, 205, 304].includes(status)
      ? null
      : new ReadableStream<Uint8Array>({
          start(controller) {
            signal?.addEventListener('abort', () => {
              controller.error(new Error(ERROR_REQUEST_CANCELLED));
              void dropBody();
            });
          },
          pull(controller) {
            return readChunk(controller);
          },
          cancel() {
            void dropBody();
          },
        });

    const res = new Response(bodyStream, {
      status,
      statusText,
    });

    Object.defineProperty(res, 'url', { value: responseUrl, writable: false });
    Object.defineProperty(res, 'headers', {
      value: new Headers(responseHeaders),
      writable: false,
    });

    const originalClone = res.clone.bind(res);
    Object.defineProperty(res, 'clone', {
      value: () => {
        const cloned = originalClone();
        Object.defineProperty(cloned, 'url', { value: responseUrl, writable: false });
        Object.defineProperty(cloned, 'headers', {
          value: new Headers(responseHeaders),
          writable: false,
        });
        return cloned;
      },
    });

    return res;
  }

  // Standard web browser fallback
  return fetch(targetUrl, options);
}

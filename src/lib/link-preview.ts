import type { CardLink } from '@/types';
import { nothingFetch } from './nothing-fetch';

/**
 * Normalizes input URL string ensuring it has http:// or https:// protocol
 */
export function normalizeUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

/**
 * Extracts hostname domain from a URL without 'www.' prefix
 */
export function extractDomain(url: string): string {
  try {
    const parsed = new URL(normalizeUrl(url));
    return parsed.hostname.replace(/^www\./i, '');
  } catch {
    return '';
  }
}

/**
 * Parses OpenGraph and standard HTML metadata directly from HTML string
 */
function parseHtmlMetadata(html: string, pageUrl: string): Partial<CardLink> {
  const domain = extractDomain(pageUrl);
  let title: string | undefined;
  let description: string | undefined;
  let preview: string | undefined;
  let siteName: string | undefined;
  let favicon: string | undefined;

  // Extract <title> or <meta property="og:title">
  const ogTitleMatch = html.match(/<meta\s+[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i) ||
    html.match(/<meta\s+[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i);
  if (ogTitleMatch) {
    title = ogTitleMatch[1].trim();
  } else {
    const titleTagMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleTagMatch) title = titleTagMatch[1].trim();
  }

  // Extract <meta property="og:description"> or <meta name="description">
  const ogDescMatch = html.match(/<meta\s+[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i) ||
    html.match(/<meta\s+[^>]*content=["']([^"']+)["'][^>]*property=["']og:description["']/i) ||
    html.match(/<meta\s+[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i) ||
    html.match(/<meta\s+[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i);
  if (ogDescMatch) {
    description = ogDescMatch[1].trim();
  }

  // Extract <meta property="og:image">
  const ogImgMatch = html.match(/<meta\s+[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
    html.match(/<meta\s+[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
  if (ogImgMatch) {
    const rawImg = ogImgMatch[1].trim();
    try {
      preview = new URL(rawImg, pageUrl).toString();
    } catch {
      preview = rawImg;
    }
  }

  // Extract site name
  const ogSiteMatch = html.match(/<meta\s+[^>]*property=["']og:site_name["'][^>]*content=["']([^"']+)["']/i);
  if (ogSiteMatch) {
    siteName = ogSiteMatch[1].trim();
  }

  // Extract favicon
  const iconMatch = html.match(/<link\s+[^>]*rel=["'](?:shortcut\s+)?icon["'][^>]*href=["']([^"']+)["']/i) ||
    html.match(/<link\s+[^>]*href=["']([^"']+)["'][^>]*rel=["'](?:shortcut\s+)?icon["']/i);
  if (iconMatch) {
    try {
      favicon = new URL(iconMatch[1].trim(), pageUrl).toString();
    } catch {
      favicon = iconMatch[1].trim();
    }
  }

  return {
    title,
    description,
    preview,
    siteName: siteName || domain,
    favicon,
    domain,
  };
}

/**
 * Fetches rich OpenGraph metadata for a URL (title, description, preview image, favicon, domain, siteName)
 * Cascading approach:
 * 1. Direct native HTML fetch via Tauri sockets (no CORS!)
 * 2. Microlink API fallback
 * 3. Domain heuristics + Google Favicon fallback
 */
export async function fetchLinkPreview(rawUrl: string): Promise<CardLink> {
  const url = normalizeUrl(rawUrl);
  const domain = extractDomain(url) || url;
  const defaultFavicon = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;

  const fallback: CardLink = {
    url,
    title: domain,
    description: url,
    domain,
    siteName: domain,
    favicon: defaultFavicon,
    preview: undefined,
  };

  if (!url || !/^https?:\/\/[a-z0-9.-]+\.[a-z]{2,}/i.test(url)) {
    return fallback;
  }

  // 1. Direct native fetch via nothingFetch (fast & bypasses CORS completely)
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await nothingFetch(url, {
      method: 'GET',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      const html = await res.text();
      const meta = parseHtmlMetadata(html, url);
      if (meta.title || meta.preview || meta.description) {
        return {
          url,
          title: meta.title || domain,
          description: meta.description || '',
          preview: meta.preview || undefined,
          favicon: meta.favicon || defaultFavicon,
          domain: meta.domain || domain,
          siteName: meta.siteName || domain,
        };
      }
    }
  } catch (err) {
    console.warn('Direct native fetch failed for link preview, trying fallback...', err);
  }

  // 2. Microlink public metadata API fallback
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const mRes = await nothingFetch(`https://api.microlink.io/?url=${encodeURIComponent(url)}`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (mRes.ok) {
      const json = await mRes.json();
      if (json?.status === 'success' && json.data) {
        const d = json.data;
        return {
          url,
          title: d.title || domain,
          description: d.description || '',
          preview: d.image?.url || undefined,
          favicon: d.logo?.url || defaultFavicon,
          domain,
          siteName: d.publisher || domain,
        };
      }
    }
  } catch (mErr) {
    console.warn('Microlink fallback error:', mErr);
  }

  return fallback;
}

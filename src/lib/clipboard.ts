export interface ClipboardParsedContent {
  type: 'IMAGE' | 'LINK' | 'TEXT';
  text?: string;
  url?: string;
  imageBlob?: Blob;
  imageUrl?: string;
}

/**
 * Parses raw clipboard paste event
 */
export async function parseClipboardPasteEvent(
  event: React.ClipboardEvent | ClipboardEvent
): Promise<ClipboardParsedContent | null> {
  const items = event.clipboardData?.items;
  if (!items) return null;

  // 1. Check for Image paste (e.g. Screenshot or copied image file)
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.type.indexOf('image') !== -1) {
      const file = item.getAsFile();
      if (file) {
        const imageUrl = URL.createObjectURL(file);
        return {
          type: 'IMAGE',
          imageBlob: file,
          imageUrl,
        };
      }
    }
  }

  // 2. Check for Text / URL paste
  const text = event.clipboardData?.getData('text/plain')?.trim();
  if (!text) return null;

  // Detect URL
  try {
    const url = new URL(text);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return {
        type: 'LINK',
        url: text,
        text,
      };
    }
  } catch {
    // Not a valid URL, treat as plain text
  }

  return {
    type: 'TEXT',
    text,
  };
}

/**
 * Reads directly from system clipboard using standard Web API
 */
export async function readSystemClipboard(): Promise<ClipboardParsedContent | null> {
  if (typeof navigator === 'undefined' || !navigator.clipboard) return null;

  try {
    // Try reading images first if available
    if (navigator.clipboard.read) {
      const items = await navigator.clipboard.read().catch(() => []);
      for (const item of items) {
        const imageType = item.types.find(t => t.startsWith('image/'));
        if (imageType) {
          const blob = await item.getType(imageType);
          const imageUrl = URL.createObjectURL(blob);
          return {
            type: 'IMAGE',
            imageBlob: blob,
            imageUrl,
          };
        }
      }
    }

    // Try reading text
    const text = await navigator.clipboard.readText().catch(() => '');
    if (!text || !text.trim()) return null;

    const trimmed = text.trim();
    try {
      const url = new URL(trimmed);
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        return {
          type: 'LINK',
          url: trimmed,
          text: trimmed,
        };
      }
    } catch {}

    return {
      type: 'TEXT',
      text: trimmed,
    };
  } catch (err) {
    console.warn('Could not read system clipboard directly:', err);
    return null;
  }
}

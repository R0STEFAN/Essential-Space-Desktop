import {
  register,
  unregister,
  isRegistered,
  unregisterAll,
} from '@tauri-apps/plugin-global-shortcut';

export const DEFAULT_SHORTCUT = 'CommandOrControl+Alt+Space';
export const SHORTCUT_STORAGE_KEY = 'essential_space_hotkey';

export function isTauri(): boolean {
  return typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);
}

/**
 * Normalizes user-friendly string to Tauri shortcut string
 */
export function normalizeShortcut(shortcut: string): string {
  return shortcut
    .replace(/Ctrl/gi, 'CommandOrControl')
    .replace(/\s+/g, '');
}

/**
 * Formats Tauri shortcut string to display friendly string
 */
export function formatShortcutForDisplay(shortcut: string): string {
  return shortcut
    .replace(/CommandOrControl/gi, 'Ctrl')
    .split('+')
    .join(' + ');
}

export function getStoredShortcut(): string {
  if (typeof window === 'undefined') return DEFAULT_SHORTCUT;
  return localStorage.getItem(SHORTCUT_STORAGE_KEY) || DEFAULT_SHORTCUT;
}

export function storeShortcut(shortcut: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(SHORTCUT_STORAGE_KEY, shortcut);
  }
}

let activeHandler: (() => void) | null = null;
let currentRegisteredShortcut: string | null = null;

export function setActiveShortcutHandler(handler: () => void): void {
  activeHandler = handler;
}

/**
 * Registers global shortcut for Quick Capture
 */
export async function setupGlobalShortcut(
  shortcut: string,
  onTrigger?: () => void
): Promise<{ success: boolean; error?: string }> {
  if (!isTauri()) {
    return { success: true };
  }

  if (onTrigger) {
    activeHandler = onTrigger;
  }

  try {
    const normalized = normalizeShortcut(shortcut);

    // Unregister previous if exists
    if (currentRegisteredShortcut) {
      try {
        await unregister(currentRegisteredShortcut);
      } catch {}
    }

    // Check if already registered
    const already = await isRegistered(normalized).catch(() => false);
    if (already) {
      await unregister(normalized).catch(() => {});
    }

    await register(normalized, event => {
      if (event.state === 'Pressed' && activeHandler) {
        activeHandler();
      }
    });

    currentRegisteredShortcut = normalized;
    storeShortcut(shortcut);
    console.log('[Shortcuts] Registered global shortcut:', normalized);
    return { success: true };
  } catch (err: any) {
    console.error('Failed to register global shortcut:', err);
    return { success: false, error: err?.message || 'Failed to bind shortcut' };
  }
}

/**
 * Unregister active global shortcut
 */
export async function cleanupGlobalShortcuts(): Promise<void> {
  if (!isTauri()) return;
  try {
    if (currentRegisteredShortcut) {
      await unregister(currentRegisteredShortcut);
      currentRegisteredShortcut = null;
    }
  } catch (err) {
    console.warn('Failed to unregister shortcut:', err);
  }
}

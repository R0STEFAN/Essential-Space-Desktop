import { open } from '@tauri-apps/plugin-shell';
import { isTauri } from './shortcuts';

export interface GitHubAsset {
  name: string;
  browser_download_url: string;
  content_type: string;
  size: number;
}

export interface GitHubRelease {
  tag_name: string;
  name: string;
  body: string;
  published_at: string;
  html_url: string;
  assets: GitHubAsset[];
}

export interface UpdateInfo {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseName: string;
  releaseNotes: string;
  publishedAt: string;
  downloadUrl: string;
  assetName: string;
  htmlUrl: string;
}

const GITHUB_REPO = 'R0STEFAN/Essential-Space-Desktop';
export const CURRENT_APP_VERSION = '1.0.4';

/**
 * Compare two semver strings: returns true if remote > current.
 */
export function isNewerVersion(current: string, remote: string): boolean {
  const clean = (v: string) => v.trim().replace(/^v/i, '');
  const cParts = clean(current).split('.').map(n => parseInt(n, 10) || 0);
  const rParts = clean(remote).split('.').map(n => parseInt(n, 10) || 0);

  const len = Math.max(cParts.length, rParts.length);
  for (let i = 0; i < len; i++) {
    const c = cParts[i] ?? 0;
    const r = rParts[i] ?? 0;
    if (r > c) return true;
    if (r < c) return false;
  }
  return false;
}

/**
 * Detect client platform based on userAgent or Tauri environment.
 */
export function getPlatform(): 'windows' | 'linux' | 'macos' | 'unknown' {
  if (typeof window === 'undefined') return 'unknown';
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('win')) return 'windows';
  if (ua.includes('linux')) return 'linux';
  if (ua.includes('mac')) return 'macos';
  return 'unknown';
}

/**
 * Select the appropriate installer asset for the current OS.
 */
export function selectBestAsset(assets: GitHubAsset[], platform: string): GitHubAsset | null {
  if (!assets || assets.length === 0) return null;

  if (platform === 'windows') {
    // Prefer NSIS setup .exe installer, fallback to .msi
    const nsisExe = assets.find(a => a.name.toLowerCase().endsWith('.exe'));
    if (nsisExe) return nsisExe;
    const msi = assets.find(a => a.name.toLowerCase().endsWith('.msi'));
    if (msi) return msi;
  } else if (platform === 'linux') {
    // Prefer .AppImage, fallback to .deb
    const appImage = assets.find(a => a.name.endsWith('.AppImage'));
    if (appImage) return appImage;
    const deb = assets.find(a => a.name.endsWith('.deb'));
    if (deb) return deb;
  } else if (platform === 'macos') {
    const dmg = assets.find(a => a.name.endsWith('.dmg') || a.name.endsWith('.app.tar.gz'));
    if (dmg) return dmg;
  }

  // Fallback: any executable or first asset
  return assets.find(a => /\.(exe|msi|AppImage|deb|dmg)$/i.test(a.name)) || assets[0] || null;
}

/**
 * Check GitHub releases API for latest published release.
 */
export async function checkForUpdates(
  currentVersion: string = CURRENT_APP_VERSION
): Promise<UpdateInfo> {
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!res.ok) {
      throw new Error(`GitHub Releases API responded with ${res.status}`);
    }

    const data: GitHubRelease = await res.json();
    const latestVersion = (data.tag_name || '').trim();
    const hasUpdate = isNewerVersion(currentVersion, latestVersion);

    const platform = getPlatform();
    const bestAsset = selectBestAsset(data.assets || [], platform);

    return {
      hasUpdate,
      currentVersion,
      latestVersion,
      releaseName: data.name || data.tag_name || `Version ${latestVersion}`,
      releaseNotes: data.body || '',
      publishedAt: data.published_at || '',
      downloadUrl: bestAsset?.browser_download_url || data.html_url,
      assetName: bestAsset?.name || 'Installer',
      htmlUrl: data.html_url || `https://github.com/${GITHUB_REPO}/releases`,
    };
  } catch (err: any) {
    console.error('Update check failed:', err);
    return {
      hasUpdate: false,
      currentVersion,
      latestVersion: currentVersion,
      releaseName: '',
      releaseNotes: '',
      publishedAt: '',
      downloadUrl: `https://github.com/${GITHUB_REPO}/releases`,
      assetName: '',
      htmlUrl: `https://github.com/${GITHUB_REPO}/releases`,
    };
  }
}

/**
 * Open external URL or download installer in default browser / system handler.
 */
export async function openDownloadUrl(url: string): Promise<void> {
  if (isTauri()) {
    try {
      await open(url);
      return;
    } catch (err) {
      console.warn('Tauri shell open failed, falling back to window.open:', err);
    }
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

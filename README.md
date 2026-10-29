<div align="center">
  <img src="public/icon.png" width="96" height="96" alt="Essential Space Logo" />
  <h1>ESSENTIAL SPACE // DESKTOP</h1>
  <p><b>Autonomous native companion application for Nothing OS Essential Space</b></p>
  <p>Built with <b>Tauri v2</b> &bull; <b>React 19</b> &bull; <b>TypeScript</b> &bull; <b>Tailwind CSS</b></p>
  
  <p>
    <img src="https://img.shields.io/badge/Platform-Windows%20%7C%20Linux-D71921?style=flat-square" alt="Platform" />
    <img src="https://img.shields.io/badge/Tauri-v2-121214?style=flat-square&logo=tauri" alt="Tauri v2" />
    <img src="https://img.shields.io/badge/React-19-141416?style=flat-square&logo=react" alt="React 19" />
    <img src="https://img.shields.io/badge/License-MIT-26262A?style=flat-square" alt="License" />
  </p>
</div>

---

## Features

- **Autonomous & Direct**: Communicates directly with Nothing Cloud (`https://essential-space.nothingtech.link`) and Nothing Account SSO (`https://account.nothing.tech`) over native operating system sockets via `@tauri-apps/plugin-http`. No CORS issues, zero middleman servers or third-party proxies required.
- **System Tray & Background Resident**: Runs discreetly in your Windows / Linux system tray. Closing the window minimizes it directly to the tray.
- **Customizable Global Hotkey**: Summon the floating Quick Capture overlay from anywhere across your system.
  - **Default**: <kbd>Ctrl</kbd> + <kbd>Alt</kbd> + <kbd>Space</kbd>
  - Interactive shortcut recorder in **Settings** allows rebinding to any custom key combination.
- **Autostart on Boot**: Toggleable in Settings to automatically launch Essential Space minimized on system startup via `@tauri-apps/plugin-autostart`.
- **Multi-Modal Quick Capture**:
  - **Microphone Voice Memos**: Record voice notes with waveform visualization and timer, automatically uploaded as Nothing `AUDIO` cards.
  - **Smart Clipboard Paste (<kbd>Ctrl</kbd> + <kbd>V</kbd>)**:
    - **Screenshots & Images**: Auto-detects image files or screenshot buffers, previews thumbnails, converts to WebP, and uploads as `IMAGE` cards.
    - **URLs & Links**: Extracts domains and titles, saving as `LINK` cards.
    - **Notes**: Inserts formatted text directly.
- **Authentic Nothing OS Dot-Matrix Aesthetic**: Pure monochrome styling, custom `NDot-57` typography, no faux-bold font smearing, and high-contrast UI matching the Nothing OS mobile app.
- **Offline-First Dexie IndexedDB Cache**:
  - Local persistence for cards, collections, and AI tasks.
  - Local media cache persists image blobs in IndexedDB so notes in Trash preserve images even if cloud assets are purged.
- **Collapsible AI Task Suggestions**: AI-suggested tasks appear collapsed by default under active tasks with clear `EXPAND` / `COLLAPSE` toggles and untruncated titles.
- **Monochrome Collections**: Strictly matches Nothing OS design without intrusive rainbow color pickers.

---

## Supported Platforms

- **Windows 10 / 11 (x64)**: `.msi` (Windows Installer) and standalone `.exe`
- **Linux (x86_64)**: `.AppImage` (Universal) and `.deb` (Debian / Ubuntu / Linux Mint)

---

## Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| <kbd>Ctrl</kbd> + <kbd>Alt</kbd> + <kbd>Space</kbd> | Open Global Quick Capture (Customizable) |
| <kbd>Ctrl</kbd> + <kbd>Enter</kbd> | Save Note in Quick Capture |
| <kbd>Esc</kbd> | Dismiss Quick Capture or Detail Modals |
| <kbd>Ctrl</kbd> + <kbd>V</kbd> | Smart Paste Screenshot / Image / Link / Text |

---

## Development & Building

### Prerequisites

1. **Node.js**: `v20+` or `v22+`
2. **Rust**: Stable toolchain (`rustc` and `cargo` via [rustup.rs](https://rustup.rs))
3. **OS-specific dependencies**:
   - **Windows**: Microsoft Visual Studio C++ Build Tools or WebView2 runtime.
   - **Linux (Debian/Ubuntu)**:
     ```bash
     sudo apt-get update && sudo apt-get install -y \
       libwebkit2gtk-4.1-dev build-essential curl wget file \
       libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
     ```

### Local Setup

```bash
# Clone the repository
git clone https://github.com/R0STEFAN/Essential-Space-Desktop.git
cd Essential-Space-Desktop

# Install frontend dependencies
npm install

# Run frontend in development mode
npm run dev

# Run full native Tauri desktop application in development mode
npm run tauri dev
```

### Production Build

```bash
# Build native desktop installer and binaries
npm run tauri build
```
Binaries will be output to:
- Windows: `src-tauri/target/release/bundle/msi/` and `src-tauri/target/release/bundle/nsis/`
- Linux: `src-tauri/target/release/bundle/appimage/` and `src-tauri/target/release/bundle/deb/`

---

## Continuous Integration & Releases

Automated builds and GitHub Releases are powered by `.github/workflows/release.yml`. Whenever a tag is pushed (e.g. `git tag v1.0.0 && git push origin v1.0.0`) or triggered manually via **Run workflow** in GitHub Actions, GitHub Actions compiles Windows (`.msi`, `.exe`) and Linux (`.AppImage`, `.deb`) packages in the cloud and attaches them to the release.

---

## License

MIT License. Designed with reverence for Nothing OS aesthetics.

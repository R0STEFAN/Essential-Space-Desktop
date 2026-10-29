import { useState, useEffect } from 'react';
import {
  X,
  Keyboard,
  Power,
  RotateCcw,
  Check,
  AlertCircle,
  User,
  LogOut,
  Loader2,
  RefreshCw,
  Download,
  Sparkles,
  ShieldCheck,
  ExternalLink,
} from 'lucide-react';
import { isEnabled, enable, disable } from '@tauri-apps/plugin-autostart';
import {
  DEFAULT_SHORTCUT,
  formatShortcutForDisplay,
  getStoredShortcut,
  setupGlobalShortcut,
  isTauri,
} from '@/lib/shortcuts';
import { useScrollLock } from '@/lib/useScrollLock';
import { checkForUpdates, openDownloadUrl, CURRENT_APP_VERSION, type UpdateInfo } from '@/lib/updater';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  userEmail: string;
  userId: string;
  onLogout: () => void;
  onShortcutUpdated: () => void;
}

export default function SettingsModal({
  isOpen,
  onClose,
  userEmail,
  userId,
  onLogout,
  onShortcutUpdated,
}: SettingsModalProps) {
  const [currentShortcut, setCurrentShortcut] = useState<string>(getStoredShortcut());
  const [isRecordingKey, setIsRecordingKey] = useState<boolean>(false);
  const [recordedCombo, setRecordedCombo] = useState<string>('');
  const [autostartEnabled, setAutostartEnabled] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isAutostartLoading, setIsAutostartLoading] = useState<boolean>(false);

  // Updater state
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [updateResult, setUpdateResult] = useState<UpdateInfo | null>(null);
  const [hasCheckedUpdate, setHasCheckedUpdate] = useState(false);

  const handleCheckUpdate = async () => {
    setIsCheckingUpdate(true);
    try {
      const info = await checkForUpdates(CURRENT_APP_VERSION);
      setUpdateResult(info);
      setHasCheckedUpdate(true);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to check for updates');
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  useScrollLock(isOpen);

  // Check autostart status on open
  useEffect(() => {
    if (isOpen) {
      setCurrentShortcut(getStoredShortcut());
      setIsRecordingKey(false);
      setRecordedCombo('');
      setStatusMessage(null);
      setErrorMessage(null);

      if (isTauri()) {
        isEnabled()
          .then(enabled => setAutostartEnabled(enabled))
          .catch(() => setAutostartEnabled(false));
      }
    }
  }, [isOpen]);

  // Key recording listener
  useEffect(() => {
    if (!isRecordingKey) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === 'Escape') {
        setIsRecordingKey(false);
        setRecordedCombo('');
        return;
      }

      const modifiers: string[] = [];
      if (e.ctrlKey) modifiers.push('Ctrl');
      if (e.altKey) modifiers.push('Alt');
      if (e.shiftKey) modifiers.push('Shift');
      if (e.metaKey) modifiers.push('Super');

      // Key code
      let key = e.code;
      if (key.startsWith('Key')) key = key.slice(3);
      else if (key.startsWith('Digit')) key = key.slice(5);
      else if (key === 'Space') key = 'Space';

      if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) {
        // Only modifier pressed so far
        setRecordedCombo(modifiers.join(' + ') + ' + ...');
        return;
      }

      if (modifiers.length === 0) {
        setErrorMessage('Please include at least one modifier (Ctrl, Alt, or Shift).');
        return;
      }

      const finalCombo = [...modifiers, key].join('+');
      setRecordedCombo(finalCombo);
      setIsRecordingKey(false);
      setErrorMessage(null);

      // Save and register shortcut
      setupGlobalShortcut(finalCombo).then(res => {
        if (res.success) {
          setCurrentShortcut(finalCombo);
          setStatusMessage('Shortcut updated successfully!');
          onShortcutUpdated();
          setTimeout(() => setStatusMessage(null), 2500);
        } else {
          setErrorMessage(res.error || 'Failed to bind this shortcut.');
        }
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isRecordingKey, onShortcutUpdated]);

  const handleToggleAutostart = async () => {
    if (!isTauri()) {
      setAutostartEnabled(prev => !prev);
      return;
    }

    setIsAutostartLoading(true);
    setErrorMessage(null);

    try {
      if (autostartEnabled) {
        await disable();
        setAutostartEnabled(false);
        setStatusMessage('Autostart on boot disabled.');
      } else {
        await enable();
        setAutostartEnabled(true);
        setStatusMessage('Autostart on boot enabled.');
      }
      setTimeout(() => setStatusMessage(null), 2500);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to update autostart setting.');
    } finally {
      setIsAutostartLoading(false);
    }
  };

  const handleResetShortcut = async () => {
    const res = await setupGlobalShortcut(DEFAULT_SHORTCUT);
    if (res.success) {
      setCurrentShortcut(DEFAULT_SHORTCUT);
      setStatusMessage('Reset shortcut to default: Ctrl + Alt + Space');
      onShortcutUpdated();
      setTimeout(() => setStatusMessage(null), 2500);
    } else {
      setErrorMessage(res.error || 'Failed to reset shortcut.');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-lg rounded-2xl bg-nothing-card border border-nothing-border shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-nothing-border/60">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-white" />
            <h3 className="font-dot text-sm text-white uppercase tracking-wider font-semibold">
              SETTINGS // DESKTOP
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-nothing-gray hover:text-white hover:bg-nothing-hover transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Settings Body */}
        <div className="p-5 flex flex-col gap-6">
          {/* Section 1: Global Shortcut */}
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Keyboard size={16} className="text-nothing-red" />
                <span className="font-dot text-xs text-white uppercase tracking-wider font-semibold">
                  GLOBAL QUICK CAPTURE HOTKEY
                </span>
              </div>
              <button
                onClick={handleResetShortcut}
                title="Reset to default (Ctrl + Alt + Space)"
                className="flex items-center gap-1 text-[11px] font-mono text-nothing-gray hover:text-white transition-colors"
              >
                <RotateCcw size={11} />
                <span>Default</span>
              </button>
            </div>

            <p className="text-xs font-mono text-nothing-gray">
              Summons the floating Quick Capture overlay from anywhere in your operating system.
            </p>

            <div className="flex items-center justify-between p-3 rounded-xl bg-nothing-dark border border-nothing-border">
              <div className="flex items-center gap-1.5">
                {isRecordingKey ? (
                  <span className="font-mono text-xs text-nothing-red animate-pulse">
                    {recordedCombo || 'Press shortcut keys on your keyboard...'}
                  </span>
                ) : (
                  <kbd className="px-2.5 py-1 rounded bg-black border border-nothing-border text-white font-mono text-xs tracking-wider shadow-inner font-semibold">
                    {formatShortcutForDisplay(currentShortcut)}
                  </kbd>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  setIsRecordingKey(true);
                  setRecordedCombo('');
                  setErrorMessage(null);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all ${
                  isRecordingKey
                    ? 'bg-nothing-red text-white'
                    : 'bg-nothing-card hover:bg-nothing-hover border border-nothing-border text-white'
                }`}
              >
                {isRecordingKey ? 'RECORDING...' : 'CHANGE'}
              </button>
            </div>
          </div>

          {/* Section 2: Autostart on Boot */}
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center gap-2">
              <Power size={16} className="text-nothing-red" />
              <span className="font-dot text-xs text-white uppercase tracking-wider font-semibold">
                SYSTEM STARTUP
              </span>
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-nothing-dark border border-nothing-border">
              <div className="flex flex-col">
                <span className="text-xs font-mono text-white">Launch at boot</span>
                <span className="text-[11px] font-mono text-nothing-gray">
                  Automatically start Essential Space minimized in the System Tray
                </span>
              </div>

              <button
                type="button"
                onClick={handleToggleAutostart}
                disabled={isAutostartLoading}
                className={`relative w-12 h-6 rounded-full transition-colors p-0.5 border ${
                  autostartEnabled
                    ? 'bg-nothing-red border-nothing-red'
                    : 'bg-nothing-card border-nothing-border'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    autostartEnabled ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Section 3: Account & Session */}
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center gap-2">
              <User size={16} className="text-nothing-red" />
              <span className="font-dot text-xs text-white uppercase tracking-wider font-semibold">
                NOTHING ACCOUNT
              </span>
            </div>

            <div className="p-3 rounded-xl bg-nothing-dark border border-nothing-border flex items-center justify-between">
              <div className="flex flex-col overflow-hidden">
                <span className="text-xs font-mono text-white truncate">{userEmail}</span>
                <span className="text-[10px] font-mono text-nothing-gray truncate">
                  ID: {userId}
                </span>
              </div>

              <button
                onClick={() => {
                  onLogout();
                  onClose();
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono text-nothing-red hover:bg-nothing-red/10 border border-nothing-red/30 transition-colors shrink-0"
              >
                <LogOut size={13} />
                <span>Log Out</span>
              </button>
            </div>
          </div>

          {/* Section 4: Application & Updates */}
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-nothing-red" />
              <span className="font-dot text-xs text-white uppercase tracking-wider font-semibold">
                APPLICATION & UPDATES
              </span>
            </div>

            <div className="p-3 rounded-xl bg-nothing-dark border border-nothing-border flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-xs font-mono text-white font-semibold">
                    Essential Space Desktop
                  </span>
                  <span className="text-[11px] font-mono text-nothing-gray">
                    Installed Version: <span className="text-white">v{CURRENT_APP_VERSION}</span>
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleCheckUpdate}
                  disabled={isCheckingUpdate}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono bg-nothing-card hover:bg-nothing-hover border border-nothing-border text-white transition-all active:scale-95 disabled:opacity-50"
                >
                  <RefreshCw size={12} className={isCheckingUpdate ? 'animate-spin text-nothing-red' : ''} />
                  <span>{isCheckingUpdate ? 'CHECKING...' : 'CHECK FOR UPDATES'}</span>
                </button>
              </div>

              {/* Update Check Results */}
              {hasCheckedUpdate && updateResult && (
                <div className="pt-2 border-t border-nothing-border/50 flex flex-col gap-2">
                  {updateResult.hasUpdate ? (
                    <div className="flex flex-col gap-2 bg-nothing-red/[0.08] border border-nothing-red/30 p-2.5 rounded-lg">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-nothing-red animate-pulse" />
                          New version available: {updateResult.latestVersion}
                        </span>
                        <a
                          href={updateResult.htmlUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={e => {
                            e.preventDefault();
                            openDownloadUrl(updateResult.htmlUrl);
                          }}
                          className="text-[10px] text-nothing-red hover:underline flex items-center gap-1"
                        >
                          <span>Release Notes</span>
                          <ExternalLink size={10} />
                        </a>
                      </div>

                      <div className="flex items-center gap-1 text-[11px] text-green-400">
                        <ShieldCheck size={12} />
                        <span>Installers safely update on top of current version with 100% data preservation.</span>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[10px] text-nothing-gray font-mono truncate max-w-[220px]">
                          Asset: {updateResult.assetName}
                        </span>
                        <button
                          type="button"
                          onClick={() => openDownloadUrl(updateResult.downloadUrl)}
                          className="flex items-center gap-1.5 px-3 py-1 rounded bg-nothing-red hover:bg-red-600 text-white font-dot text-xs font-semibold tracking-wider transition-all shadow-sm active:scale-95"
                        >
                          <Download size={12} />
                          <span>DOWNLOAD & UPDATE</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-xs font-mono text-green-400 bg-green-950/40 p-2 rounded-lg border border-green-900/50">
                      <Check size={14} />
                      <span>You are running the latest version of Essential Space!</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Feedback messages */}
          {statusMessage && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-green-950/80 border border-green-800 text-xs font-mono text-green-200">
              <Check size={14} />
              <span>{statusMessage}</span>
            </div>
          )}

          {errorMessage && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-red-950/80 border border-red-800 text-xs font-mono text-red-200">
              <AlertCircle size={14} />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end p-4 border-t border-nothing-border/60 bg-black/40">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-white hover:bg-neutral-200 text-black font-dot text-xs tracking-wider font-semibold transition-all shadow-md active:scale-95"
          >
            CLOSE
          </button>
        </div>
      </div>
    </div>
  );
}

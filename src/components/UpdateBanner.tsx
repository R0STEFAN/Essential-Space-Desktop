import { useState } from 'react';
import { Download, X, Sparkles, ChevronDown, ChevronUp, ExternalLink, ShieldCheck } from 'lucide-react';
import type { UpdateInfo } from '@/lib/updater';
import { openDownloadUrl } from '@/lib/updater';

interface UpdateBannerProps {
  updateInfo: UpdateInfo;
  onDismiss: () => void;
}

export default function UpdateBanner({ updateInfo, onDismiss }: UpdateBannerProps) {
  const [showNotes, setShowNotes] = useState(false);
  const [isOpening, setIsOpening] = useState(false);

  const handleDownload = async () => {
    setIsOpening(true);
    try {
      await openDownloadUrl(updateInfo.downloadUrl);
    } finally {
      setTimeout(() => setIsOpening(false), 2000);
    }
  };

  return (
    <div className="w-full bg-gradient-to-r from-neutral-900 via-black to-neutral-900 border-b border-nothing-red/40 px-4 py-3 text-xs font-mono transition-all animate-in slide-in-from-top duration-300">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        {/* Left: Indicator & Headline */}
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center">
            <span className="w-2.5 h-2.5 rounded-full bg-nothing-red animate-ping absolute" />
            <span className="w-2.5 h-2.5 rounded-full bg-nothing-red relative" />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="font-dot text-white font-semibold uppercase tracking-wider text-[11px] bg-nothing-red/20 text-nothing-red px-2 py-0.5 rounded border border-nothing-red/30">
              UPDATE AVAILABLE
            </span>
            <span className="text-white font-semibold">
              Essential Space {updateInfo.latestVersion}
            </span>
            <span className="text-nothing-gray hidden sm:inline">•</span>
            <span className="text-nothing-gray text-[11px] flex items-center gap-1">
              <ShieldCheck size={12} className="text-green-400" />
              Safe in-place update (data & logins preserved)
            </span>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2 w-full md:w-auto justify-end">
          {updateInfo.releaseNotes && (
            <button
              type="button"
              onClick={() => setShowNotes(prev => !prev)}
              className="text-[11px] text-nothing-gray hover:text-white px-2 py-1 rounded hover:bg-white/5 flex items-center gap-1 transition-colors"
            >
              <span>{showNotes ? 'Hide notes' : "What's new"}</span>
              {showNotes ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
          )}

          <button
            type="button"
            onClick={handleDownload}
            disabled={isOpening}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-nothing-red hover:bg-red-600 text-white font-dot font-semibold text-[11px] uppercase tracking-wider transition-all shadow-sm active:scale-95 shrink-0"
          >
            <Download size={13} />
            <span>{isOpening ? 'OPENING...' : 'DOWNLOAD UPDATE'}</span>
          </button>

          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss"
            className="p-1 rounded-lg text-nothing-gray hover:text-white hover:bg-white/10 transition-colors"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Expanded Release Notes */}
      {showNotes && (
        <div className="max-w-7xl mx-auto mt-3 pt-3 border-t border-nothing-border/40 text-[11px] text-neutral-300">
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-semibold text-white flex items-center gap-1">
              <Sparkles size={12} className="text-nothing-red" />
              Release Notes ({updateInfo.latestVersion}):
            </span>
            <a
              href={updateInfo.htmlUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => {
                e.preventDefault();
                openDownloadUrl(updateInfo.htmlUrl);
              }}
              className="text-nothing-red hover:underline flex items-center gap-1 text-[10px]"
            >
              <span>View on GitHub</span>
              <ExternalLink size={10} />
            </a>
          </div>
          <div className="bg-black/60 rounded-lg p-2.5 border border-nothing-border/30 whitespace-pre-wrap max-h-40 overflow-y-auto font-mono text-[11px] text-neutral-300">
            {updateInfo.releaseNotes}
          </div>
          <p className="text-[10px] text-nothing-gray mt-1.5">
            Target installer: <span className="text-white font-mono">{updateInfo.assetName}</span>. Simply download and run it to update Essential Space.
          </p>
        </div>
      )}
    </div>
  );
}

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  X,
  Mic,
  Link as LinkIcon,
  Image as ImageIcon,
  Check,
  Loader2,
  Trash2,
  Sparkles,
} from 'lucide-react';
import type { Collection, Card, CardType } from '@/types';
import { createCloudCard, requestNothingAiAnalysis } from '@/lib/nothing-cards';
import { convertToWebP } from '@/lib/image-optimizer';
import { uploadMediaToGcs } from '@/lib/firebase-upload';
import { parseClipboardPasteEvent, readSystemClipboard } from '@/lib/clipboard';
import AudioRecorder from './AudioRecorder';
import { useScrollLock } from '@/lib/useScrollLock';

interface QuickCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  collections: Collection[];
  token: string;
  userId: string;
  onCardCreated: (card: Card) => void;
}

export default function QuickCaptureModal({
  isOpen,
  onClose,
  collections,
  token,
  userId,
  onCardCreated,
}: QuickCaptureModalProps) {
  const [content, setContent] = useState('');
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>('');
  const [detectedType, setDetectedType] = useState<CardType>('TEXT');
  const [pastedImageBlob, setPastedImageBlob] = useState<Blob | null>(null);
  const [pastedImageUrl, setPastedImageUrl] = useState<string | null>(null);
  const [pastedUrl, setPastedUrl] = useState<string | null>(null);
  const [isAudioRecording, setIsAudioRecording] = useState(false);
  const [recordedAudioBlob, setRecordedAudioBlob] = useState<Blob | null>(null);
  const [recordedAudioDuration, setRecordedAudioDuration] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useScrollLock(isOpen);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setContent('');
      setSelectedCollectionId('');
      setDetectedType('TEXT');
      setPastedImageBlob(null);
      if (pastedImageUrl) URL.revokeObjectURL(pastedImageUrl);
      setPastedImageUrl(null);
      setPastedUrl(null);
      setIsAudioRecording(false);
      setRecordedAudioBlob(null);
      setRecordedAudioDuration(0);
      setError(null);
      setStatusText(null);

      // Auto-focus textarea
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 50);

      // Check if user has an image in clipboard on open
      readSystemClipboard().then(item => {
        if (item?.type === 'IMAGE' && item.imageBlob) {
          setPastedImageBlob(item.imageBlob);
          setPastedImageUrl(item.imageUrl || null);
          setDetectedType('IMAGE');
        } else if (item?.type === 'LINK' && item.url) {
          setPastedUrl(item.url);
          setDetectedType('LINK');
        }
      });
    }
  }, [isOpen]);

  // Handle global paste event
  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const parsed = await parseClipboardPasteEvent(e);
    if (!parsed) return;

    if (parsed.type === 'IMAGE' && parsed.imageBlob) {
      e.preventDefault();
      setPastedImageBlob(parsed.imageBlob);
      setPastedImageUrl(parsed.imageUrl || null);
      setDetectedType('IMAGE');
    } else if (parsed.type === 'LINK' && parsed.url) {
      setPastedUrl(parsed.url);
      setDetectedType('LINK');
    }
  }, []);

  const handleAudioComplete = (blob: Blob, durationSec: number) => {
    setRecordedAudioBlob(blob);
    setRecordedAudioDuration(durationSec);
    setIsAudioRecording(false);
    setDetectedType('AUDIO');
  };

  const handleRemoveImage = () => {
    if (pastedImageUrl) URL.revokeObjectURL(pastedImageUrl);
    setPastedImageBlob(null);
    setPastedImageUrl(null);
    if (detectedType === 'IMAGE') {
      setDetectedType(pastedUrl ? 'LINK' : 'TEXT');
    }
  };

  const handleRemoveLink = () => {
    setPastedUrl(null);
    if (detectedType === 'LINK') {
      setDetectedType(pastedImageBlob ? 'IMAGE' : 'TEXT');
    }
  };

  const handleRemoveAudio = () => {
    setRecordedAudioBlob(null);
    setRecordedAudioDuration(0);
    if (detectedType === 'AUDIO') {
      setDetectedType('TEXT');
    }
  };

  const handleSubmit = async () => {
    if (!content.trim() && !pastedImageBlob && !pastedUrl && !recordedAudioBlob) {
      setError('Please type some text, attach an image, or record an audio note.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      let finalImageUrl: string | undefined;
      let localDataUrl: string | undefined;
      let imageGcsKey: string | undefined;
      let finalAudioUri: string | undefined;
      let audioGcsKey: string | undefined;
      let aiResult: any = null;

      // 1. Process and upload image if present
      if (pastedImageBlob) {
        setStatusText('Optimizing image to WebP...');
        const { blob: webpBlob } = await convertToWebP(pastedImageBlob);

        // Pre-cache local data URL for offline and trash support
        localDataUrl = await new Promise<string>(resolve => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(webpBlob);
        });

        setStatusText('Uploading photo to Nothing Cloud...');
        const upload = await uploadMediaToGcs({
          nothingToken: token,
          userId,
          fileBlob: webpBlob,
          contentType: 'image/webp',
          type: 'image',
        });
        finalImageUrl = upload.downloadUrl;
        imageGcsKey = upload.gcsKey;

        // Run Nothing AI analysis on image
        setStatusText('Analyzing note with Nothing AI...');
        aiResult = await requestNothingAiAnalysis({
          token,
          promptType: 'IMG',
          userText: content.trim() || undefined,
          s3FileKey: imageGcsKey,
        });
      }

      // 2. Process and upload audio if present
      if (recordedAudioBlob) {
        setStatusText('Uploading voice memo...');
        const upload = await uploadMediaToGcs({
          nothingToken: token,
          userId,
          fileBlob: recordedAudioBlob,
          contentType: 'audio/wav',
          type: 'audio',
        });
        finalAudioUri = upload.downloadUrl;
        audioGcsKey = upload.gcsKey;
      }

      // 3. Process URL if present without image
      if (pastedUrl && !finalImageUrl) {
        setStatusText('Analyzing link with Nothing AI...');
        aiResult = await requestNothingAiAnalysis({
          token,
          promptType: 'SHARE_SHEET',
          url: pastedUrl,
          userText: content.trim() || undefined,
        });
      } else if (!finalImageUrl && !audioGcsKey && content.trim()) {
        setStatusText('Analyzing note with Nothing AI...');
        aiResult = await requestNothingAiAnalysis({
          token,
          promptType: 'TEXT',
          userText: content.trim(),
        });
      }

      // 4. Save Card to Nothing Cloud and IndexedDB
      setStatusText('Saving card to Nothing Space...');
      const cardType: CardType = finalAudioUri
        ? 'AUDIO'
        : finalImageUrl
        ? 'IMAGE'
        : pastedUrl
        ? 'LINK'
        : 'TEXT';

      const res = await createCloudCard({
        token,
        userId,
        type: cardType,
        title: aiResult?.title || (content.trim() ? content.trim().slice(0, 60) : undefined),
        content: content.trim() || undefined,
        summary: aiResult?.summary || (content.trim() ? content.trim() : undefined),
        imageUrl: finalImageUrl,
        cachedImageUrl: localDataUrl,
        imageGcsKey,
        linkUrl: pastedUrl || undefined,
        collectionId: selectedCollectionId || undefined,
        tags: aiResult?.tags,
        bulletPoints: aiResult?.bulletPoints,
        bulletPointsTitle: aiResult?.bulletPointsTitle,
        infoExtract: aiResult?.infoExtract,
        events: aiResult?.events,
        audio: finalAudioUri
          ? {
              audioUri: finalAudioUri,
              duration: recordedAudioDuration || 30,
              transcript: content.trim() || undefined,
            }
          : undefined,
        audioGcsKey,
      });

      if (!res.success || !res.card) {
        throw new Error(res.error || 'Failed to create note');
      }

      onCardCreated(res.card);
      onClose();
    } catch (err: any) {
      console.error('Quick capture error:', err);
      setError(err?.message || 'Failed to save note');
    } finally {
      setIsSubmitting(false);
      setStatusText(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn"
      onKeyDown={handleKeyDown}
    >
      <div
        className="relative w-full max-w-xl rounded-2xl bg-nothing-card border border-nothing-border shadow-2xl overflow-hidden flex flex-col"
        onPaste={handlePaste}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-nothing-border/60">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-nothing-red animate-pulse" />
            <h3 className="font-dot text-sm text-white uppercase tracking-wider font-semibold">
              QUICK CAPTURE // {detectedType}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-nothing-gray hover:text-white hover:bg-nothing-hover transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 flex flex-col gap-3">
          {/* Audio recording component if active */}
          {isAudioRecording ? (
            <AudioRecorder
              onRecordingComplete={handleAudioComplete}
              onCancel={() => setIsAudioRecording(false)}
            />
          ) : recordedAudioBlob ? (
            <div className="flex items-center justify-between p-3 rounded-xl bg-nothing-dark border border-nothing-border">
              <div className="flex items-center gap-2">
                <Mic size={15} className="text-nothing-red" />
                <span className="font-dot text-xs text-white">VOICE MEMO ATTACHED</span>
                <span className="font-mono text-xs text-nothing-gray">
                  ({Math.round(recordedAudioDuration)}s)
                </span>
              </div>
              <button
                type="button"
                onClick={handleRemoveAudio}
                className="p-1 text-nothing-gray hover:text-nothing-red"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ) : null}

          {/* Pasted Image Preview if present */}
          {pastedImageUrl && (
            <div className="relative w-full h-44 rounded-xl overflow-hidden bg-black/80 border border-nothing-border/80 group">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={pastedImageUrl}
                alt="Pasted screenshot"
                className="w-full h-full object-cover object-top"
              />
              <div className="absolute top-2 right-2">
                <button
                  type="button"
                  onClick={handleRemoveImage}
                  className="p-1.5 rounded-lg bg-black/80 text-white hover:bg-nothing-red transition-colors"
                  title="Remove image"
                >
                  <Trash2 size={13} />
                </button>
              </div>
              <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/80 font-mono text-[10px] text-white">
                IMAGE CLIPBOARD
              </div>
            </div>
          )}

          {/* Pasted Link Preview if present */}
          {pastedUrl && (
            <div className="flex items-center justify-between p-3 rounded-xl bg-nothing-dark border border-nothing-border">
              <div className="flex items-center gap-2 overflow-hidden">
                <LinkIcon size={14} className="text-nothing-red shrink-0" />
                <span className="font-mono text-xs text-nothing-light truncate">{pastedUrl}</span>
              </div>
              <button
                type="button"
                onClick={handleRemoveLink}
                className="p-1 text-nothing-gray hover:text-nothing-red shrink-0"
              >
                <Trash2 size={14} />
              </button>
            </div>
          )}

          {/* Main text input */}
          <textarea
            ref={textareaRef}
            rows={4}
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="Type your note, drop a link, or press Ctrl+V to paste screenshot..."
            className="w-full px-3.5 py-3 rounded-xl bg-nothing-dark border border-nothing-border text-sm text-white placeholder-nothing-gray focus:outline-none focus:border-white/50 resize-none font-mono"
          />

          {/* Tag / Collection Selector */}
          <div className="flex items-center gap-2 flex-wrap pt-1">
            <span className="font-mono text-xs text-nothing-gray">Collection:</span>
            <select
              value={selectedCollectionId}
              onChange={e => setSelectedCollectionId(e.target.value)}
              className="px-3 py-1.5 rounded-lg bg-nothing-dark border border-nothing-border text-xs text-white focus:outline-none font-mono cursor-pointer"
            >
              <option value="">No Collection</option>
              {collections.map(col => (
                <option key={col.collectionId} value={col.collectionId}>
                  {col.name}
                </option>
              ))}
            </select>

            {/* Quick Action Buttons: Mic recording */}
            {!isAudioRecording && !recordedAudioBlob && (
              <button
                type="button"
                onClick={() => setIsAudioRecording(true)}
                title="Record voice note"
                className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-nothing-dark hover:bg-nothing-hover border border-nothing-border text-xs font-mono text-nothing-light transition-colors"
              >
                <Mic size={14} className="text-nothing-red" />
                <span>Record Audio</span>
              </button>
            )}
          </div>

          {/* Status / Error notifications */}
          {statusText && (
            <div className="flex items-center gap-2 text-xs font-mono text-white/90 animate-pulse">
              <Loader2 size={13} className="animate-spin text-nothing-red" />
              <span>{statusText}</span>
            </div>
          )}

          {error && (
            <div className="p-2.5 rounded-lg bg-red-950/80 border border-red-800 text-xs font-mono text-red-200">
              {error}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between p-4 border-t border-nothing-border/60 bg-black/40">
          <div className="flex items-center gap-2 text-nothing-gray font-mono text-[11px] hidden sm:flex">
            <span>Press</span>
            <kbd className="px-1.5 py-0.5 rounded bg-nothing-dark border border-nothing-border text-white text-[10px]">
              Ctrl + Enter
            </kbd>
            <span>to save</span>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-3.5 py-2 rounded-lg text-xs font-mono text-nothing-gray hover:text-white transition-colors"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white hover:bg-neutral-200 text-black font-dot text-xs tracking-wider transition-all shadow-md font-semibold disabled:opacity-50 active:scale-95"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={13} className="animate-spin text-black" />
                  <span>SAVING...</span>
                </>
              ) : (
                <>
                  <Check size={14} strokeWidth={3} />
                  <span>SAVE NOTE</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

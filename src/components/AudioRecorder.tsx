import { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, Square, Trash2, Check, AlertCircle } from 'lucide-react';

interface AudioRecorderProps {
  onRecordingComplete: (blob: Blob, durationSec: number) => void;
  onCancel: () => void;
}

export default function AudioRecorder({ onRecordingComplete, onCancel }: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [hasRecorded, setHasRecorded] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Select supported mimeType
      const mimeTypes = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm', 'audio/mp4'];
      let selectedMime = '';
      for (const m of mimeTypes) {
        if (MediaRecorder.isTypeSupported(m)) {
          selectedMime = m;
          break;
        }
      }

      const recorder = selectedMime
        ? new MediaRecorder(stream, { mimeType: selectedMime })
        : new MediaRecorder(stream);

      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = event => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const mime = selectedMime || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: mime });
        setRecordedBlob(blob);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        setHasRecorded(true);
        setIsRecording(false);
      };

      recorder.start(250);
      setIsRecording(true);
      setRecordingTime(0);

      timerRef.current = window.setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.error('Microphone access denied:', err);
      setError('Microphone access denied or not available. Please check system permissions.');
      setIsRecording(false);
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    }
  }, [isRecording]);

  const handleCancel = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    onCancel();
  };

  const handleConfirm = () => {
    if (recordedBlob) {
      onRecordingComplete(recordedBlob, recordingTime || 1);
    }
  };

  // Start recording immediately when mounted
  useEffect(() => {
    startRecording();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [startRecording]);

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="w-full p-4 rounded-xl bg-nothing-dark border border-nothing-border flex flex-col gap-3">
      {error ? (
        <div className="flex items-center gap-2 text-xs text-nothing-red">
          <AlertCircle size={15} />
          <span>{error}</span>
          <button
            onClick={handleCancel}
            className="ml-auto text-xs font-mono text-nothing-gray hover:text-white"
          >
            DISMISS
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className={`w-2.5 h-2.5 rounded-full bg-nothing-red ${isRecording ? 'animate-ping' : ''}`} />
              <span className="font-dot text-xs tracking-wider text-white">
                {isRecording ? 'RECORDING VOICE MEMO...' : 'AUDIO READY'}
              </span>
            </div>
            <span className="font-mono text-sm font-semibold text-white">
              {formatSeconds(recordingTime)}
            </span>
          </div>

          {/* Dynamic waveform simulator */}
          <div className="h-10 flex items-center justify-center gap-1 px-4 bg-black/60 rounded-lg overflow-hidden">
            {Array.from({ length: 28 }).map((_, i) => {
              const height = isRecording
                ? Math.max(15, Math.sin((i + recordingTime * 3) * 0.7) * 90 + 20)
                : 20;
              return (
                <div
                  key={i}
                  style={{ height: `${height}%` }}
                  className={`w-1 rounded-full transition-all duration-150 ${
                    isRecording ? 'bg-nothing-red' : 'bg-nothing-border'
                  }`}
                />
              );
            })}
          </div>

          {/* Audio preview if stopped */}
          {hasRecorded && audioUrl && (
            <div className="w-full">
              <audio src={audioUrl} controls className="w-full h-8" />
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={handleCancel}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono text-nothing-gray hover:text-white hover:bg-nothing-hover transition-colors"
            >
              <Trash2 size={13} />
              <span>Cancel</span>
            </button>

            <div className="flex items-center gap-2">
              {isRecording ? (
                <button
                  type="button"
                  onClick={stopRecording}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-nothing-red hover:bg-nothing-red/80 text-white font-dot text-xs tracking-wider transition-all shadow-md active:scale-95"
                >
                  <Square size={13} fill="currentColor" />
                  <span>STOP</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleConfirm}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-white hover:bg-neutral-200 text-black font-dot text-xs tracking-wider transition-all shadow-md active:scale-95 font-semibold"
                >
                  <Check size={13} strokeWidth={3} />
                  <span>ATTACH AUDIO</span>
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

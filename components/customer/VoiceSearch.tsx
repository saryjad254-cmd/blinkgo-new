'use client';

import Mic from 'lucide-react/dist/esm/icons/mic';
import Loader2 from 'lucide-react/dist/esm/icons/loader-2';
import { useState } from 'react';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { cn } from '@/lib/cn';

interface Props {
  onResult?: (transcript: string) => void;
  className?: string;
  size?: 'sm' | 'md';
}

interface SpeechRecognitionErrorEventLike { error: string }
interface SpeechRecognitionResultEventLike { results: { [index: number]: { [index: number]: { transcript: string } } } }
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onresult: ((event: SpeechRecognitionResultEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
}
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;
type SpeechWindow = Window & { webkitSpeechRecognition?: SpeechRecognitionConstructor; SpeechRecognition?: SpeechRecognitionConstructor };

export function VoiceSearch({ onResult, className, size = 'md' }: Props) {
  const { t } = useI18n();
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function start() {
    const speechWindow = window as SpeechWindow;
    const SR = speechWindow.webkitSpeechRecognition || speechWindow.SpeechRecognition;
    if (!SR) {
      setError(t.nav.voiceNotSupported);
      setTimeout(() => setError(null), 3000);
      return;
    }

    const recognition = new SR();
    const lang = document.cookie.includes('blinkgo-locale=ar') ? 'ar-SA' : 'de-DE';
    recognition.lang = lang;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setListening(true);
      setError(null);
    };

    recognition.onerror = (event) => {
      setListening(false);
      if (event.error === 'no-speech') setError(t.nav.voiceNoSpeech);
      else setError(t.nav.voiceFailed);
      setTimeout(() => setError(null), 3000);
    };

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      onResult?.(transcript);
    };

    recognition.onend = () => setListening(false);

    try {
      recognition.start();
    } catch {
      setError(t.nav.voiceFailed);
      setTimeout(() => setError(null), 3000);
    }
  }

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        onClick={start}
        disabled={listening}
        aria-label={t.nav.voiceSearch}
        className={cn(
          "inline-flex items-center justify-center rounded-full transition-all",
          listening
            ? "bg-danger text-white animate-pulse"
            : "bg-surface-elevated text-text-secondary hover:text-brand-red-500 hover:bg-brand-red-500/10",
          size === 'sm' ? "w-9 h-9" : "w-11 h-11"
        )}
      >
        {listening ? (
          <Loader2 className={cn("animate-spin", size === 'sm' ? "w-3.5 h-3.5" : "w-4 h-4")} />
        ) : (
          <Mic className={cn(size === 'sm' ? "w-3.5 h-3.5" : "w-4 h-4")} />
        )}
      </button>
      {error && (
        <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 z-50 bg-danger text-white text-xs px-3 py-1.5 rounded-md whitespace-nowrap shadow-lg">
          {error}
        </div>
      )}
    </div>
  );
}

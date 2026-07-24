'use client';

import { Mic, MicOff, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { cn } from '@/lib/cn';

interface Props {
  onResult?: (transcript: string) => void;
  className?: string;
  size?: 'sm' | 'md';
}

export function VoiceSearch({ onResult, className, size = 'md' }: Props) {
  const { t } = useI18n();
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function start() {
    const SR = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
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

    recognition.onerror = (e: any) => {
      setListening(false);
      if (e.error === 'no-speech') setError(t.nav.voiceNoSpeech);
      else setError(t.nav.voiceFailed);
      setTimeout(() => setError(null), 3000);
    };

    recognition.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript;
      onResult?.(transcript);
    };

    recognition.onend = () => setListening(false);

    try {
      recognition.start();
    } catch (err) {
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
          size === 'sm' ? "w-7 h-7" : "w-9 h-9"
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

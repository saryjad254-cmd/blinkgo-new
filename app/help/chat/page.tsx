'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ChevronLeft, MessageCircle, Send, Loader2, User } from 'lucide-react';

const COPY = {
  de: {
    title: 'Live-Chat',
    subtitle: 'Wir antworten in wenigen Minuten',
    placeholder: 'Schreib deine Nachricht…',
    send: 'Senden',
    greeting: 'Hi! 👋 Wie können wir dir helfen?',
    autoReply: 'Danke für deine Nachricht. Ein Support-Agent antwortet dir in Kürze.',
  },
  ar: {
    title: 'الدردشة المباشرة',
    subtitle: 'سنرد عليك في دقائق',
    placeholder: 'اكتب رسالتك…',
    send: 'إرسال',
    greeting: 'مرحباً! 👋 كيف يمكننا مساعدتك؟',
    autoReply: 'شكراً لرسالتك. سيرد عليك أحد وكلاء الدعم قريباً.',
  },
  en: {
    title: 'Live chat',
    subtitle: 'We will respond within minutes',
    placeholder: 'Type your message…',
    send: 'Send',
    greeting: 'Hi! 👋 How can we help?',
    autoReply: 'Thanks for your message. A support agent will reply shortly.',
  },
};

export default function HelpChatPage() {
  const [locale, setLocale] = useState<'de' | 'ar' | 'en'>('de');
  const [messages, setMessages] = useState<{ from: 'me' | 'support'; text: string }[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      const m = document.cookie.split(';').find((c) => c.trim().startsWith('blinkgo-locale='));
      const v = m?.split('=')[1]?.trim();
      if (v === 'ar' || v === 'en' || v === 'de') setLocale(v);
    }
    setMessages([{ from: 'support', text: COPY.en.greeting }]);
  }, []);

  const t = COPY[locale];
  const dir = locale === 'ar' ? 'rtl' : 'ltr';

  function send() {
    if (!text.trim() || sending) return;
    setSending(true);
    const userMsg = { from: 'me' as const, text: text.trim() };
    setMessages((m) => [...m, userMsg]);
    setText('');
    // Simulated auto-reply
    setTimeout(() => {
      setMessages((m) => [...m, { from: 'support' as const, text: t.autoReply }]);
      setSending(false);
    }, 800);
  }

  return (
    <div className="min-h-screen bg-bg relative overflow-hidden flex flex-col" dir={dir}>
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-brand-red-500/10 blur-[120px]" />
      </div>

      <header className="relative border-b border-edge bg-bg-elevated/60 backdrop-blur-xl">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <Link href="/help" className="p-2 -ms-2 rounded-lg hover:bg-bg-elevated transition-colors">
            <ChevronLeft className="w-5 h-5 text-text-secondary rtl:rotate-180" />
          </Link>
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-red-500/20 to-brand-yellow-500/20 border border-brand-red-500/30 flex items-center justify-center">
            <MessageCircle className="w-5 h-5 text-brand-red-500" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-extrabold text-text">{t.title}</h1>
            <p className="text-xs text-text-muted">{t.subtitle}</p>
          </div>
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-success">
            <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
            Online
          </span>
        </div>
      </header>

      <main className="relative flex-1 max-w-2xl mx-auto w-full px-4 sm:px-6 py-4 flex flex-col">
        <div className="flex-1 overflow-y-auto space-y-3 mb-4">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex gap-2 ${msg.from === 'me' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.from === 'support' && (
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-brand-red-500 to-brand-red-700 flex items-center justify-center">
                  <User className="w-4 h-4 text-white" />
                </div>
              )}
              <div
                className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                  msg.from === 'me'
                    ? 'bg-gradient-to-br from-brand-red-500 to-brand-red-600 text-white rounded-br-sm'
                    : 'bg-bg-elevated border border-edge text-text rounded-bl-sm'
                }`}
              >
                {msg.text}
              </div>
            </div>
          ))}
        </div>

        <div className="sticky bottom-0 bg-bg/80 backdrop-blur-xl -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 border-t border-edge">
          <form
            onSubmit={(e) => { e.preventDefault(); send(); }}
            className="flex items-end gap-2"
          >
            <div className="flex-1 relative">
              <input
                type="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={t.placeholder}
                className="w-full px-4 py-3 rounded-2xl bg-bg-elevated border border-edge text-text placeholder:text-text-muted focus:border-brand-red-500 focus:ring-2 focus:ring-brand-red-500/20 focus:outline-none transition-all"
                style={{ color: '#FFFFFF', WebkitTextFillColor: '#FFFFFF' }}
              />
            </div>
            <button
              type="submit"
              disabled={!text.trim() || sending}
              className="flex-shrink-0 w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-red-500 to-brand-red-600 hover:from-brand-red-600 hover:to-brand-red-700 text-white flex items-center justify-center shadow-glow active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5 rtl:rotate-180" />}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}

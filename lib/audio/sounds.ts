/**
 * Sound utilities — uses Web Audio API for in-app notifications.
 * No external sound files needed (synthesized).
 */

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioContext) {
    try {
      audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch {
      return null;
    }
  }
  return audioContext;
}

/**
 * Play a short pleasant "ding" — for new orders, notifications, etc.
 */
export function playDing() {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(880, now);
  osc.frequency.exponentialRampToValueAtTime(1320, now + 0.08);

  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.25, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.5);
}

/**
 * Play an "alert" sound — for urgent notifications.
 */
export function playAlert() {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  for (let i = 0; i < 3; i++) {
    const start = now + i * 0.18;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(1200, start);
    osc.frequency.exponentialRampToValueAtTime(800, start + 0.1);

    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.15, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.12);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.13);
  }
}

/**
 * Play "success" sound — for successful actions.
 */
export function playSuccess() {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  // C-E-G chord arpeggio
  const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
  notes.forEach((freq, i) => {
    const start = now + i * 0.06;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, start);

    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.15, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.4);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.4);
  });
}

/**
 * Play "error" sound — for failed actions.
 */
export function playError() {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(220, now);
  osc.frequency.exponentialRampToValueAtTime(110, now + 0.2);

  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.15, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.3);
}

/**
 * Sound preferences (from localStorage).
 */
export function isSoundEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem('blinkgo-sound-enabled') !== 'false';
}

export function setSoundEnabled(enabled: boolean) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('blinkgo-sound-enabled', String(enabled));
}

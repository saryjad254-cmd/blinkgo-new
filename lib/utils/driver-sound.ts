/**
 * Audio cues for driver feedback.
 * Uses Web Audio API for distinct, low-latency tones — no asset downloads.
 *
 * Why tones instead of audio files:
 * - Zero bandwidth (no MP3/WAV to fetch)
 * - Works offline immediately
 * - No licensing or asset management
 * - Tunable for each event
 */

export type DriverSound = 'offer' | 'arrived' | 'pickup' | 'delivered' | 'warning' | 'success';

let audioContext: AudioContext | null = null;
let enabled = true;
let volume = 0.5;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioContext) {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return null;
    audioContext = new Ctx();
  }
  if (audioContext.state === 'suspended') {
    audioContext.resume().catch(() => {});
  }
  return audioContext;
}

export function setDriverSoundEnabled(value: boolean): void {
  enabled = value;
}

export function isDriverSoundEnabled(): boolean {
  return enabled;
}

export function setDriverSoundVolume(value: number): void {
  volume = Math.max(0, Math.min(1, value));
}

interface ToneSpec {
  freq: number; // Hz
  duration: number; // ms
  delay?: number; // ms after start
  type?: OscillatorType;
}

const SOUND_PATTERNS: Record<DriverSound, ToneSpec[]> = {
  offer: [
    { freq: 880, duration: 80, type: 'sine' },
    { freq: 1175, duration: 80, delay: 100, type: 'sine' },
  ],
  arrived: [
    { freq: 660, duration: 100, type: 'sine' },
    { freq: 880, duration: 100, delay: 130, type: 'sine' },
  ],
  pickup: [{ freq: 523, duration: 120, type: 'triangle' }],
  delivered: [
    { freq: 523, duration: 80, type: 'sine' },
    { freq: 659, duration: 80, delay: 100, type: 'sine' },
    { freq: 784, duration: 200, delay: 200, type: 'sine' },
  ],
  warning: [
    { freq: 440, duration: 80, type: 'square' },
    { freq: 440, duration: 80, delay: 120, type: 'square' },
  ],
  success: [
    { freq: 784, duration: 60, type: 'sine' },
    { freq: 988, duration: 100, delay: 80, type: 'sine' },
  ],
};

export function playDriverSound(sound: DriverSound): void {
  if (typeof window === 'undefined') return;
  if (!enabled) return;
  const ctx = getCtx();
  if (!ctx) return;
  const pattern = SOUND_PATTERNS[sound];
  const startTime = ctx.currentTime;
  pattern.forEach((tone, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = tone.type ?? 'sine';
    osc.frequency.value = tone.freq;
    const offset = (tone.delay ?? 0) / 1000;
    const dur = tone.duration / 1000;
    gain.gain.setValueAtTime(0, startTime + offset);
    gain.gain.linearRampToValueAtTime(volume * 0.3, startTime + offset + 0.01);
    gain.gain.linearRampToValueAtTime(0, startTime + offset + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startTime + offset);
    osc.stop(startTime + offset + dur + 0.05);
  });
}

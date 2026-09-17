/**
 * Soundtrack (DESIGN.md §3.7): three looping tracks chosen by run phase.
 *   main        — Lexicon screen and every non-boss phase
 *   boss-screen — BOSS_INTRO (reading the modifier, before pressing start)
 *   boss-battle — BOSS_PLAY (the timed round)
 * Browsers only allow playback after a user gesture; if the first play is
 * refused we retry on the next click or key press. Muting is persisted.
 */

import type { Phase } from '../engine';

export type Track = 'main' | 'boss-screen' | 'boss-battle';

const SRC: Record<Track, string> = { main: '/audio/main.mp3', 'boss-screen': '/audio/boss-screen.mp3', 'boss-battle': '/audio/boss-battle.mp3' };
const MUTE_KEY = 'morpheme.music.muted';

const players = new Map<Track, HTMLAudioElement>();
let current: Track | null = null;
let wanted: Track | null = null;
let muted = readMuted();
let gestureHooked = false;
const listeners = new Set<() => void>();

function readMuted(): boolean {
  try {
    return window.localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

function player(track: Track): HTMLAudioElement {
  let p = players.get(track);
  if (!p) {
    p = new Audio(SRC[track]);
    p.loop = true;
    p.preload = 'auto';
    p.volume = 0.5;
    players.set(track, p);
  }
  return p;
}

/** Which track a run phase wants (null run = the Lexicon screen). */
export function trackFor(phase: Phase | null): Track {
  if (phase === 'BOSS_INTRO') return 'boss-screen';
  if (phase === 'BOSS_PLAY') return 'boss-battle';
  return 'main';
}

function hookGesture(): void {
  if (gestureHooked || typeof window === 'undefined') return;
  gestureHooked = true;
  const resume = () => {
    window.removeEventListener('pointerdown', resume);
    window.removeEventListener('keydown', resume);
    gestureHooked = false;
    if (wanted) void start(wanted);
  };
  window.addEventListener('pointerdown', resume);
  window.addEventListener('keydown', resume);
}

async function start(track: Track): Promise<void> {
  if (muted) return;
  const p = player(track);
  try {
    await p.play();
    current = track;
    listeners.forEach((l) => l());
  } catch {
    // Autoplay refused until a user gesture: retry on the next one.
    hookGesture();
  }
}

/** Switch to `track` (restarting it from the top if it was not playing). */
export function play(track: Track): void {
  if (typeof window === 'undefined' || !('Audio' in window)) return;
  wanted = track;
  if (current === track && !player(track).paused) return;
  for (const [t, p] of players) {
    if (t !== track) {
      p.pause();
      p.currentTime = 0;
    }
  }
  current = null;
  void start(track);
}

export function stop(): void {
  for (const p of players.values()) {
    p.pause();
    p.currentTime = 0;
  }
  current = null;
  listeners.forEach((l) => l());
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(m: boolean): void {
  muted = m;
  try {
    window.localStorage.setItem(MUTE_KEY, m ? '1' : '0');
  } catch {
    /* ignore */
  }
  if (m) stop();
  else if (wanted) void start(wanted);
  listeners.forEach((l) => l());
}

export function nowPlaying(): Track | null {
  return current;
}

export function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

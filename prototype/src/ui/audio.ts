/**
 * Sound cue stub (P3-07): logs the cue id and plays a short Web Audio beep
 * keyed by rarity. Real cues are a production concern (DESIGN.md §3.7).
 */

import type { Rarity } from '../engine';

const FREQ: Record<Rarity, number> = { basic: 440, uncommon: 554, exotic: 659, relic: 880 };

let ctx: AudioContext | null = null;
let muted = false;

export function setMuted(m: boolean): void {
  muted = m;
}

export function isMuted(): boolean {
  return muted;
}

export function playCue(cueId: string, rarity: Rarity = 'basic'): void {
  console.log(`[cue] ${cueId} (${rarity})`);
  if (muted || typeof window === 'undefined' || !('AudioContext' in window)) return;
  try {
    ctx ??= new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = rarity === 'relic' ? 'triangle' : 'sine';
    osc.frequency.value = FREQ[rarity];
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
  } catch (e) {
    console.warn('cue failed', e);
  }
}

// Player preferences, remembered in localStorage.

import type { Difficulty } from '../sim/ai/commander';
import type { Quality } from '../render/renderer';

export interface Settings {
  difficulty: Difficulty;
  quality: Quality;
  map: string;
  /** Seed for the random map (shown to the player so a map can be replayed). */
  randomSeed: number;
}

const KEY = 'mivtza.settings';

export function defaultQuality(): Quality {
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  return coarse ? 'medium' : 'high';
}

export function loadSettings(): Settings {
  const base: Settings = { difficulty: 'medium', quality: defaultQuality(), map: 'twoShores', randomSeed: 1 + Math.floor(Math.random() * 9999) };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (raw && typeof raw === 'object') {
      if (['easy', 'medium', 'hard'].includes(raw.difficulty)) base.difficulty = raw.difficulty;
      if (['low', 'medium', 'high'].includes(raw.quality)) base.quality = raw.quality;
      if (typeof raw.map === 'string') base.map = raw.map;
      if (Number.isInteger(raw.randomSeed)) base.randomSeed = raw.randomSeed;
    }
  } catch {
    /* storage unavailable or corrupt: use defaults */
  }
  return base;
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

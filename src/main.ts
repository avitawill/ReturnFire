import './styles.css';
import { Game } from './app/game';
import { he } from './i18n/he';
import type { Quality } from './render/renderer';
import { loadModels } from './render/models';

document.title = he.docTitle;
const root = document.getElementById('game')!;

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

if (!webglAvailable()) {
  root.innerHTML = '';
  const m = document.createElement('div');
  m.className = 'menu';
  const sheet = document.createElement('div');
  sheet.className = 'sheet';
  const h = document.createElement('h1');
  h.textContent = he.webglMissingTitle;
  const p = document.createElement('p');
  p.textContent = he.webglMissingBody;
  sheet.append(h, p);
  m.append(sheet);
  root.append(m);
} else {
  const params = new URLSearchParams(location.search);
  const seed = params.has('seed') ? Number(params.get('seed')) : undefined;
  const q = params.get('quality');
  const quality = q === 'low' || q === 'medium' || q === 'high' ? (q as Quality) : undefined;
  const d = params.get('difficulty');
  const difficulty = d === 'easy' || d === 'medium' || d === 'hard' ? d : undefined;
  const map = params.get('map') ?? undefined;
  const play = params.get('play');
  const autostart = play === '1' ? 1 : play === '2' ? 2 : undefined;
  const speed = params.has('speed') ? Math.min(16, Math.max(0.25, Number(params.get('speed')) || 1)) : undefined;
  loadModels().then(() => {
    const game = new Game(root, { seed, quality, difficulty, map, autostart, speed });
    game.start();
    // Test and debugging hook (read-only use by Playwright).
    (window as unknown as { __mivtza: Game }).__mivtza = game;
  });
}

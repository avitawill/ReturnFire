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
  loadModels().then(() => {
    const game = new Game(root, { seed, quality });
    game.start();
    // Test and debugging hook (read-only use by Playwright).
    (window as unknown as { __mivtza: Game }).__mivtza = game;
  });
}

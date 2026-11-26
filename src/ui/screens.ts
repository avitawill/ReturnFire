// Full-screen overlays: main menu, settings and pause.

import { he } from '../i18n/he';
import { MAP_NAMES } from '../sim/maps';

export interface MainMenuState {
  map: string;
  randomSeed: number;
  difficulty: string;
  pads: number;
}

export interface ScreenCallbacks {
  start(players: 1 | 2): void;
  setMap(map: string): void;
  reroll(): void;
  setDifficulty(d: string): void;
  openSettings(): void;
  closeSettings(): void;
  setQuality(q: string): void;
  setVolume(k: 'master' | 'music' | 'sfx', v: number): void;
  setMuted(m: boolean): void;
  resume(): void;
  quit(): void;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = '') => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};

function segmented(label: string, options: Record<string, string>, onPick: (k: string) => void) {
  const wrap = el('div', 'field');
  const lab = el('p', 'label', label);
  const row = el('div', 'seg');
  row.setAttribute('role', 'radiogroup');
  row.setAttribute('aria-label', label);
  const buttons: Record<string, HTMLButtonElement> = {};
  for (const [k, text] of Object.entries(options)) {
    const b = el('button', '', text);
    b.type = 'button';
    b.dataset.value = k;
    b.setAttribute('role', 'radio');
    b.addEventListener('click', () => onPick(k));
    row.append(b);
    buttons[k] = b;
  }
  wrap.append(lab, row);
  const set = (k: string) => {
    for (const [key, b] of Object.entries(buttons)) b.setAttribute('aria-checked', String(key === k));
  };
  return { wrap, set, buttons };
}

export class Screens {
  readonly root: HTMLDivElement;
  private main: HTMLDivElement;
  private settings: HTMLDivElement;
  private pause: HTMLDivElement;
  private mapSeg: ReturnType<typeof segmented>;
  private diffSeg: ReturnType<typeof segmented>;
  private qualSeg: ReturnType<typeof segmented>;
  private seedLine: HTMLParagraphElement;
  private reroll: HTMLButtonElement;
  private seedRow!: HTMLDivElement;
  private padsLine: HTMLParagraphElement;
  private sliders: Record<'master' | 'music' | 'sfx', HTMLInputElement>;
  private mute: HTMLInputElement;
  private cb: ScreenCallbacks;
  /** Where "back" in settings returns to. */
  private settingsFrom: 'main' | 'pause' = 'main';

  constructor(parent: HTMLElement, cb: ScreenCallbacks) {
    this.cb = cb;
    this.root = el('div', 'screens');
    parent.append(this.root);

    // Main menu.
    this.main = el('div', 'menu screen main');
    const sheet = el('div', 'sheet');
    const actions = el('div', 'actions');
    const single = el('button', 'primary', he.main.single);
    single.type = 'button';
    single.dataset.action = 'single';
    single.addEventListener('click', () => cb.start(1));
    const two = el('button', 'primary alt', he.main.two);
    two.type = 'button';
    two.dataset.action = 'two';
    two.addEventListener('click', () => cb.start(2));
    actions.append(single, two);
    this.mapSeg = segmented(he.main.map, Object.fromEntries([...MAP_NAMES, 'random'].map((m) => [m, he.main.maps[m]])), (m) => cb.setMap(m));
    this.seedLine = el('p', 'note');
    this.reroll = el('button', 'ghost', he.main.reroll);
    this.reroll.type = 'button';
    this.reroll.addEventListener('click', () => cb.reroll());
    const seedRow = el('div', 'row');
    seedRow.append(this.seedLine, this.reroll);
    this.seedRow = seedRow;
    this.mapSeg.wrap.append(seedRow);
    this.diffSeg = segmented(he.main.difficulty, he.main.difficulties, (d) => cb.setDifficulty(d));
    const foot = el('div', 'foot');
    this.padsLine = el('p', '');
    const settingsBtn = el('button', 'ghost', he.main.settings);
    settingsBtn.type = 'button';
    settingsBtn.addEventListener('click', () => {
      this.settingsFrom = 'main';
      cb.openSettings();
    });
    foot.append(this.padsLine, settingsBtn);
    sheet.append(el('p', 'eyebrow', he.main.eyebrow), el('h1', '', he.title), el('p', '', he.main.body), actions, this.mapSeg.wrap, this.diffSeg.wrap, el('p', 'small', he.main.twoControls), foot);
    this.main.append(sheet);

    // Settings.
    this.settings = el('div', 'menu screen settings');
    const ss = el('div', 'sheet');
    this.qualSeg = segmented(he.settings.quality, he.settings.qualities, (q) => cb.setQuality(q));
    this.qualSeg.wrap.append(el('p', 'small', he.settings.qualityNote));
    const vol = el('div', 'field');
    vol.append(el('p', 'label', he.settings.volume));
    const mk = (k: 'master' | 'music' | 'sfx', label: string) => {
      const row = el('label', 'slider');
      const span = el('span', '', label);
      const input = el('input');
      input.type = 'range';
      input.min = '0';
      input.max = '100';
      input.dataset.volume = k;
      input.addEventListener('input', () => cb.setVolume(k, Number(input.value) / 100));
      row.append(span, input);
      vol.append(row);
      return input;
    };
    this.sliders = { master: mk('master', he.settings.master), music: mk('music', he.settings.music), sfx: mk('sfx', he.settings.effects) };
    const muteRow = el('label', 'check');
    this.mute = el('input');
    this.mute.type = 'checkbox';
    this.mute.dataset.setting = 'mute';
    this.mute.addEventListener('change', () => cb.setMuted(this.mute.checked));
    muteRow.append(this.mute, el('span', '', he.settings.mute));
    vol.append(muteRow);
    const back = el('button', 'primary', he.settings.back);
    back.type = 'button';
    back.addEventListener('click', () => cb.closeSettings());
    ss.append(el('h1', '', he.settings.title), this.qualSeg.wrap, vol, back);
    this.settings.append(ss);

    // Pause.
    this.pause = el('div', 'menu screen pause');
    const ps = el('div', 'sheet');
    const resume = el('button', 'primary', he.pause.resume);
    resume.type = 'button';
    resume.dataset.action = 'resume';
    resume.addEventListener('click', () => cb.resume());
    const pset = el('button', 'ghost', he.main.settings);
    pset.type = 'button';
    pset.addEventListener('click', () => {
      this.settingsFrom = 'pause';
      cb.openSettings();
    });
    const quit = el('button', 'ghost', he.pause.quit);
    quit.type = 'button';
    quit.dataset.action = 'quit';
    quit.addEventListener('click', () => cb.quit());
    const pa = el('div', 'actions');
    pa.append(resume, pset, quit);
    ps.append(el('h1', '', he.pause.title), el('p', 'small', he.pause.hint), pa);
    this.pause.append(ps);

    this.root.append(this.main, this.settings, this.pause);
    this.hideAll();
  }

  hideAll() {
    this.main.hidden = true;
    this.settings.hidden = true;
    this.pause.hidden = true;
  }

  get open(): 'main' | 'settings' | 'pause' | null {
    if (!this.main.hidden) return 'main';
    if (!this.settings.hidden) return 'settings';
    if (!this.pause.hidden) return 'pause';
    return null;
  }

  get returnTo() {
    return this.settingsFrom;
  }

  showMain(st: MainMenuState) {
    this.hideAll();
    this.main.hidden = false;
    this.updateMain(st);
    (this.main.querySelector('[data-action=single]') as HTMLButtonElement).focus({ preventScroll: true });
  }

  updateMain(st: MainMenuState) {
    this.mapSeg.set(st.map);
    this.diffSeg.set(st.difficulty);
    this.seedLine.textContent = st.map === 'random' ? he.main.randomSeed(st.randomSeed) : '';
    this.seedRow.hidden = st.map !== 'random';
    this.padsLine.textContent = he.main.padsFound(st.pads);
  }

  showSettings(quality: string, volumes: { master: number; music: number; sfx: number }, muted: boolean) {
    this.hideAll();
    this.settings.hidden = false;
    this.qualSeg.set(quality);
    for (const k of ['master', 'music', 'sfx'] as const) this.sliders[k].value = String(Math.round(volumes[k] * 100));
    this.mute.checked = muted;
    (this.settings.querySelector('.seg button[aria-checked=true]') as HTMLButtonElement | null)?.focus({ preventScroll: true });
  }

  setQuality(q: string) {
    this.qualSeg.set(q);
  }

  showPause() {
    this.hideAll();
    this.pause.hidden = false;
    (this.pause.querySelector('[data-action=resume]') as HTMLButtonElement).focus({ preventScroll: true });
  }

  /** Visible buttons of the open screen, for gamepad navigation. */
  buttons(): HTMLElement[] {
    const scr = [this.main, this.settings, this.pause].find((s) => !s.hidden);
    if (!scr) return [];
    return [...scr.querySelectorAll<HTMLElement>('button, input')].filter((b) => !(b as HTMLButtonElement).disabled && b.offsetParent !== null);
  }
}

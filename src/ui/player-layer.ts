// Everything drawn over one player's viewport: HUD, minimap, messages, touch
// controls and the vehicle bay.

import { he } from '../i18n/he';
import { TouchDevice } from '../input/touch';
import { otherSide, type GameState, type Side } from '../sim/entities';
import type { SimEvent } from '../sim/events';
import { VEHICLES, VEHICLE_TYPES, type VehicleType } from '../sim/tuning';
import { drawVehicleIcon } from './icons';
import { Minimap } from './minimap';

export type BayMode = 'start' | 'dock' | 'lost' | 'win' | 'lose';

export interface LayerCallbacks {
  select(t: VehicleType): void;
  again(): void;
  toMenu(): void;
  toggleSound(): boolean;
}

export class PlayerLayer {
  readonly el: HTMLDivElement;
  readonly side: Side;
  readonly touch: TouchDevice;
  readonly minimap: Minimap;
  private hud: HTMLDivElement;
  private name: HTMLHeadingElement;
  private hp: HTMLElement;
  private fuel: HTMLElement;
  private ammo: HTMLElement;
  private toast: HTMLDivElement;
  private toastT = 0;
  private menu: HTMLDivElement;
  private eyebrow: HTMLParagraphElement;
  private title: HTMLHeadingElement;
  private body: HTMLParagraphElement;
  private note: HTMLParagraphElement;
  private cards: HTMLDivElement;
  private cardEls = {} as Record<VehicleType, { b: HTMLButtonElement; n: HTMLSpanElement }>;
  private again: HTMLButtonElement;
  private toMenu: HTMLButtonElement;
  private sound: HTMLButtonElement;
  private help: HTMLParagraphElement;
  readonly players: 1 | 2;
  private endRow!: HTMLDivElement;
  private cb: LayerCallbacks;
  mode: BayMode | null = null;
  /** Name of the last lost vehicle and how, for the "lost" bay. */
  lost: { type: VehicleType; cause: 'destroyed' | 'drowned' | 'fuel' } | null = null;

  constructor(parent: HTMLElement, side: Side, cb: LayerCallbacks, players: 1 | 2 = 1) {
    this.side = side;
    this.cb = cb;
    this.players = players;
    this.el = document.createElement('div');
    this.el.className = 'layer';
    this.el.dataset.side = String(side);
    parent.append(this.el);

    this.touch = new TouchDevice(this.el);

    this.hud = div('hud');
    this.hud.hidden = true;
    const stat = div('stat');
    this.name = document.createElement('h2');
    const meters = div('meters');
    const bar = () => {
      const b = div('bar');
      const i = document.createElement('i');
      b.append(i);
      return { b, i };
    };
    const hp = bar();
    const fu = bar();
    this.hp = hp.i;
    this.fuel = fu.i;
    this.ammo = document.createElement('span');
    this.ammo.className = 'ammo';
    meters.append(span(he.hud.armour), hp.b, span(he.hud.fuel), fu.b, span(he.hud.ammo), this.ammo);
    stat.append(this.name, meters);
    this.minimap = new Minimap(side);
    this.hud.append(stat, this.minimap.canvas);
    this.el.append(this.hud);

    this.toast = div('toast');
    this.toast.setAttribute('role', 'status');
    this.toast.setAttribute('aria-live', 'polite');
    this.el.append(this.toast);

    this.menu = div('menu');
    const sheet = div('sheet');
    this.eyebrow = p('eyebrow');
    this.title = document.createElement('h1');
    this.body = p('');
    this.note = p('note');
    this.cards = div('cards');
    for (const t of VEHICLE_TYPES) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'card';
      b.dataset.vehicle = t;
      const ic = document.createElement('canvas');
      ic.width = 112;
      ic.height = 88;
      const c = ic.getContext('2d')!;
      c.setTransform(2.4, 0, 0, 2.4, 56, 44);
      drawVehicleIcon(c, t);
      const nm = document.createElement('b');
      nm.textContent = he.vehicles[t].name;
      const n = document.createElement('span');
      nm.append(n);
      const sm = document.createElement('small');
      sm.textContent = he.vehicles[t].role;
      b.append(ic, nm, sm);
      b.addEventListener('click', () => this.cb.select(t));
      this.cards.append(b);
      this.cardEls[t] = { b, n };
    }
    this.again = document.createElement('button');
    this.again.type = 'button';
    this.again.className = 'primary';
    this.again.textContent = he.menu.again;
    this.again.addEventListener('click', () => this.cb.again());
    this.toMenu = document.createElement('button');
    this.toMenu.type = 'button';
    this.toMenu.className = 'ghost';
    this.toMenu.textContent = he.menu.toMenu;
    this.toMenu.addEventListener('click', () => this.cb.toMenu());
    const endRow = div('actions');
    endRow.append(this.again, this.toMenu);
    const foot = div('foot');
    const help = p('');
    help.textContent = he.menu.help;
    this.help = help;
    this.sound = document.createElement('button');
    this.sound.type = 'button';
    this.sound.className = 'ghost';
    this.sound.dataset.action = 'sound';
    this.sound.textContent = he.menu.soundOn;
    this.sound.setAttribute('aria-pressed', 'true');
    this.sound.addEventListener('click', () => this.setSound(this.cb.toggleSound()));
    foot.append(help, this.sound);
    sheet.append(this.eyebrow, this.title, this.body, this.note, this.cards, endRow, foot);
    this.endRow = endRow;
    this.menu.append(sheet);
    this.el.append(this.menu);
    this.menu.hidden = true;
  }

  setSound(on: boolean) {
    this.sound.textContent = on ? he.menu.soundOn : he.menu.soundOff;
    this.sound.setAttribute('aria-pressed', String(on));
  }

  setRect(x: number, y: number, w: number, h: number) {
    Object.assign(this.el.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
  }

  say(text: string, sec = 3) {
    this.toast.textContent = text;
    this.toast.classList.add('on');
    this.toastT = sec;
  }

  openBay(mode: BayMode, s: GameState, extra?: { time?: number; reason?: 'flagCaptured' | 'noJeeps'; winner?: Side }) {
    this.mode = mode;
    const end = mode === 'win' || mode === 'lose';
    const m = he.menu;
    let eyebrow = '';
    let title = '';
    let body = '';
    const two = this.players === 2;
    if (mode === 'start') {
      eyebrow = two ? he.player(this.side + 1) : m.startEyebrow;
      title = two ? m.dockTitle : he.title;
      body = m.startBody;
    } else if (mode === 'dock') {
      eyebrow = m.dockEyebrow;
      title = m.dockTitle;
      body = m.dockBody;
    } else if (mode === 'lost') {
      eyebrow = m.lostEyebrow;
      title = this.lost ? he.lostTitle(he.vehicles[this.lost.type].name, this.lost.cause) : m.dockTitle;
      body = m.lostBody;
    } else if (mode === 'win') {
      eyebrow = two ? `${he.player(this.side + 1)} · ${m.winEyebrow}` : m.winEyebrow;
      title = two ? m.winOther(this.side + 1) : m.winTitle;
      body = m.winBody(he.time(extra?.time ?? s.time));
    } else {
      eyebrow = two ? `${he.player(this.side + 1)} · ${m.loseEyebrow}` : m.loseEyebrow;
      title = two && extra?.winner !== undefined ? m.winOther(extra.winner + 1) : m.loseTitle;
      body = extra?.reason === 'noJeeps' ? m.loseJeeps : m.loseFlag;
    }
    this.eyebrow.textContent = eyebrow;
    this.title.textContent = title;
    this.body.textContent = body;
    const foeFlag = s.flags[otherSide(this.side)];
    this.note.hidden = end || mode === 'start';
    this.note.textContent = foeFlag.state === 'ground' ? m.flagExposed : m.towersLeft(s.sides[otherSide(this.side)].towersLeft);
    this.cards.hidden = end;
    this.endRow.hidden = !end;
    this.help.hidden = two;
    const stock = s.sides[this.side].stock;
    for (const t of VEHICLE_TYPES) {
      this.cardEls[t].n.textContent = m.stock(stock[t]);
      this.cardEls[t].b.disabled = stock[t] < 1;
    }
    this.menu.classList.toggle('end', mode === 'lose');
    this.menu.hidden = false;
    this.hud.hidden = true;
    this.touch.setVisible(false);
    this.toast.classList.remove('on');
    const first = end ? this.again : VEHICLE_TYPES.map((t) => this.cardEls[t].b).find((b) => !b.disabled);
    first?.focus({ preventScroll: true });
  }

  closeBay(s: GameState) {
    this.mode = null;
    this.menu.hidden = true;
    this.hud.hidden = false;
    this.touch.setVisible(true);
    const v = s.sides[this.side].vehicle;
    if (v) this.name.textContent = he.vehicles[v.type].name;
  }

  get bayOpen() {
    return !this.menu.hidden;
  }

  /** Buttons in the bay, for gamepad navigation. */
  bayButtons(): HTMLButtonElement[] {
    if (this.menu.hidden) return [];
    return [...this.menu.querySelectorAll('button')].filter((b) => !b.hidden && !b.disabled && b.offsetParent !== null) as HTMLButtonElement[];
  }

  /** Messages from the player's point of view. */
  onEvent(e: SimEvent, s: GameState) {
    const me = this.side;
    const msg = he.msg;
    switch (e.type) {
      case 'flagRevealed':
        this.say(e.side === me ? msg.ourFlagRevealed : msg.flagRevealed, 5);
        break;
      case 'towerEmpty':
        if (e.side !== me) this.say(msg.towerEmpty(e.towersLeft), 3.5);
        break;
      case 'flagTaken':
        this.say(e.by === me ? msg.flagTaken : msg.ourFlagTaken, 5);
        break;
      case 'flagDropped':
        this.say(e.side === me ? msg.ourFlagDropped : msg.flagDropped, 3);
        break;
      case 'fuelLow':
        if (e.side === me) this.say(msg.fuelLow, 3);
        break;
      case 'sinking':
        if (e.side === me) this.say(msg.sinking(he.vehicles[e.vehicle].name), 2);
        break;
      case 'vehicleLost':
        if (e.side === me) {
          this.lost = { type: e.vehicle, cause: e.cause };
          if (e.cause === 'fuel') this.say(msg.heliNoFuel, 3);
        }
        break;
      case 'vehicleSpawned':
        if (e.side === me && s.time < 2) this.say(msg.intro(s.sides[me].padX < s.sides[otherSide(me)].padX), 5);
        break;
    }
  }

  update(dt: number, s: GameState, time: number) {
    if (this.toastT > 0) {
      this.toastT -= dt;
      if (this.toastT <= 0) this.toast.classList.remove('on');
    }
    const v = s.sides[this.side].vehicle;
    if (!v && !this.hud.hidden) {
      this.hud.hidden = true;
      this.touch.setVisible(false);
    }
    if (!v || this.hud.hidden) return;
    const spec = VEHICLES[v.type];
    this.hp.style.transform = `scaleX(${Math.max(0, v.hp / spec.hp)})`;
    this.hp.className = v.hp < spec.hp * 0.3 ? 'low' : '';
    this.fuel.style.transform = `scaleX(${Math.max(0, v.fuel / spec.fuel)})`;
    this.fuel.className = v.fuel < spec.fuel * 0.25 ? 'low' : '';
    this.ammo.textContent = String(v.ammo);
    this.touch.setMines(v.type === 'launcher' ? v.mines : null);
    this.minimap.draw(s, time);
  }
}

function div(cls: string) {
  const d = document.createElement('div');
  if (cls) d.className = cls;
  return d;
}
function p(cls: string) {
  const e = document.createElement('p');
  if (cls) e.className = cls;
  return e;
}
function span(t: string) {
  const e = document.createElement('span');
  e.textContent = t;
  return e;
}

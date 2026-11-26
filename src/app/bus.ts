import type { SimEvent } from '../sim/events';

export type Listener = (events: readonly SimEvent[]) => void;

/** Fan-out of sim events to render, audio and UI. */
export class EventBus {
  private listeners: Listener[] = [];

  on(fn: Listener): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  emit(events: readonly SimEvent[]) {
    if (!events.length) return;
    for (const l of this.listeners) l(events);
  }

  clear() {
    this.listeners = [];
  }
}

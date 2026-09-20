// Tiny event bus: decouples match logic, renderer, UI, audio and future services (ads, IAP, multiplayer).
const handlers = new Map();
export const bus = {
  on(evt, fn) { (handlers.get(evt) || handlers.set(evt, new Set()).get(evt)).add(fn); return () => handlers.get(evt).delete(fn); },
  emit(evt, data) { (handlers.get(evt) || []).forEach(fn => fn(data)); },
};

/**
 * Tracks open popup layers (modals, confirmations, F4 value-help popups) in
 * opening order so that keyboard handling (Esc, Tab focus trap) only ever
 * applies to the top-most layer. Without this, every open modal reacted to
 * the same key press and lower modals stole focus from popups above them.
 */
const layers = [];
let counter = 0;

export function createLayerId(prefix = 'layer') {
  counter += 1;
  return `${prefix}-${counter}`;
}

export function pushLayer(id) {
  if (!layers.includes(id)) layers.push(id);
}

export function popLayer(id) {
  const idx = layers.lastIndexOf(id);
  if (idx !== -1) layers.splice(idx, 1);
}

export function isTopLayer(id) {
  return layers.length > 0 && layers[layers.length - 1] === id;
}

import { raw } from '../html.js';

// Simple 24px stroke icons drawn for this app. Colour follows the surrounding text.
const P = {
  search: '<circle cx="11" cy="11" r="7"/><path d="M16.5 16.5L21 21"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  shield: '<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/><path d="M9 12l2 2 4-4"/>',
  truck: '<path d="M3 7h11v9H3z"/><path d="M14 10h4l3 3v3h-7"/><circle cx="7" cy="18" r="1.8"/><circle cx="17" cy="18" r="1.8"/>',
  rupee: '<path d="M7 5h10M7 9h10"/><path d="M8 5c4.5 0 6.5 1.5 6.5 4s-2 4-6.5 4h-1l8 7"/>',
  box: '<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>',
  tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  star: '<path d="M12 3l2.8 5.9 6.2.7-4.6 4.3 1.3 6.1L12 16.9 6.3 20l1.3-6.1L3 9.6l6.2-.7z"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  bell: '<path d="M6 16v-5a6 6 0 1 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 17l.7 1.8 1.8.7-1.8.7L19 22l-.7-1.8-1.8-.7 1.8-.7z"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',
  clipboard: '<path d="M9 4h6v3H9z"/><path d="M7 5H5v16h14V5h-2"/><path d="M9 13l2 2 4-4"/>',
  leaf: '<path d="M5 19c0-8 6-14 15-14 0 9-6 15-14 15"/><path d="M5 19l7-7"/>',
  handshake: '<path d="M3 12l4-4 4 2 3-2 4 1 3 3"/><path d="M7 8v6l4 4 2-1 3 2 4-4"/>',
  wallet: '<path d="M4 7h15v12H4z"/><path d="M4 7l11-3v3"/><circle cx="15.5" cy="13" r="1.2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  alert: '<path d="M12 3l9 16H3z"/><path d="M12 10v4M12 17h.01"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  // category icons
  sanitaryware: '<path d="M6 4h5v7H6z"/><path d="M4 11h15a4 4 0 0 1-4 4H9l1 5H6l1-5"/>',
  cp_fittings: '<path d="M4 10h9a3 3 0 0 1 3 3v2"/><path d="M7 6h7M10.5 6v4"/><path d="M16 18v2"/>',
  lights: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.8.6 1.5 1.6 1.5 2.6V17h4v-.5c0-1 .7-2 1.5-2.6A6 6 0 0 0 12 3z"/>',
  electrical: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  doors: '<path d="M6 21V3h12v18"/><path d="M3 21h18"/><path d="M14.5 12h.01"/>',
  plywood: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  office_furniture: '<path d="M7 3h10v8H7z"/><path d="M5 11h14v3H5z"/><path d="M7 14v7M17 14v7"/>',
  tiles: '<path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/>',
  stone: '<path d="M6 3h12l3 6-9 12L3 9z"/><path d="M3 9h18"/>',
};

export function icon(name, cls = 'icon') {
  return raw(
    `<svg class="${cls}" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || P.box}</svg>`
  );
}

// Tiny auto-escaping HTML template helper. Interpolated values are escaped
// unless they came from another html`` call (or raw()).
class Raw {
  constructor(s) {
    this.s = s;
  }
  toString() {
    return this.s;
  }
}

export const raw = (s) => new Raw(s);

export function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function render(v) {
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(render).join('');
  if (v === null || v === undefined || v === false) return '';
  return esc(v);
}

export function html(strings, ...vals) {
  let out = '';
  strings.forEach((s, i) => {
    out += s;
    if (i < vals.length) out += render(vals[i]);
  });
  return new Raw(out);
}

export const inr = (n) => '₹' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n);

// Timestamps are stored in UTC ('YYYY-MM-DD HH:MM:SS'). Show them in the marketplace's local time.
export const DISPLAY_TZ = process.env.DISPLAY_TZ || 'Asia/Kolkata';
const asDate = (ts) => new Date(String(ts).replace(' ', 'T') + (String(ts).length <= 19 ? 'Z' : ''));
const fmtDate = new Intl.DateTimeFormat('en-IN', { timeZone: DISPLAY_TZ, day: 'numeric', month: 'short', year: 'numeric' });
const fmtTime = new Intl.DateTimeFormat('en-IN', { timeZone: DISPLAY_TZ, day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });
/** "22 Oct 2026" */
export const localDate = (ts) => (ts ? fmtDate.format(asDate(ts)) : '');
/** "22 Oct, 12:06 pm" */
export const localTime = (ts) => (ts ? fmtTime.format(asDate(ts)) : '');
/** Today's date (YYYY-MM-DD) in the display time zone, offset by whole days. */
export const localDay = (daysAgo = 0) => new Intl.DateTimeFormat('en-CA', { timeZone: DISPLAY_TZ }).format(new Date(Date.now() - daysAgo * 86400000));

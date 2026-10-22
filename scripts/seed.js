// Demo data for local development and demos:  node scripts/seed.js
// Creates a seller, a buyer and an inspector, ten lots across categories with drawn placeholder photos,
// an accepted enquiry with a rating, a part-sold lot and a verified lot. Safe to run once per database.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { openDb } from '../src/db.js';
import { loadConfig } from '../src/config.js';

const config = loadConfig();
const db = openDb(config.dbPath);
fs.mkdirSync(config.uploadDir, { recursive: true });

if (db.prepare('SELECT COUNT(*) n FROM listings').get().n > 0) {
  console.log('This database already has lots; seed skipped. Delete the data folder to start fresh.');
  process.exit(0);
}

// ---------- tiny PNG writer ----------
const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc = (buf) => { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};
function png(w, h, px) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const [r, g, b] = px(x, y);
      const o = y * (w * 3 + 1) + 1 + x * 3;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
const mix = (a, b, t) => a.map((v, i) => clamp(v + (b[i] - v) * t));

// Simple drawn "photos" so the demo looks like a real catalogue rather than flat colours.
const DRAW = {
  tiles: (x, y, v) => { const g = (x + v * 13) % 80 < 3 || (y + v * 7) % 80 < 3; const base = mix([196, 204, 200], [232, 236, 233], (x + y) / 840); return g ? [250, 250, 248] : mix(base, [180, 190, 186], Math.sin(x * 0.05 + y * 0.03) * 0.15 + 0.15); },
  stone: (x, y, v) => { const vein = Math.abs(Math.sin(x * 0.02 + Math.sin(y * 0.03 + v) * 2.2 + y * 0.008)); return vein < 0.05 ? [150, 150, 155] : mix([244, 243, 240], [222, 220, 216], Math.sin(y * 0.01 + x * 0.004) * 0.5 + 0.5); },
  plywood: (x, y, v) => { const t = Math.sin(y * 0.18 + Math.sin(x * 0.015 + v) * 3) * 0.5 + 0.5; return mix([196, 148, 96], [226, 186, 132], t); },
  lights: (x, y, v) => { let glow = 0; for (const [cx, cy] of [[120, 120], [360, 120], [120, 260], [360, 260]]) { const d = Math.hypot(x - cx - v * 4, y - cy); glow += Math.max(0, 1 - d / 70); } return mix([40, 46, 54], [255, 246, 214], Math.min(1, glow)); },
  sanitaryware: (x, y, v) => { const d = ((x - 240) / 120) ** 2 + ((y - 190 - v * 3) / 95) ** 2; return d < 1 ? mix([252, 252, 252], [220, 226, 232], d) : mix([150, 176, 190], [196, 214, 222], y / 360); },
  cp_fittings: (x, y, v) => { const band = Math.abs(y - 180 - v * 5) < 40 && x > 60 && x < 420; return band ? mix([150, 156, 164], [246, 248, 250], 1 - Math.abs(y - 180) / 40) : mix([70, 80, 90], [110, 120, 128], x / 480); },
  electrical: (x, y, v) => { const inPlate = (x % 160) > 30 && (x % 160) < 130 && y > 110 && y < 250; const inSw = inPlate && (x % 160) > 65 && (x % 160) < 95 && y > 150 && y < 210; return inSw ? [210, 214, 218] : inPlate ? [248, 248, 246] : mix([120, 126, 132], [160, 166, 170], (y + v * 9) / 360); },
  doors: (x, y, v) => { const panel = (x > 150 && x < 330) && ((y > 40 && y < 160) || (y > 190 && y < 320)); const frame = x > 130 && x < 350 && y > 20; return panel ? mix([120, 74, 40], [150, 98, 56], Math.sin(y * 0.2 + v) * 0.5 + 0.5) : frame ? [102, 62, 34] : mix([226, 220, 210], [240, 236, 228], y / 360); },
  office_furniture: (x, y, v) => { const seat = Math.abs(x - 240) < 90 && y > 170 && y < 220; const back = Math.abs(x - 240) < 70 && y > 50 && y < 170; const leg = Math.abs(x - 240) < 6 && y > 220 && y < 320; return seat || back ? mix([34, 40, 48], [64, 72, 84], (x + v * 20) / 480) : leg ? [90, 94, 100] : mix([236, 238, 240], [214, 218, 222], y / 360); },
};
function photo(category, variant) {
  const draw = DRAW[category] || DRAW.tiles;
  return png(480, 360, (x, y) => draw(x, y, variant));
}

// ---------- people ----------
const user = (phone, name, role, city, intent) => {
  db.prepare('INSERT OR IGNORE INTO users (phone, name, role, city, intent, onboarded) VALUES (?,?,?,?,?,1)').run(phone, name, role, city, intent);
  return db.prepare('SELECT id FROM users WHERE phone = ?').get(phone).id;
};
const seller = user('+919000000010', 'Demo Fit-out Co', 'member', 'Gurugram', 'sell');
const seller2 = user('+919000000012', 'Kapoor Interiors', 'member', 'Noida', 'sell');
const buyer = user('+919000000011', 'Demo Contractor', 'member', 'Gurugram', 'buy');
const inspector = user('+919000000013', 'Ira (Inspector)', 'inspector', 'Gurugram', 'both');

// ---------- lots ----------
const lots = [
  [seller, '12 Jaquar wall-hung WCs, white', 'sanitaryware', 'Jaquar', 'Continental WHT', 'JQ-B7', 'A', 12, 'pcs', 10000, 4500, 'Gurugram', 'Sector 48', 'Left over from a 3-floor office fit-out. Boxes never opened.'],
  [seller, '40 boxes vitrified tiles 600x600, grey', 'tiles', 'Kajaria', 'Eternity Grey', 'KJ-2231', 'A', 40, 'boxes', 1450, 700, 'Gurugram', 'Udyog Vihar', 'Same batch, 4 tiles per box. Good for a 380 sq ft room.'],
  [seller2, '25 Philips LED panel lights 2x2', 'lights', 'Philips', 'RC095V', '', 'B', 25, 'pcs', 3200, 1100, 'Noida', 'Sector 62', 'Removed from boxes for a test fit, never installed.'],
  [seller, '18 mesh office chairs', 'office_furniture', 'Featherlite', 'Astute Mesh', '', 'B', 18, 'pcs', 12000, 3500, 'Gurugram', 'Cyber City', 'Office downsized. All chairs working, adjustable height.'],
  [seller2, '30 sheets 18mm BWP plywood', 'plywood', 'Greenply', 'Club Prime 710', 'GP-0921', 'A', 30, 'pcs', 4200, 2600, 'Noida', 'Sector 63', 'Stored indoors on pallets. 8x4 ft.'],
  [seller, '9 flush doors with frames, teak finish', 'doors', 'Century', 'Sainik 32mm', '', 'C', 9, 'pcs', 9500, 3800, 'Gurugram', 'Sector 29', 'Two have small corner scuffs, photographed.'],
  [seller2, '60 modular switch plates, 8 module', 'electrical', 'Legrand', 'Myrius', 'LG-M8', 'A', 60, 'pcs', 520, 210, 'Delhi', 'Okhla Phase 2', ''],
  [seller, '14 basin mixers, chrome', 'cp_fittings', 'Hindware', 'Flora', 'HW-F14', 'A', 14, 'pcs', 3900, 1700, 'Gurugram', 'Golf Course Road', 'Sealed, with warranty cards.'],
  [seller2, '220 sq ft Italian marble offcuts', 'stone', 'Statuario', 'Offcut slabs', 'ST-77', 'C', 220, 'sq ft', 650, 240, 'Delhi', 'Kirti Nagar', 'Offcuts from a lobby job. Good for vanity tops and table tops.'],
  [seller, '6 ceiling fans, white', 'electrical', 'Atomberg', 'Renesa', '', 'B', 6, 'pcs', 4500, 2200, 'Gurugram', 'Sector 56', ''],
];

const ids = [];
lots.forEach(([sid, title, category, brand, model, batch, grade, qty, unit, retail, ask, city, area, desc], n) => {
  const daysAgo = 2 + n * 2;
  const r = db.prepare(`INSERT INTO listings (seller_id,title,category,brand,model,batch_code,grade,qty,qty_initial,unit,retail_unit_price,ask_unit_price,city,area,address,description,age_months,status,published_at,created_at,check_json,views)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'live', datetime('now', ?), datetime('now', ?), '{"flags":[],"passed":true}', ?)`).run(
    sid, title, category, brand, model, batch, grade, qty, qty, unit, retail, ask, city, area, `Plot ${12 + n}, ${area}, ${city}`, desc, 3 + n, `-${daysAgo} days`, `-${daysAgo} days`, 20 + n * 7);
  const id = Number(r.lastInsertRowid);
  ids.push(id);
  ['items', 'label', 'count'].forEach((kind, v) => {
    const buf = photo(category, v + n);
    const file = crypto.randomBytes(12).toString('hex') + '.png';
    fs.writeFileSync(path.join(config.uploadDir, file), buf);
    db.prepare('INSERT INTO photos (listing_id, kind, file, sha256, mime) VALUES (?,?,?,?,?)').run(id, kind, file, crypto.createHash('sha256').update(buf).digest('hex'), 'image/png');
  });
});

// The WCs: an accepted enquiry, a part sale and a 5-star rating.
const e1 = Number(db.prepare("INSERT INTO enquiries (listing_id, buyer_id, qty, message, status, created_at) VALUES (?,?,?,?, 'accepted', datetime('now','-1 days'))").run(ids[0], buyer, 4, 'Need 4 for a clinic washroom. Can collect Saturday.').lastInsertRowid);
db.prepare('INSERT INTO sales (listing_id, enquiry_id, qty, total) VALUES (?,?,?,?)').run(ids[0], e1, 4, 18000);
db.prepare('UPDATE listings SET qty = qty - 4 WHERE id = ?').run(ids[0]);
db.prepare('INSERT INTO ratings (enquiry_id, listing_id, seller_id, buyer_id, stars, as_described, comment) VALUES (?,?,?,?,5,1,?)').run(e1, ids[0], seller, buyer, 'Exactly as listed, sealed boxes.');
// An open enquiry on the chairs, waiting for the seller.
db.prepare('INSERT INTO enquiries (listing_id, buyer_id, qty, message) VALUES (?,?,?,?)').run(ids[3], buyer, 10, 'Would you do 10 chairs?');
// The plywood was inspected and verified.
const ins = Number(db.prepare("INSERT INTO inspections (listing_id, inspector_id, status, matches_listing, counted_qty, grade_confirmed, notes, fee, done_at) VALUES (?,?, 'done', 1, 30, 'A', 'All sheets dry and flat.', ?, datetime('now','-3 days'))").run(ids[4], inspector, config.inspectionFee).lastInsertRowid);
db.prepare('UPDATE listings SET verified = 1 WHERE id = ?').run(ids[4]);
const ib = photo('plywood', 9);
const ifile = crypto.randomBytes(12).toString('hex') + '.png';
fs.writeFileSync(path.join(config.uploadDir, ifile), ib);
db.prepare('INSERT INTO inspection_photos (inspection_id, file, mime) VALUES (?,?,?)').run(ins, ifile, 'image/png');
// The tiles are big enough to need an inspection; it waits for the inspector.
db.prepare('INSERT INTO inspections (listing_id, inspector_id) VALUES (?,?)').run(ids[1], inspector);
// A saved search for the buyer.
db.prepare("INSERT INTO alerts (user_id, city, category) VALUES (?, 'Gurugram', 'tiles')").run(buyer);

console.log(`Seeded ${lots.length} live lots and demo people:
  seller     9000000010   buyer      9000000011
  seller 2   9000000012   inspector  9000000013
Log in with any of them (in dev mode the code is your DEV_OTP).`);

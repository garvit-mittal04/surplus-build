import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { createApp } from '../src/app.js';
import { compareAi, ruleChecks } from '../src/check.js';
import { openDb } from '../src/db.js';
import { createNotifier } from '../src/notify.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const ADMIN = '9000000001', SELLER = '9000000002', BUYER = '9000000003', INSPECTOR = '9000000004', BUYER2 = '9000000005';

const openServers = new Set();
after(() => { for (const c of openServers) c(); });

async function start(overrides = {}, deps = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-'));
  const { app, db } = createApp({ dbPath: path.join(dir, 't.db'), uploadDir: path.join(dir, 'up'), devOtp: '123456', adminPhone: ADMIN, rateLimitMax: 100000, ...overrides }, deps);
  const server = app.listen(0);
  await once(server, 'listening');
  const close = () => { server.closeAllConnections(); server.close(); openServers.delete(close); };
  openServers.add(close);
  return { base: `http://127.0.0.1:${server.address().port}`, db, close, dir };
}

class Client {
  constructor(base) { this.base = base; this.sid = ''; }
  async req(p, { method = 'GET', form, multi, headers = {} } = {}) {
    if (this.sid) headers.cookie = `sid=${this.sid}`;
    const body = form ? new URLSearchParams(form) : multi;
    const res = await fetch(this.base + p, { method, headers, body, redirect: 'manual' });
    const set = res.headers.get('set-cookie');
    if (set) { const m = set.match(/sid=([^;]*)/); this.sid = m ? m[1] : ''; }
    return { status: res.status, loc: res.headers.get('location'), text: await res.text(), headers: res.headers };
  }
  async login(phone, name = 'Test User') {
    await this.req('/login', { method: 'POST', form: { phone, next: '/' } });
    const r = await this.req('/verify', { method: 'POST', form: { phone, code: '123456', next: '/' } });
    if (r.loc && r.loc.startsWith('/welcome')) await this.req('/welcome', { method: 'POST', form: { name, intent: 'both', city: 'Gurugram' } });
    return r;
  }
}

const png = () => new Blob([Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]), crypto.randomBytes(24)])], { type: 'image/png' });

function listingForm(over = {}, photos = {}) {
  const f = new FormData();
  const d = {
    title: '12 Jaquar wall-hung WCs', category: 'sanitaryware', grade: 'A', brand: 'Jaquar', model: 'WHT-1', batch_code: 'B7',
    qty: '12', unit: 'pcs', retail_unit_price: '10000', ask_unit_price: '4500', age_months: '6', storage: 'indoor',
    description: 'From an office fit-out.', city: 'Gurugram', area: 'Sector 48', address: 'Tower 3, Sector 48, Gurugram', ...over,
  };
  for (const [k, v] of Object.entries(d)) f.append(k, v);
  f.append('photo_label', photos.label ?? png(), 'label.png');
  f.append('photo_count', photos.count ?? png(), 'count.png');
  f.append('photo_items', photos.items ?? png(), 'items.png');
  return f;
}
const status = (s, id) => s.db.prepare('SELECT status FROM listings WHERE id = ?').get(id).status;
const outbox = (s) => s.db.prepare('SELECT * FROM outbox ORDER BY id').all();

// ---------- pages and basics ----------

test('public pages render with security headers', async () => {
  const s = await start();
  const c = new Client(s.base);
  for (const p of ['/', '/browse', '/how-it-works', '/terms', '/privacy', '/login', '/js/app.js', '/style.css', '/manifest.webmanifest']) {
    assert.equal((await c.req(p)).status, 200, p);
  }
  const home = await c.req('/');
  assert.match(home.text, /verified<\/em> and close by/);
  assert.match(home.headers.get('content-security-policy'), /script-src 'self'/);
  assert.equal((await c.req('/healthz')).status, 200);
  assert.equal((await c.req('/no-such-page')).status, 404);
  s.close();
});

test('login: validation, wrong code, first login goes to onboarding', async () => {
  const s = await start();
  const c = new Client(s.base);
  assert.equal((await c.req('/login', { method: 'POST', form: { phone: '12345' } })).status, 400);
  await c.req('/login', { method: 'POST', form: { phone: '+91 90000 00002' } });
  assert.equal((await c.req('/verify', { method: 'POST', form: { phone: SELLER, code: '000000' } })).status, 400);
  const ok = await c.req('/verify', { method: 'POST', form: { phone: SELLER, code: '123456', next: '/browse' } });
  assert.equal(ok.loc, '/welcome?next=%2Fbrowse');
  const w = await c.req('/welcome', { method: 'POST', form: { name: 'Sam Interiors', intent: 'sell', city: 'Noida', next: '/' } });
  assert.match(w.loc, /^\/sell\/new\?msg=/);
  const u = s.db.prepare('SELECT * FROM users').get();
  assert.deepEqual([u.name, u.intent, u.city, u.onboarded], ['Sam Interiors', 'sell', 'Noida', 1]);
  const c2 = new Client(s.base);
  await c2.req('/login', { method: 'POST', form: { phone: SELLER } });
  assert.equal((await c2.req('/verify', { method: 'POST', form: { phone: SELLER, code: '123456', next: '/my' } })).loc, '/my');
  s.close();
});

test('admin login code works only for the admin number and only when long enough', async () => {
  const code = 'pilot-secret-2026';
  const s = await start({ devOtp: '', adminLoginCode: code });
  const c = new Client(s.base);
  await c.req('/login', { method: 'POST', form: { phone: ADMIN } });
  const ok = await c.req('/verify', { method: 'POST', form: { phone: ADMIN, code, next: '/admin' } });
  assert.match(ok.loc, /^\/welcome/);
  const other = new Client(s.base);
  await other.req('/login', { method: 'POST', form: { phone: SELLER } });
  assert.equal((await other.req('/verify', { method: 'POST', form: { phone: SELLER, code } })).status, 400);
  assert.equal((await new Client(s.base).req('/verify', { method: 'POST', form: { phone: ADMIN, code: 'pilot-secret-2025' } })).status, 400);
  s.close();
  const weak = await start({ devOtp: '', adminLoginCode: 'short' });
  const w = new Client(weak.base);
  await w.req('/login', { method: 'POST', form: { phone: ADMIN } });
  assert.equal((await w.req('/verify', { method: 'POST', form: { phone: ADMIN, code: 'short' } })).status, 400);
  weak.close();
});

test('open redirects and cross-site posts are blocked', async () => {
  const s = await start();
  const c = new Client(s.base);
  await c.login(SELLER);
  await c.req('/login', { method: 'POST', form: { phone: SELLER } });
  assert.equal((await c.req('/verify', { method: 'POST', form: { phone: SELLER, code: '123456', next: '//evil.example' } })).loc, '/');
  const res = await fetch(s.base + '/login', { method: 'POST', headers: { origin: 'https://evil.example', 'content-type': 'application/x-www-form-urlencoded' }, body: 'phone=9000000002' });
  assert.equal(res.status, 403);
  s.close();
});

test('form posts are rate limited per IP', async () => {
  const s = await start({ rateLimitMax: 3 });
  const c = new Client(s.base);
  const codes = [];
  for (let i = 0; i < 4; i++) codes.push((await c.req('/login', { method: 'POST', form: { phone: '1' } })).status);
  assert.deepEqual(codes, [400, 400, 400, 429]);
  s.close();
});

// ---------- selling ----------

test('refused goods, batch codes, missing and fake photos are rejected', async () => {
  const s = await start();
  const c = new Client(s.base);
  await c.login(SELLER);
  assert.equal((await c.req('/sell/new')).status, 200);
  let r = await c.req('/sell', { method: 'POST', multi: listingForm({ title: '40 bags UltraTech cement' }) });
  assert.equal(r.status, 400); assert.match(r.text, /do not accept cement/);
  r = await c.req('/sell', { method: 'POST', multi: listingForm({ category: 'tiles', batch_code: '' }) });
  assert.match(r.text, /batch or shade code/);
  const f = listingForm(); f.delete('photo_count');
  r = await c.req('/sell', { method: 'POST', multi: f });
  assert.match(r.text, /Photo missing: count/);
  r = await c.req('/sell', { method: 'POST', multi: listingForm({}, { label: new Blob(['just text'], { type: 'image/png' }) }) });
  assert.match(r.text, /not a JPEG, PNG or WebP/);
  assert.equal(s.db.prepare('SELECT COUNT(*) n FROM listings').get().n, 0);
  s.close();
});

test('a clean lot goes live, shows a done page, and hides the address publicly', async () => {
  const s = await start();
  const seller = new Client(s.base); await seller.login(SELLER, 'Sam Seller');
  const r = await seller.req('/sell', { method: 'POST', multi: listingForm() });
  assert.equal(r.loc, '/sell/done/1');
  assert.match((await seller.req('/sell/done/1')).text, /Your lot is live/);
  const anon = new Client(s.base);
  assert.equal((await anon.req('/sell/done/1')).status, 302);
  assert.match((await anon.req('/browse?city=Gurugram&category=sanitaryware')).text, /Jaquar wall-hung WCs/);
  const page = await anon.req('/listing/1');
  assert.match(page.text, /Sector 48/);
  assert.doesNotMatch(page.text, /Tower 3/);
  assert.doesNotMatch(page.text, new RegExp(SELLER));
  assert.match(page.text, /55% off/);
  assert.equal(s.db.prepare('SELECT views FROM listings WHERE id = 1').get().views, 1);
  await seller.req('/listing/1');
  assert.equal(s.db.prepare('SELECT views FROM listings WHERE id = 1').get().views, 1, 'owner views are not counted');
  s.close();
});

test('browse search escapes wildcards and sorts by discount', async () => {
  const s = await start();
  const c = new Client(s.base); await c.login(SELLER);
  await c.req('/sell', { method: 'POST', multi: listingForm({ title: 'Small discount lot', ask_unit_price: '8000' }) });
  await c.req('/sell', { method: 'POST', multi: listingForm({ title: 'Big discount lot', ask_unit_price: '2000' }) });
  const all = (await c.req('/browse?sort=discount')).text;
  assert.ok(all.indexOf('Big discount lot') < all.indexOf('Small discount lot'));
  assert.doesNotMatch((await c.req('/browse?q=%25')).text, /discount lot/);
  s.close();
});

test('suspicious price and reused photos go to review; admin approves or rejects', async () => {
  const s = await start();
  const seller = new Client(s.base); await seller.login(SELLER);
  await seller.req('/sell', { method: 'POST', multi: listingForm({ ask_unit_price: '12000' }) });
  assert.equal(status(s, 1), 'review');
  assert.match((await seller.req('/sell/done/1')).text, /not below the stated retail price/);
  assert.equal((await new Client(s.base).req('/listing/1')).status, 404);
  const shared = png();
  await seller.req('/sell', { method: 'POST', multi: listingForm({ title: 'Lot A' }, { label: shared }) });
  await seller.req('/sell', { method: 'POST', multi: listingForm({ title: 'Lot B' }, { label: shared }) });
  assert.ok(JSON.parse(s.db.prepare('SELECT check_json FROM listings WHERE id = 3').get().check_json).flags.some((f) => f.code === 'duplicate_photo'));

  const admin = new Client(s.base); await admin.login(ADMIN);
  assert.match((await admin.req('/admin')).text, /not below the stated retail price/);
  await admin.req('/admin/listing/1/decide', { method: 'POST', form: { action: 'approve' } });
  assert.equal(status(s, 1), 'live');
  await admin.req('/admin/listing/3/decide', { method: 'POST', form: { action: 'reject', reason: 'Reused photo' } });
  assert.equal(s.db.prepare('SELECT reject_reason FROM listings WHERE id = 3').get().reject_reason, 'Reused photo');
  assert.match((await seller.req('/my?tab=selling')).text, /Reused photo/);
  s.close();
});

test('non-admins cannot use admin or inspector pages', async () => {
  const s = await start();
  const c = new Client(s.base); await c.login(BUYER);
  assert.equal((await c.req('/admin')).status, 403);
  assert.equal((await c.req('/inspector')).status, 403);
  assert.equal((await c.req('/admin/listing/1/decide', { method: 'POST', form: { action: 'approve' } })).status, 403);
  s.close();
});

// ---------- buying, sales, ratings ----------

test('enquiry, accept, contact release, partial sale, sell-out, rating and seller trust', async () => {
  const s = await start();
  const seller = new Client(s.base); await seller.login(SELLER, 'Sam Seller');
  await seller.req('/sell', { method: 'POST', multi: listingForm() });
  const buyer = new Client(s.base); await buyer.login(BUYER, 'Bea Buyer');
  const buyer2 = new Client(s.base); await buyer2.login(BUYER2, 'Ben Buyer');

  assert.match(decodeURIComponent((await buyer.req('/listing/1/enquire', { method: 'POST', form: { qty: '99' } })).loc), /between 1 and 12/);
  await buyer.req('/listing/1/enquire', { method: 'POST', form: { qty: '5', message: 'Saturday?' } });
  await buyer2.req('/listing/1/enquire', { method: 'POST', form: { qty: '3' } });
  assert.doesNotMatch((await buyer.req('/my?tab=buying')).text, /Tower 3/);
  assert.match(outbox(s).map((o) => o.body).join('\n'), /Bea Buyer wants 5 pcs/);

  const eid = s.db.prepare('SELECT id FROM enquiries WHERE buyer_id = (SELECT id FROM users WHERE phone = ?)').get('+91' + BUYER).id;
  await buyer.req(`/enquiry/${eid}/respond`, { method: 'POST', form: { action: 'accept' } });
  assert.equal(s.db.prepare('SELECT status FROM enquiries WHERE id = ?').get(eid).status, 'open', 'buyers cannot accept their own enquiry');
  await seller.req(`/enquiry/${eid}/respond`, { method: 'POST', form: { action: 'accept' } });
  assert.match((await buyer.req('/my?tab=buying')).text, /Tower 3/);

  const e2 = s.db.prepare('SELECT id FROM enquiries WHERE id != ?').get(eid).id;
  await buyer2.req(`/enquiry/${e2}/rate`, { method: 'POST', form: { stars: '1', as_described: '0' } });
  await buyer.req(`/enquiry/${eid}/rate`, { method: 'POST', form: { stars: '4', as_described: '1', comment: 'Good' } });
  await buyer.req(`/enquiry/${eid}/rate`, { method: 'POST', form: { stars: '1', as_described: '0' } });
  assert.equal(s.db.prepare('SELECT COUNT(*) n FROM ratings').get().n, 1);
  assert.match((await new Client(s.base).req('/listing/1')).text, /from 1 buyer/);

  await seller.req('/listing/1/sale', { method: 'POST', form: { qty: '5', total: '22500', enquiry_id: String(eid) } });
  assert.deepEqual({ ...s.db.prepare('SELECT qty, status FROM listings WHERE id = 1').get() }, { qty: 7, status: 'live' });
  const bad = await seller.req('/listing/1/sale', { method: 'POST', form: { qty: '8', total: '1' } });
  assert.match(decodeURIComponent(bad.loc), /Enter units sold/);
  await seller.req('/listing/1/sale', { method: 'POST', form: { qty: '7', total: '28000' } });
  assert.equal(status(s, 1), 'sold');
  assert.equal(s.db.prepare('SELECT status FROM enquiries WHERE id = ?').get(e2).status, 'declined');
  assert.match(outbox(s).map((o) => o.body).join('\n'), /has sold out/);

  const admin = new Client(s.base); await admin.login(ADMIN);
  const dash = (await admin.req('/admin')).text;
  assert.match(dash, /<strong>42%<\/strong><span>realized share of retail/); // 50500 / (12 * 10000)
  assert.match(dash, /<strong>100%<\/strong><span>of published lots fully sold/);
  s.close();
});

test('accepting reserves stock; reservations block oversell, expire, and sales show in history', async () => {
  const s = await start({ reserveDays: 3 });
  const seller = new Client(s.base); await seller.login(SELLER, 'Sam Seller');
  await seller.req('/sell', { method: 'POST', multi: listingForm() }); // 12 pcs
  const a = new Client(s.base); await a.login(BUYER, 'Bea Buyer');
  const b = new Client(s.base); await b.login(BUYER2, 'Ben Buyer');
  await a.req('/listing/1/enquire', { method: 'POST', form: { qty: '10' } });
  await b.req('/listing/1/enquire', { method: 'POST', form: { qty: '5' } });
  const ea = s.db.prepare('SELECT id FROM enquiries WHERE qty = 10').get().id;
  const eb = s.db.prepare('SELECT id FROM enquiries WHERE qty = 5').get().id;

  await seller.req(`/enquiry/${ea}/respond`, { method: 'POST', form: { action: 'accept' } });
  const res = s.db.prepare('SELECT reserved_until > datetime(\'now\', \'+2 days\') ok FROM enquiries WHERE id = ?').get(ea);
  assert.equal(res.ok, 1, 'reserved for about 3 days');
  const page = (await new Client(s.base).req('/listing/1')).text;
  assert.match(page, /2 pcs available, 10 reserved for buyers/);
  assert.match((await new Client(s.base).req('/browse')).text, /2 pcs available · 10 reserved/);

  // B wants 5 but only 2 are free: the seller cannot accept, and new enquiries are capped.
  const r = await seller.req(`/enquiry/${eb}/respond`, { method: 'POST', form: { action: 'accept' } });
  assert.match(decodeURIComponent(r.loc), /Only 2 pcs are free/);
  assert.equal(s.db.prepare('SELECT status FROM enquiries WHERE id = ?').get(eb).status, 'open');
  const c = new Client(s.base); await c.login('9000000006');
  assert.match(decodeURIComponent((await c.req('/listing/1/enquire', { method: 'POST', form: { qty: '3' } })).loc), /between 1 and 2/);
  // An unlinked sale cannot eat into the reservation.
  assert.match(decodeURIComponent((await seller.req('/listing/1/sale', { method: 'POST', form: { qty: '5', total: '1000' } })).loc), /10 pcs are reserved/);
  assert.match((await seller.req('/my?tab=selling')).text, /Reserved until/);
  assert.match((await a.req('/my?tab=buying')).text, /Held for you until/);

  // Expiry releases the stock.
  s.db.prepare("UPDATE enquiries SET reserved_until = datetime('now', '-1 hours') WHERE id = ?").run(ea);
  assert.match((await new Client(s.base).req('/listing/1')).text, /12 pcs available\./);
  assert.match((await a.req('/my?tab=buying')).text, /reservation has expired/);
  assert.match((await seller.req('/my?tab=selling')).text, /Reservation expired/);

  // Re-reserve, record the linked sale: history shows Sold and the buyer is prompted to rate.
  s.db.prepare("UPDATE enquiries SET reserved_until = datetime('now', '+1 days') WHERE id = ?").run(ea);
  await seller.req('/listing/1/sale', { method: 'POST', form: { qty: '10', total: '40000', enquiry_id: String(ea) } });
  assert.match((await seller.req('/my?tab=selling')).text, /Sold · ₹40,000/);
  assert.match((await a.req('/my?tab=buying')).text, /Bought · ₹40,000/);
  const overview = (await a.req('/my')).text;
  assert.match(overview, /How was your pickup of/);
  assert.match(overview, /class="dot">1</);
  await a.req(`/enquiry/${ea}/rate`, { method: 'POST', form: { stars: '5', as_described: '1' } });
  assert.doesNotMatch((await a.req('/my')).text, /How was your pickup of/);
  // With the reservation consumed, the remaining 2 are free again.
  assert.match((await new Client(s.base).req('/listing/1')).text, /2 pcs available/);
  s.close();
});

test('price drops must go down; withdrawing hides the lot and declines enquiries', async () => {
  const s = await start();
  const seller = new Client(s.base); await seller.login(SELLER);
  await seller.req('/sell', { method: 'POST', multi: listingForm() });
  const buyer = new Client(s.base); await buyer.login(BUYER);
  await buyer.req('/listing/1/enquire', { method: 'POST', form: { qty: '2' } });
  const price = () => s.db.prepare('SELECT ask_unit_price FROM listings WHERE id = 1').get().ask_unit_price;

  await seller.req('/listing/1/price', { method: 'POST', form: { ask_unit_price: '5000' } });
  assert.equal(price(), 4500);
  await seller.req('/listing/1/price', { method: 'POST', form: { ask_unit_price: '3900' } });
  assert.equal(price(), 3900);
  await buyer.req('/listing/1/price', { method: 'POST', form: { ask_unit_price: '1000' } });
  assert.equal(price(), 3900, 'only the owner can change price');

  await seller.req('/listing/1/withdraw', { method: 'POST', form: {} });
  assert.equal(status(s, 1), 'withdrawn');
  assert.doesNotMatch((await buyer.req('/browse')).text, /Jaquar wall-hung/);
  assert.equal(s.db.prepare('SELECT status FROM enquiries').get().status, 'declined');
  s.close();
});

test('saved search alerts fire once when a matching lot goes live', async () => {
  const s = await start();
  const buyer = new Client(s.base); await buyer.login(BUYER);
  const alertForm = { q: 'Jaquar', city: 'Gurugram', category: '', min_qty: '10' };
  await buyer.req('/alerts', { method: 'POST', form: alertForm });
  await buyer.req('/alerts', { method: 'POST', form: alertForm });
  assert.equal(s.db.prepare('SELECT COUNT(*) n FROM alerts').get().n, 1, 'duplicate alerts are not saved');
  assert.match((await buyer.req('/browse?q=Jaquar&city=Gurugram&min_qty=10')).text, /You get alerts for this search/);
  assert.match(decodeURIComponent((await buyer.req('/alerts', { method: 'POST', form: {} })).loc), /at least one filter/);

  const seller = new Client(s.base); await seller.login(SELLER);
  await seller.req('/sell', { method: 'POST', multi: listingForm({ city: 'Noida' }) });
  await seller.req('/sell', { method: 'POST', multi: listingForm({ qty: '5' }) });
  await seller.req('/sell', { method: 'POST', multi: listingForm() });
  const alertMsgs = () => outbox(s).filter((o) => o.to_phone === '+91' + BUYER && /matching your alert/.test(o.body));
  assert.equal(alertMsgs().length, 1);
  assert.match(alertMsgs()[0].body, /listing\/3/);

  await seller.req('/sell', { method: 'POST', multi: listingForm({ ask_unit_price: '20000' }) });
  assert.equal(alertMsgs().length, 1, 'lots in review do not alert');
  const admin = new Client(s.base); await admin.login(ADMIN);
  await admin.req('/admin/listing/4/decide', { method: 'POST', form: { action: 'approve' } });
  assert.equal(alertMsgs().length, 2);

  const aid = s.db.prepare('SELECT id FROM alerts').get().id;
  await seller.req(`/alerts/${aid}/delete`, { method: 'POST', form: {} });
  assert.equal(s.db.prepare('SELECT COUNT(*) n FROM alerts').get().n, 1, 'only the owner can delete an alert');
  await buyer.req(`/alerts/${aid}/delete`, { method: 'POST', form: {} });
  assert.equal(s.db.prepare('SELECT COUNT(*) n FROM alerts').get().n, 0);
  s.close();
});

test('listing fee: lots wait until the fee is marked paid, with a UPI link', async () => {
  const s = await start({ feeRequired: true, upiId: 'surplus@okaxis', listingFee: 199 });
  const seller = new Client(s.base); await seller.login(SELLER);
  await seller.req('/sell', { method: 'POST', multi: listingForm() });
  assert.equal(status(s, 1), 'awaiting_fee');
  assert.match((await seller.req('/sell/done/1')).text, /upi:\/\/pay\?pa=surplus%40okaxis&amp;pn=Surplus%20Build&amp;am=199/);
  const admin = new Client(s.base); await admin.login(ADMIN);
  await admin.req('/admin/listing/1/fee', { method: 'POST', form: {} });
  assert.equal(status(s, 1), 'live');
  s.close();
});

// ---------- inspections ----------

test('inspections: assignment, photo evidence, verification, mismatch and payouts', async () => {
  const s = await start({ inspectThreshold: 40000, inspectionFee: 300 });
  const seller = new Client(s.base); await seller.login(SELLER);
  await seller.req('/sell', { method: 'POST', multi: listingForm() });
  await seller.req('/sell', { method: 'POST', multi: listingForm({ title: 'Second lot' }) });
  await seller.req('/sell', { method: 'POST', multi: listingForm({ title: 'Cheap lot', qty: '2' }) });
  assert.equal(s.db.prepare('SELECT COUNT(*) n FROM inspections').get().n, 2);

  const insp = new Client(s.base); await insp.login(INSPECTOR, 'Ira');
  const admin = new Client(s.base); await admin.login(ADMIN);
  const iid = s.db.prepare('SELECT id FROM users WHERE phone = ?').get('+91' + INSPECTOR).id;
  await admin.req(`/admin/user/${iid}/role`, { method: 'POST', form: { role: 'inspector' } });
  await admin.req('/admin/inspection/1/assign', { method: 'POST', form: { inspector_id: String(iid) } });
  await admin.req('/admin/inspection/2/assign', { method: 'POST', form: { inspector_id: String(iid) } });
  assert.match((await insp.req('/inspector')).text, /12 Jaquar/);

  const form = (over = {}, photos = 1) => {
    const f = new FormData();
    for (const [k, v] of Object.entries({ matches: '1', counted_qty: '12', grade_confirmed: 'A', notes: 'ok', ...over })) f.append(k, v);
    for (let i = 0; i < photos; i++) f.append('evidence', png(), `e${i}.png`);
    return f;
  };
  assert.match((await insp.req('/inspect/1', { method: 'POST', multi: form({}, 0) })).text, /at least one photo/);
  await insp.req('/inspect/1', { method: 'POST', multi: form() });
  assert.equal(s.db.prepare('SELECT verified FROM listings WHERE id = 1').get().verified, 1);
  assert.match((await new Client(s.base).req('/listing/1')).text, /Inspected on site/);
  await insp.req('/inspect/2', { method: 'POST', multi: form({ counted_qty: '9' }) });
  assert.equal(status(s, 2), 'review');
  assert.match(s.db.prepare('SELECT check_json FROM listings WHERE id = 2').get().check_json, /Inspector counted 9/);

  assert.match((await insp.req('/inspector')).text, /600<\/strong><span>earned, not yet paid/);
  await admin.req('/admin/inspection/1/paid', { method: 'POST', form: {} });
  assert.match((await insp.req('/inspector')).text, /300<\/strong><span>paid out/);
  s.close();
});

// ---------- checks ----------

test('AI check: a matching read passes, mismatches flag the lot, an API failure routes to review', async () => {
  const ai = (data, ok = true) => async () => ({ ok, status: ok ? 200 : 500, json: async () => ({ content: [{ text: 'Result: ' + JSON.stringify(data) }] }) });
  let s = await start({ anthropicKey: 'k' }, { fetchImpl: ai({ brand: 'Jaquar', batch_code: 'b-7', counted_quantity: 12, damage_visible: false, looks_like_stock_photo: false }) });
  let c = new Client(s.base); await c.login(SELLER);
  await c.req('/sell', { method: 'POST', multi: listingForm() });
  assert.equal(status(s, 1), 'live');
  s.close();

  s = await start({ anthropicKey: 'k' }, { fetchImpl: ai({ brand: 'Hindware', batch_code: 'ZZ9', counted_quantity: 8, damage_visible: true, looks_like_stock_photo: true }) });
  c = new Client(s.base); await c.login(SELLER);
  await c.req('/sell', { method: 'POST', multi: listingForm() });
  const codes = JSON.parse(s.db.prepare('SELECT check_json FROM listings WHERE id = 1').get().check_json).flags.map((f) => f.code);
  for (const code of ['batch_mismatch', 'brand_mismatch', 'qty_mismatch', 'damage_vs_grade', 'stock_photo']) assert.ok(codes.includes(code), code);
  s.close();

  s = await start({ anthropicKey: 'k' }, { fetchImpl: ai({}, false) });
  c = new Client(s.base); await c.login(SELLER);
  await c.req('/sell', { method: 'POST', multi: listingForm() });
  assert.equal(status(s, 1), 'review');
  s.close();
});

test('timestamps are shown in Indian time', async () => {
  const { localTime, localDate } = await import('../src/html.js');
  assert.equal(localTime('2026-10-22 06:36:18'), '22 Oct, 12:06 pm');
  assert.equal(localDate('2026-10-22 20:00:00'), '23 Oct 2026');
});

test('rule and AI comparison units', () => {
  const db = openDb(':memory:');
  const base = { id: 1, grade: 'B', storage: 'indoor', age_months: 1, retail_unit_price: 100 };
  assert.equal(ruleChecks({ listing: { ...base, ask_unit_price: 100 }, photoHashes: [], db })[0].code, 'not_discounted');
  assert.equal(ruleChecks({ listing: { ...base, ask_unit_price: 5 }, photoHashes: [], db })[0].code, 'price_too_low');
  assert.deepEqual(ruleChecks({ listing: { ...base, ask_unit_price: 50 }, photoHashes: [], db }), []);
  assert.equal(ruleChecks({ listing: { ...base, grade: 'A', storage: 'outdoor', ask_unit_price: 50 }, photoHashes: [], db })[0].code, 'grade_vs_storage');
  const l = { brand: 'Jaquar', batch_code: 'B7', qty: 12, unit: 'pcs', grade: 'A' };
  assert.deepEqual(compareAi(l, { status: 'ok', data: { brand: null, batch_code: null, counted_quantity: null, damage_visible: false, looks_like_stock_photo: false } }), []);
  assert.deepEqual(compareAi(l, { status: 'skipped' }), []);
});

// ---------- messaging ----------

test('notifier: logs without a provider, sends via WhatsApp or Twilio, records failures', async () => {
  const db = openDb(':memory:');
  const calls = [];
  const fake = (ok = true) => async (url, opts) => { calls.push({ url, opts }); return { ok, status: ok ? 200 : 401 }; };

  let n = createNotifier({ db, config: {}, fetchImpl: fake() });
  assert.equal((await n('+919000000001', 'hi')).status, 'logged');
  assert.equal(calls.length, 0);

  n = createNotifier({ db, config: { whatsappToken: 'T', whatsappPhoneId: '123', whatsappApiVersion: 'v21.0', twilioSid: 'AC1', twilioToken: 'X', twilioFrom: '+1555' }, fetchImpl: fake() });
  assert.equal((await n('+919000000001', 'hello')).status, 'sent');
  assert.equal(calls[0].url, 'https://graph.facebook.com/v21.0/123/messages');
  assert.equal(calls[0].opts.headers.authorization, 'Bearer T');
  assert.deepEqual(JSON.parse(calls[0].opts.body), { messaging_product: 'whatsapp', to: '919000000001', type: 'text', text: { body: 'hello' } });
  await n('+919000000001', 'code 1', 'sms');
  assert.equal(calls[1].url, 'https://api.twilio.com/2010-04-01/Accounts/AC1/Messages.json');
  assert.equal(calls[1].opts.headers.authorization, 'Basic ' + Buffer.from('AC1:X').toString('base64'));
  assert.equal(new URLSearchParams(calls[1].opts.body).get('To'), '+919000000001');

  n = createNotifier({ db, config: { twilioSid: 'AC1', twilioToken: 'X', twilioFrom: '+1555' }, fetchImpl: fake(false), log: { error() {} } });
  assert.equal((await n('+919000000001', 'x')).status, 'failed');
  assert.match(db.prepare("SELECT error FROM outbox WHERE status = 'failed'").get().error, /401/);
});

// ---------- upgrade from the first MVP ----------

test('a version-1 database upgrades in place without losing data', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sbm-'));
  const file = path.join(dir, 'v1.db');
  fs.copyFileSync(path.join(here, 'fixtures', 'v1.db'), file);
  const db = openDb(file);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 3);
  assert.ok(db.prepare('PRAGMA table_info(enquiries)').all().some((c) => c.name === 'reserved_until'));
  assert.equal(db.prepare('SELECT COUNT(*) n FROM listings').get().n, 4);
  const sold = db.prepare('SELECT * FROM listings WHERE id = 1').get();
  assert.deepEqual([sold.status, sold.qty, sold.qty_initial], ['sold', 0, 12]);
  assert.deepEqual({ ...db.prepare('SELECT listing_id, qty, total FROM sales').get() }, { listing_id: 1, qty: 12, total: 30000 });
  assert.equal(db.prepare('SELECT COUNT(*) n FROM photos').get().n, 12);
  assert.equal(db.prepare('SELECT onboarded FROM users LIMIT 1').get().onboarded, 1);
  assert.equal(db.prepare('SELECT status FROM enquiries').get().status, 'accepted');
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  db.prepare("UPDATE listings SET status = 'withdrawn' WHERE id = 2").run();
  db.close();
  const again = openDb(file);
  assert.equal(again.prepare('SELECT COUNT(*) n FROM listings').get().n, 4);
  again.close();
});

test('user-supplied text is escaped in pages', async () => {
  const s = await start();
  const c = new Client(s.base); await c.login(SELLER, '<script>alert(1)</script>');
  await c.req('/sell', { method: 'POST', multi: listingForm({ title: '<img src=x onerror=alert(1)> basin' }) });
  const page = await new Client(s.base).req('/listing/1');
  assert.doesNotMatch(page.text, /<img src=x/);
  assert.match(page.text, /&lt;img src=x/);
  assert.doesNotMatch((await c.req('/my')).text, /<script>alert/);
  s.close();
});

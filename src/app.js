import express from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { openDb } from './db.js';
import { loadConfig } from './config.js';
import { createNotifier } from './notify.js';
import { inr } from './html.js';
import { layout } from './views/layout.js';
import { message } from './views/guide.js';

import publicRoutes from './routes/public.js';
import authRoutes from './routes/auth.js';
import sellRoutes from './routes/sell.js';
import accountRoutes from './routes/account.js';
import staffRoutes from './routes/staff.js';

const here = path.dirname(fileURLToPath(import.meta.url));

export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function sniffImage(buf) {
  if (buf.length > 12 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return { mime: 'image/png', ext: 'png' };
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  return null;
}

const parseCookies = (h = '') =>
  Object.fromEntries(
    h.split(';').map((c) => c.trim().split('=')).filter((p) => p[0]).map(([k, ...v]) => {
      try { return [k, decodeURIComponent(v.join('='))]; } catch { return [k, '']; }
    })
  );

export function createApp(overrides = {}, deps = {}) {
  const config = loadConfig(overrides);
  const db = openDb(config.dbPath);
  fs.mkdirSync(config.uploadDir, { recursive: true });
  const notify = deps.notify || createNotifier({ db, config, fetchImpl: deps.notifyFetch || fetch });

  const app = express();
  app.disable('x-powered-by');
  if (config.cookieSecure) app.set('trust proxy', 1);

  // ---------- security ----------
  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin',
      'X-Frame-Options': 'DENY',
      'Permissions-Policy': 'camera=(self), geolocation=()',
      'Content-Security-Policy':
        "default-src 'self'; img-src 'self' blob: data:; style-src 'self'; script-src 'self'; connect-src 'self'; manifest-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'",
    });
    next();
  });

  // Reject cross-site form posts (defence in depth on top of SameSite=Lax cookies).
  app.use((req, res, next) => {
    if (req.method === 'POST' && req.headers.origin) {
      let ok = false;
      try { ok = new URL(req.headers.origin).host === req.headers.host; } catch {}
      if (!ok) return res.status(403).send('Cross-site request blocked.');
    }
    next();
  });

  // Simple per-IP limit on form submissions. Put a reverse proxy with its own limits in front in production.
  const hits = new Map();
  app.use((req, res, next) => {
    if (req.method !== 'POST') return next();
    const now = Date.now();
    const key = req.ip || 'unknown';
    const h = hits.get(key);
    if (!h || h.reset < now) hits.set(key, { n: 1, reset: now + config.rateLimitWindowMs });
    else if (++h.n > config.rateLimitMax) return res.status(429).send('Too many requests. Please wait a few minutes and try again.');
    if (hits.size > 10000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
    next();
  });

  // Asset version from the files' contents, so browsers fetch new CSS/JS as soon as they change.
  const publicDir = path.join(here, '..', 'public');
  const assetVersion = crypto.createHash('sha1')
    .update(['style.css', 'js/app.js', 'js/boot.js'].map((f) => { try { return fs.readFileSync(path.join(publicDir, f)); } catch { return ''; } }).join('|'))
    .digest('hex').slice(0, 10);
  app.use(express.static(publicDir, { dotfiles: 'deny', index: false, maxAge: '1h',
    setHeaders: (res, file) => { if (/\.(css|js)$/.test(file)) res.setHeader('Cache-Control', 'no-cache'); } }));
  app.use('/uploads', express.static(path.resolve(config.uploadDir), { dotfiles: 'deny', index: false, maxAge: '7d' }));
  app.use(express.urlencoded({ extended: false, limit: '50kb' }));

  // ---------- sessions ----------
  app.use((req, res, next) => {
    req.user = null;
    const sid = parseCookies(req.headers.cookie).sid;
    if (sid) {
      const row = db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires_at > ?').get(sid, Date.now());
      if (row) req.user = row;
    }
    next();
  });

  // ---------- shared helpers for the route modules ----------
  const page = (req, res, title, body, extra = {}) =>
    res.status(extra.status || 200).send(
      layout({ user: req.user, title, body, v: assetVersion, msg: typeof req.query.msg === 'string' ? req.query.msg.slice(0, 200) : '', error: extra.error, description: extra.description, path: req.path }).toString()
    );

  const need = (role) => (req, res, next) => {
    if (!req.user) return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
    if (role && req.user.role !== role && req.user.role !== 'admin') {
      return page(req, res, 'Not allowed', message({ title: 'Not allowed', text: 'You do not have access to this page.' }), { status: 403 });
    }
    next();
  };

  const firstPhoto = db.prepare("SELECT file FROM photos WHERE listing_id = ? ORDER BY CASE kind WHEN 'items' THEN 0 WHEN 'count' THEN 1 ELSE 2 END, id LIMIT 1");
  // Units held for buyers whose enquiry was accepted, until the reservation expires or a sale is recorded for it.
  const reservedQ = db.prepare(`SELECT COALESCE(SUM(e.qty), 0) n FROM enquiries e
    WHERE e.listing_id = ? AND e.id != ? AND e.status = 'accepted' AND e.reserved_until > datetime('now')
      AND NOT EXISTS (SELECT 1 FROM sales s WHERE s.enquiry_id = e.id)`);
  const reservedFor = (listingId, exceptEnquiryId = 0) => reservedQ.get(listingId, exceptEnquiryId).n;
  /** Add reserved and available counts to a listing row. */
  const annotate = (l) => {
    if (!l) return l;
    const reserved = Math.min(l.qty, reservedFor(l.id));
    return { ...l, reserved, available: l.qty - reserved };
  };
  const withPhoto = (l) => ({ l: annotate(l), photo: firstPhoto.get(l.id) });
  const getListing = (id) => annotate(db.prepare('SELECT * FROM listings WHERE id = ?').get(Number(id)));
  const userById = (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  const link = (p) => (config.baseUrl ? config.baseUrl.replace(/\/$/, '') + p : p);

  function sellerTrust(sellerId) {
    const r = db.prepare('SELECT COUNT(*) n, AVG(stars) avg, AVG(as_described) ad FROM ratings WHERE seller_id = ?').get(sellerId);
    return r.n ? { count: r.n, avg: r.avg, asDescribed: Math.round(r.ad * 100) } : null;
  }

  function matchAlerts(l) {
    const alerts = db.prepare('SELECT a.*, u.phone FROM alerts a JOIN users u ON u.id = a.user_id WHERE a.user_id != ?').all(l.seller_id);
    const text = `${l.title} ${l.brand} ${l.model}`.toLowerCase();
    const told = new Set();
    for (const a of alerts) {
      if (told.has(a.user_id)) continue;
      if (a.city && a.city !== l.city) continue;
      if (a.category && a.category !== l.category) continue;
      if (a.min_qty && l.qty < a.min_qty) continue;
      if (a.q && !text.includes(a.q.toLowerCase())) continue;
      told.add(a.user_id);
      const pct = Math.round((1 - l.ask_unit_price / l.retail_unit_price) * 100);
      notify(a.phone, `New lot matching your alert: "${l.title}" in ${l.area}, ${l.city}. ${inr(l.ask_unit_price)} per ${l.unit} (${pct}% off). ${link('/listing/' + l.id)}`);
    }
    return told.size;
  }

  /** Make a listing visible. Alerts fire the first time it goes live. */
  function goLive(id) {
    const before = getListing(id);
    db.prepare("UPDATE listings SET status = 'live', published_at = COALESCE(published_at, datetime('now')) WHERE id = ?").run(id);
    if (!before.published_at) matchAlerts(getListing(id));
  }

  /** After checks pass or an admin approves: go live, or wait for the fee in the pilot fee model. */
  function publish(id) {
    const l = getListing(id);
    if (config.feeRequired && !l.fee_paid) db.prepare("UPDATE listings SET status = 'awaiting_fee' WHERE id = ?").run(id);
    else goLive(id);
  }

  function saveImage(buffer, ext) {
    const file = `${crypto.randomBytes(12).toString('hex')}.${ext}`;
    fs.writeFileSync(path.join(config.uploadDir, file), buffer);
    return file;
  }

  const imageUpload = (fields) => {
    const mw = multer({ storage: multer.memoryStorage(), limits: { fileSize: 6 * 1024 * 1024, files: 8 } }).fields(fields);
    // Wrap so upload errors reach the route as req.uploadError instead of crashing the request.
    return (req, res, next) => mw(req, res, (err) => { req.uploadError = err || null; next(); });
  };

  const ctx = { db, config, notify, page, need, wrap, withPhoto, getListing, annotate, reservedFor, userById, sellerTrust, publish, goLive, matchAlerts, saveImage, imageUpload, sniffImage, link, fetchImpl: deps.fetchImpl };

  publicRoutes(app, ctx);
  authRoutes(app, ctx);
  sellRoutes(app, ctx);
  accountRoutes(app, ctx);
  staffRoutes(app, ctx);

  // ---------- errors ----------
  app.use((req, res) => page(req, res, 'Not found', message({ title: 'Page not found', text: 'We could not find that page. It may have moved, or the lot may have been withdrawn.', cta: '' }), { status: 404 }));
  app.use((err, req, res, next) => {
    console.error(err);
    if (res.headersSent) return next(err);
    page(req, res, 'Error', message({ title: 'Something went wrong', text: 'Please try again in a moment.' }), { status: 500 });
  });

  return { app, db, config };
}

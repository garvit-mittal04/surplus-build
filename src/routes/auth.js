import crypto from 'node:crypto';
import { CITIES } from '../config.js';
import { login, welcome, settings } from '../views/account.js';

export function normalizePhone(input) {
  const digits = String(input || '').replace(/\D/g, '');
  const ten = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits.length === 11 && digits.startsWith('0') ? digits.slice(1) : digits;
  return /^[6-9]\d{9}$/.test(ten) ? '+91' + ten : null;
}

export function safeNext(n) {
  return typeof n === 'string' && n.startsWith('/') && !n.startsWith('//') && !n.startsWith('/\\') ? n : '/';
}

const parseCookies = (h = '') => Object.fromEntries(h.split(';').map((c) => c.trim().split('=')).filter((p) => p[0]).map(([k, ...v]) => [k, v.join('=')]));

export default function authRoutes(app, ctx) {
  const { db, config, page, need, notify } = ctx;

  app.get('/login', (req, res) => {
    if (req.user) return res.redirect(safeNext(req.query.next));
    page(req, res, 'Log in', login({ step: 'phone', next: safeNext(req.query.next) }));
  });

  app.post('/login', (req, res) => {
    const next = safeNext(req.body.next);
    const phone = normalizePhone(req.body.phone);
    if (!phone) return page(req, res, 'Log in', login({ step: 'phone', next }), { status: 400, error: 'Enter a valid 10-digit Indian mobile number.' });
    const recent = db.prepare('SELECT COUNT(*) n FROM otps WHERE phone = ? AND created_at > ?').get(phone, Date.now() - 10 * 60 * 1000).n;
    if (recent >= 5) return page(req, res, 'Log in', login({ step: 'phone', next }), { status: 429, error: 'Too many codes requested. Try again in a few minutes.' });
    const code = config.devOtp || String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    db.prepare('INSERT INTO otps (phone, code, expires_at, created_at) VALUES (?,?,?,?)').run(phone, code, Date.now() + 10 * 60 * 1000, Date.now());
    notify(phone, `${code} is your Surplus Build login code. It expires in 10 minutes. Do not share it.`, 'sms');
    const devNote = config.devOtp ? `Development mode: the code is ${code}.` : '';
    page(req, res, 'Enter code', login({ step: 'otp', phone, next, devNote }));
  });

  app.post('/verify', (req, res) => {
    const next = safeNext(req.body.next);
    const phone = normalizePhone(req.body.phone);
    const fail = (error) => page(req, res, 'Enter code', login({ step: 'otp', phone: phone || '', next, devNote: '' }), { status: 400, error });
    if (!phone) return fail('Invalid phone number.');
    const given = String(req.body.code || '').trim();
    const adminCode = config.adminLoginCode;
    const gb = Buffer.from(given), ab = Buffer.from(adminCode);
    const isAdminCode = adminCode.length >= 12 && phone === normalizePhone(config.adminPhone) && gb.length === ab.length && crypto.timingSafeEqual(gb, ab);
    const otp = db.prepare('SELECT rowid, * FROM otps WHERE phone = ? ORDER BY created_at DESC LIMIT 1').get(phone);
    if (isAdminCode) return finishLogin(req, res, phone, next);
    if (!otp || otp.expires_at < Date.now() || otp.attempts >= 5) return fail('That code has expired. Request a new one.');
    const givenBuf = Buffer.from(given.padEnd(6, ' ').slice(0, 6));
    const real = Buffer.from(otp.code.padEnd(6, ' ').slice(0, 6));
    if (given.length !== 6 || !crypto.timingSafeEqual(givenBuf, real)) {
      db.prepare('UPDATE otps SET attempts = attempts + 1 WHERE rowid = ?').run(otp.rowid);
      return fail('That code is not right. Check the message and try again.');
    }
    db.prepare('DELETE FROM otps WHERE phone = ?').run(phone);
    finishLogin(req, res, phone, next);
  });

  function finishLogin(req, res, phone, next) {
    let user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
    if (!user) {
      const role = phone === normalizePhone(config.adminPhone) ? 'admin' : 'member';
      db.prepare('INSERT INTO users (phone, role) VALUES (?,?)').run(phone, role);
      user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
    }
    const sid = crypto.randomBytes(32).toString('hex');
    const maxAge = 30 * 24 * 3600;
    db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?,?,?)').run(sid, user.id, Date.now() + maxAge * 1000);
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
    res.set('Set-Cookie', `sid=${sid}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${config.cookieSecure ? '; Secure' : ''}`);
    res.redirect(user.onboarded ? next : '/welcome?next=' + encodeURIComponent(next));
  }

  app.post('/logout', (req, res) => {
    const sid = parseCookies(req.headers.cookie).sid;
    if (sid) db.prepare('DELETE FROM sessions WHERE id = ?').run(sid);
    res.set('Set-Cookie', 'sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
    res.redirect('/');
  });

  app.get('/welcome', need(), (req, res) => page(req, res, 'Welcome', welcome({ user: req.user, next: safeNext(req.query.next) })));

  app.post('/welcome', need(), (req, res) => {
    const name = String(req.body.name || '').trim().slice(0, 80);
    const intent = ['buy', 'sell', 'both'].includes(req.body.intent) ? req.body.intent : 'buy';
    const city = CITIES.includes(req.body.city) ? req.body.city : '';
    if (!name) return page(req, res, 'Welcome', welcome({ user: req.user, next: safeNext(req.body.next) }), { status: 400, error: 'Please add your name or company name.' });
    db.prepare('UPDATE users SET name = ?, intent = ?, city = ?, onboarded = 1 WHERE id = ?').run(name, intent, city, req.user.id);
    const next = safeNext(req.body.next);
    const dest = next !== '/' ? next : intent === 'sell' ? '/sell/new' : '/browse' + (city && city !== 'Other' ? '?city=' + encodeURIComponent(city) : '');
    const tip = intent === 'sell' ? 'You are all set. Here is how to list your first lot.' : 'You are all set. Save a search to get alerts for new lots.';
    res.redirect(dest + (dest.includes('?') ? '&' : '?') + 'msg=' + encodeURIComponent(tip));
  });

  app.get('/account/settings', need(), (req, res) => page(req, res, 'Settings', settings({ user: req.user })));

  app.post('/account/settings', need(), (req, res) => {
    const name = String(req.body.name || '').trim().slice(0, 80);
    const city = CITIES.includes(req.body.city) ? req.body.city : req.user.city;
    const intent = ['buy', 'sell', 'both'].includes(req.body.intent) ? req.body.intent : req.user.intent;
    if (!name) return page(req, res, 'Settings', settings({ user: req.user }), { status: 400, error: 'Name cannot be empty.' });
    db.prepare('UPDATE users SET name = ?, city = ?, intent = ?, onboarded = 1 WHERE id = ?').run(name, city, intent, req.user.id);
    res.redirect('/my?msg=' + encodeURIComponent('Saved.'));
  });
}

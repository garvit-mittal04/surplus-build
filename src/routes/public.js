import { CATEGORIES, CITIES, GRADES } from '../config.js';
import { home } from '../views/home.js';
import { howItWorks, legal, message } from '../views/guide.js';
import { browse, listingPage } from '../views/listing.js';

export default function publicRoutes(app, ctx) {
  const { db, config, page, need, withPhoto, getListing, sellerTrust, notify } = ctx;

  app.get('/healthz', (req, res) => res.json({ ok: true }));

  app.get('/', (req, res) => {
    const latest = db.prepare("SELECT * FROM listings WHERE status = 'live' ORDER BY published_at DESC, id DESC LIMIT 8").all().map(withPhoto);
    const live = db.prepare("SELECT COUNT(*) n, COUNT(DISTINCT city) cities, AVG(1 - ask_unit_price / retail_unit_price) d FROM listings WHERE status = 'live'").get();
    const stats = {
      live: live.n,
      cities: live.cities,
      avgDiscount: live.d == null ? 0 : Math.round(live.d * 100),
      unitsSold: db.prepare('SELECT COALESCE(SUM(qty), 0) n FROM sales').get().n,
    };
    const catCounts = Object.fromEntries(db.prepare("SELECT category, COUNT(*) n FROM listings WHERE status = 'live' GROUP BY category").all().map((r) => [r.category, r.n]));
    page(req, res, 'Verified surplus building materials', home({ latest, stats, catCounts, user: req.user }));
  });

  app.get('/how-it-works', (req, res) => page(req, res, 'How it works', howItWorks({ config }), { description: 'How buying and selling surplus building materials on Surplus Build works: listing, grades, checks, inspections and safe pickup.' }));
  app.get('/terms', (req, res) => page(req, res, 'Terms of use', legal({ kind: 'terms' })));
  app.get('/privacy', (req, res) => page(req, res, 'Privacy policy', legal({ kind: 'privacy' })));

  app.get('/browse', (req, res) => {
    const q = Object.fromEntries(['q', 'city', 'category', 'grade', 'min_qty', 'sort'].map((k) => [k, typeof req.query[k] === 'string' ? req.query[k].slice(0, 80) : '']));
    const where = ["status = 'live'"];
    const args = [];
    if (CITIES.includes(q.city)) { where.push('city = ?'); args.push(q.city); } else q.city = '';
    if (CATEGORIES[q.category]) { where.push('category = ?'); args.push(q.category); } else q.category = '';
    if (GRADES[q.grade]) { where.push('grade = ?'); args.push(q.grade); } else q.grade = '';
    if (Number(q.min_qty) > 0) { q.min_qty = String(Math.floor(Number(q.min_qty))); where.push('qty >= ?'); args.push(Number(q.min_qty)); } else q.min_qty = '';
    if (q.q.trim()) {
      q.q = q.q.trim();
      const like = '%' + q.q.replace(/[\\%_]/g, (m) => '\\' + m) + '%';
      where.push("(title LIKE ? ESCAPE '\\' OR brand LIKE ? ESCAPE '\\' OR model LIKE ? ESCAPE '\\')");
      args.push(like, like, like);
    } else q.q = '';
    const order = { discount: '(ask_unit_price / retail_unit_price) ASC', price: 'ask_unit_price ASC' }[q.sort] || 'published_at DESC, id DESC';
    const rows = db.prepare(`SELECT * FROM listings WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT 60`).all(...args).map(withPhoto);
    const alertExists = req.user
      ? !!db.prepare('SELECT 1 FROM alerts WHERE user_id = ? AND city = ? AND category = ? AND q = ? AND min_qty = ?').get(req.user.id, q.city, q.category, q.q.toLowerCase(), Number(q.min_qty) || 0)
      : false;
    page(req, res, 'Browse lots', browse({ rows, q, user: req.user, alertExists }));
  });

  app.get('/listing/:id', (req, res) => {
    const l = getListing(req.params.id);
    const isOwner = !!(l && req.user && l.seller_id === req.user.id);
    const staff = !!(req.user && (req.user.role === 'admin' || req.user.role === 'inspector'));
    if (!l || (!['live', 'sold'].includes(l.status) && !isOwner && !staff)) {
      return page(req, res, 'Not found', message({ title: 'Lot not found', text: 'This lot does not exist, or it is not public yet.', cta: '' }), { status: 404 });
    }
    if (!isOwner && l.status === 'live') db.prepare('UPDATE listings SET views = views + 1 WHERE id = ?').run(l.id);
    const photos = db.prepare('SELECT * FROM photos WHERE listing_id = ? ORDER BY id').all(l.id);
    const enquiry = req.user ? db.prepare('SELECT * FROM enquiries WHERE listing_id = ? AND buyer_id = ?').get(l.id, req.user.id) : null;
    const similar = db.prepare("SELECT * FROM listings WHERE status = 'live' AND category = ? AND id != ? ORDER BY city = ? DESC, published_at DESC LIMIT 4").all(l.category, l.id, l.city).map(withPhoto);
    const ownerStats = isOwner ? { enquiries: db.prepare('SELECT COUNT(*) n FROM enquiries WHERE listing_id = ?').get(l.id).n } : null;
    const insp = l.verified ? db.prepare("SELECT * FROM inspections WHERE listing_id = ? AND status = 'done' AND matches_listing = 1 ORDER BY id DESC LIMIT 1").get(l.id) : null;
    const inspection = insp ? { ...insp, photos: db.prepare('SELECT * FROM inspection_photos WHERE inspection_id = ?').all(insp.id) } : null;
    const desc = `${l.qty} ${l.unit} of ${l.brand} ${l.model}, grade ${l.grade}, in ${l.area}, ${l.city}.`;
    page(req, res, l.title, listingPage({ l, photos, user: req.user, enquiry, isOwner, trust: sellerTrust(l.seller_id), similar, ownerStats, inspection }), { description: desc });
  });

  app.post('/listing/:id/enquire', need(), (req, res) => {
    const l = getListing(req.params.id);
    if (!l || l.status !== 'live') return res.redirect('/browse?msg=' + encodeURIComponent('That lot is no longer available.'));
    if (l.seller_id === req.user.id) return res.redirect('/listing/' + l.id);
    const qty = Math.floor(Number(req.body.qty));
    if (l.available < 1) return res.redirect(`/listing/${l.id}?msg=` + encodeURIComponent('Every unit is reserved for other buyers right now.'));
    if (!Number.isInteger(qty) || qty < 1 || qty > l.available) {
      return res.redirect(`/listing/${l.id}?msg=` + encodeURIComponent(`Enter a quantity between 1 and ${l.available}.`));
    }
    const msg = String(req.body.message || '').trim().slice(0, 500);
    const r = db.prepare('INSERT OR IGNORE INTO enquiries (listing_id, buyer_id, qty, message) VALUES (?,?,?,?)').run(l.id, req.user.id, qty, msg);
    if (r.changes) {
      const seller = ctx.userById(l.seller_id);
      notify(seller.phone, `New enquiry: ${req.user.name || 'A buyer'} wants ${qty} ${l.unit} of "${l.title}".${msg ? ` They wrote: "${msg.slice(0, 120)}"` : ''} Accept or decline: ${ctx.link('/my?tab=selling')}`);
    }
    res.redirect('/my?tab=buying&msg=' + encodeURIComponent('Enquiry sent. We will message you when the seller responds.'));
  });
}

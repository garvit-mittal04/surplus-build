import { tx } from '../db.js';
import { CATEGORIES, CITIES } from '../config.js';
import { inr } from '../html.js';
import { myPage } from '../views/account.js';

export default function accountRoutes(app, ctx) {
  const { db, config, page, need, notify, withPhoto, getListing, userById, link, reservedFor } = ctx;
  const back = (res, tab, msg) => res.redirect(`/my?tab=${tab}&msg=` + encodeURIComponent(msg));

  app.get('/my', need(), (req, res) => {
    const uid = req.user.id;
    const tab = typeof req.query.tab === 'string' ? req.query.tab : 'overview';
    const nudgeBefore = new Date(Date.now() - config.priceNudgeDays * 86400000).toISOString().replace('T', ' ').slice(0, 19);

    const listings = db.prepare('SELECT * FROM listings WHERE seller_id = ? ORDER BY id DESC').all(uid).map((row) => {
      const { l, photo } = withPhoto(row);
      const sold = db.prepare('SELECT COALESCE(SUM(total), 0) t FROM sales WHERE listing_id = ?').get(l.id).t;
      const openEnquiries = db.prepare("SELECT COUNT(*) n FROM enquiries WHERE listing_id = ? AND status = 'open'").get(l.id).n;
      const accepted = db.prepare(`SELECT e.*, u.name buyer_name, u.phone buyer_phone FROM enquiries e JOIN users u ON u.id = e.buyer_id
        WHERE e.listing_id = ? AND e.status = 'accepted' AND NOT EXISTS (SELECT 1 FROM sales s WHERE s.enquiry_id = e.id)`).all(l.id);
      const flags = ['review', 'rejected'].includes(l.status) ? (JSON.parse(l.check_json || '{}').flags || []).filter((f) => f.level === 'review') : [];
      const nudge = l.status === 'live' && !sold && l.published_at && l.published_at < nudgeBefore && (!l.price_dropped_at || l.price_dropped_at < nudgeBefore);
      return { l, photo, sold, openEnquiries, accepted, flags, nudge };
    });
    const received = db.prepare(`SELECT e.*, l.title, l.unit, b.name buyer_name, b.phone buyer_phone,
        (SELECT SUM(total) FROM sales s WHERE s.enquiry_id = e.id) sold_total,
        e.reserved_until > datetime('now') reserving FROM enquiries e
      JOIN listings l ON l.id = e.listing_id JOIN users b ON b.id = e.buyer_id WHERE l.seller_id = ? ORDER BY e.status = 'open' DESC, e.id DESC`).all(uid);
    const sent = db.prepare(`SELECT e.*, l.title, l.unit, l.address, l.category, s.name seller_name, s.phone seller_phone,
        EXISTS (SELECT 1 FROM ratings r WHERE r.enquiry_id = e.id) rated,
        (SELECT SUM(total) FROM sales x WHERE x.enquiry_id = e.id) sold_total,
        e.reserved_until > datetime('now') reserving
      FROM enquiries e JOIN listings l ON l.id = e.listing_id JOIN users s ON s.id = l.seller_id WHERE e.buyer_id = ? ORDER BY e.id DESC`).all(uid)
      // Hide the pickup address and seller contact unless the seller accepted.
      .map((e) => (e.status === 'accepted' ? e : { ...e, address: '', seller_phone: '' }));
    const alerts = db.prepare('SELECT * FROM alerts WHERE user_id = ? ORDER BY id DESC').all(uid);
    const toRate = sent.filter((e) => e.status === 'accepted' && e.sold_total && !e.rated);
    const counts = {
      toRate: toRate.length,
      live: listings.filter((x) => x.l.status === 'live').length,
      waiting: received.filter((e) => e.status === 'open').length,
      myOpen: sent.filter((e) => e.status === 'open').length,
      alerts: alerts.length,
    };
    const checklist = [
      [!!req.user.name, 'Add your name', '/account/settings'],
      [listings.length > 0, 'List your first lot', '/sell/new'],
      [alerts.length > 0, 'Save a search to get alerts', '/browse'],
      [sent.length > 0, 'Send your first enquiry', '/browse'],
    ];
    page(req, res, 'My account', myPage({ user: req.user, tab, listings, received, sent, alerts, counts, checklist, config, toRate }));
  });

  app.post('/enquiry/:id/respond', need(), (req, res) => {
    const e = db.prepare('SELECT e.*, l.seller_id, l.title, l.address, l.area, l.city, l.unit, l.status lstatus FROM enquiries e JOIN listings l ON l.id = e.listing_id WHERE e.id = ?').get(Number(req.params.id));
    if (!e || e.seller_id !== req.user.id || e.status !== 'open') return back(res, 'selling', 'Nothing to update.');
    const accept = req.body.action === 'accept' && e.lstatus === 'live';
    if (accept) {
      const free = getListing(e.listing_id).available;
      if (e.qty > free) return back(res, 'selling', `Only ${free} ${e.unit} are free; the rest are reserved for other buyers. Decline, or ask this buyer to take ${free}.`);
    }
    db.prepare(`UPDATE enquiries SET status = ?, reserved_until = ${accept ? "datetime('now', ?)" : 'NULL'} WHERE id = ?`)
      .run(...(accept ? ['accepted', `+${config.reserveDays} days`, e.id] : ['declined', e.id]));
    const buyer = userById(e.buyer_id);
    if (accept) {
      notify(buyer.phone, `Good news: your enquiry for ${e.qty} ${e.unit} of "${e.title}" was accepted and is reserved for you for ${config.reserveDays} days. Pickup: ${e.address}, ${e.area}, ${e.city}. Seller: ${req.user.name || 'Seller'}, ${req.user.phone}. Inspect before you pay.`);
      notify(req.user.phone, `You accepted ${buyer.name || 'a buyer'} (${buyer.phone}) for ${e.qty} ${e.unit} of "${e.title}". Agree a pickup time, then record the sale: ${link('/my?tab=selling')}`);
    } else {
      notify(buyer.phone, `The seller could not take your enquiry for "${e.title}". Similar lots: ${link('/browse')}`);
    }
    back(res, 'selling', accept ? `Accepted. ${e.qty} ${e.unit} are reserved for this buyer for ${config.reserveDays} days, and we sent them your number and the pickup address.` : 'Declined. We let the buyer know.');
  });

  app.post('/listing/:id/sale', need(), (req, res) => {
    const l = getListing(req.params.id);
    if (!l || l.seller_id !== req.user.id || l.status !== 'live') return back(res, 'selling', 'Could not record that sale.');
    const qty = Math.floor(Number(req.body.qty));
    const total = Number(req.body.total);
    if (!Number.isInteger(qty) || qty < 1 || qty > l.qty || !(total > 0)) return back(res, 'selling', `Enter units sold (1 to ${l.qty}) and the total you received.`);
    let enquiry = null;
    if (req.body.enquiry_id) {
      enquiry = db.prepare("SELECT * FROM enquiries WHERE id = ? AND listing_id = ? AND status = 'accepted'").get(Number(req.body.enquiry_id), l.id);
      if (!enquiry) return back(res, 'selling', 'That buyer is not linked to this lot.');
    }
    if (!enquiry && qty > l.available) return back(res, 'selling', `${l.reserved} ${l.unit} are reserved for accepted buyers. Pick the buyer from the list, or record at most ${l.available}.`);
    const left = l.qty - qty;
    tx(db, () => {
      db.prepare('INSERT INTO sales (listing_id, enquiry_id, qty, total) VALUES (?,?,?,?)').run(l.id, enquiry ? enquiry.id : null, qty, total);
      db.prepare(`UPDATE listings SET qty = ?, status = CASE WHEN ? = 0 THEN 'sold' ELSE status END, sold_at = CASE WHEN ? = 0 THEN datetime('now') ELSE sold_at END WHERE id = ?`).run(left, left, left, l.id);
      if (left === 0) {
        const open = db.prepare("SELECT e.id, u.phone FROM enquiries e JOIN users u ON u.id = e.buyer_id WHERE e.listing_id = ? AND e.status = 'open'").all(l.id);
        db.prepare("UPDATE enquiries SET status = 'declined' WHERE listing_id = ? AND status = 'open'").run(l.id);
        for (const o of open) notify(o.phone, `"${l.title}" has sold out. Similar lots: ${link('/browse?category=' + l.category)}`);
      }
    });
    if (enquiry) {
      const buyer = userById(enquiry.buyer_id);
      notify(buyer.phone, `Thanks for buying "${l.title}". How was it? Rate the seller in a few seconds: ${link('/my?tab=buying')}`);
    }
    back(res, 'selling', left === 0 ? 'Sale recorded. The lot is sold out.' : `Sale recorded. ${left} ${l.unit} still live.`);
  });

  app.post('/listing/:id/price', need(), (req, res) => {
    const l = getListing(req.params.id);
    const p = Number(req.body.ask_unit_price);
    if (!l || l.seller_id !== req.user.id || l.status !== 'live') return back(res, 'selling', 'Could not change that price.');
    if (!(p > 0) || p >= l.ask_unit_price) return back(res, 'selling', `The new price must be below ${inr(l.ask_unit_price)}.`);
    if (p < l.retail_unit_price * 0.1) return back(res, 'selling', 'That is under 10% of retail. If that is right, contact us so we can confirm the lot.');
    db.prepare("UPDATE listings SET ask_unit_price = ?, price_dropped_at = datetime('now') WHERE id = ?").run(p, l.id);
    back(res, 'selling', `Price lowered to ${inr(p)} per ${l.unit}.`);
  });

  app.post('/listing/:id/withdraw', need(), (req, res) => {
    const l = getListing(req.params.id);
    if (!l || l.seller_id !== req.user.id || !['live', 'review', 'awaiting_fee'].includes(l.status)) return back(res, 'selling', 'Could not withdraw that lot.');
    const open = db.prepare("SELECT u.phone FROM enquiries e JOIN users u ON u.id = e.buyer_id WHERE e.listing_id = ? AND e.status = 'open'").all(l.id);
    tx(db, () => {
      db.prepare("UPDATE listings SET status = 'withdrawn' WHERE id = ?").run(l.id);
      db.prepare("UPDATE enquiries SET status = 'declined' WHERE listing_id = ? AND status = 'open'").run(l.id);
      db.prepare("DELETE FROM inspections WHERE listing_id = ? AND status = 'open'").run(l.id);
    });
    for (const o of open) notify(o.phone, `"${l.title}" is no longer available. Similar lots: ${link('/browse?category=' + l.category)}`);
    back(res, 'selling', 'Lot withdrawn.');
  });

  app.post('/enquiry/:id/rate', need(), (req, res) => {
    const e = db.prepare("SELECT e.*, l.seller_id FROM enquiries e JOIN listings l ON l.id = e.listing_id WHERE e.id = ? AND e.buyer_id = ? AND e.status = 'accepted'").get(Number(req.params.id), req.user.id);
    const stars = Math.floor(Number(req.body.stars));
    if (!e || !(stars >= 1 && stars <= 5)) return back(res, 'buying', 'Could not save that rating.');
    const r = db.prepare('INSERT OR IGNORE INTO ratings (enquiry_id, listing_id, seller_id, buyer_id, stars, as_described, comment) VALUES (?,?,?,?,?,?,?)')
      .run(e.id, e.listing_id, e.seller_id, req.user.id, stars, req.body.as_described === '0' ? 0 : 1, String(req.body.comment || '').trim().slice(0, 300));
    back(res, 'buying', r.changes ? 'Thanks. Your rating helps other buyers.' : 'You already rated this seller for that lot.');
  });

  app.post('/alerts', need(), (req, res) => {
    const a = {
      q: String(req.body.q || '').trim().toLowerCase().slice(0, 80),
      city: CITIES.includes(req.body.city) ? req.body.city : '',
      category: CATEGORIES[req.body.category] ? req.body.category : '',
      min_qty: Math.max(0, Math.floor(Number(req.body.min_qty) || 0)),
    };
    if (!a.q && !a.city && !a.category && !a.min_qty) return back(res, 'alerts', 'Pick at least one filter on Browse before saving an alert.');
    const count = db.prepare('SELECT COUNT(*) n FROM alerts WHERE user_id = ?').get(req.user.id).n;
    if (count >= 20) return back(res, 'alerts', 'You can keep up to 20 alerts. Remove one first.');
    const dup = db.prepare('SELECT 1 FROM alerts WHERE user_id = ? AND q = ? AND city = ? AND category = ? AND min_qty = ?').get(req.user.id, a.q, a.city, a.category, a.min_qty);
    if (!dup) db.prepare('INSERT INTO alerts (user_id, q, city, category, min_qty) VALUES (?,?,?,?,?)').run(req.user.id, a.q, a.city, a.category, a.min_qty);
    const qs = new URLSearchParams(Object.fromEntries(Object.entries({ ...a, q: req.body.q || '' }).filter(([, v]) => v))).toString();
    res.redirect('/browse?' + qs + '&msg=' + encodeURIComponent('Alert saved. We will message you when a matching lot goes live.'));
  });

  app.post('/alerts/:id/delete', need(), (req, res) => {
    db.prepare('DELETE FROM alerts WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.user.id);
    back(res, 'alerts', 'Alert removed.');
  });
}

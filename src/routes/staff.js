import { tx } from '../db.js';
import { GRADES } from '../config.js';
import { inspectorPage, inspectForm, adminPage } from '../views/staff.js';
import { message } from '../views/guide.js';

export default function staffRoutes(app, ctx) {
  const { db, config, page, need, notify, getListing, userById, publish, goLive, saveImage, imageUpload, sniffImage } = ctx;

  // ---------- inspectors ----------

  app.get('/inspector', need('inspector'), (req, res) => {
    const tasks = db.prepare(`SELECT i.id, l.title, l.area, l.city, l.address, l.qty, l.unit, l.grade FROM inspections i JOIN listings l ON l.id = i.listing_id
      WHERE i.status = 'open' AND i.inspector_id = ? ORDER BY i.id`).all(req.user.id);
    const e = db.prepare(`SELECT COUNT(*) done, COALESCE(SUM(CASE WHEN paid = 0 THEN fee END), 0) pending, COALESCE(SUM(CASE WHEN paid = 1 THEN fee END), 0) paid
      FROM inspections WHERE inspector_id = ? AND status = 'done'`).get(req.user.id);
    page(req, res, 'Inspections', inspectorPage({ tasks, earnings: e, config }));
  });

  const taskFor = (req) => {
    const t = db.prepare(`SELECT i.id inspection_id, i.inspector_id, i.status istatus, l.* FROM inspections i JOIN listings l ON l.id = i.listing_id WHERE i.id = ?`).get(Number(req.params.id));
    if (!t || t.istatus !== 'open') return null;
    if (req.user.role !== 'admin' && t.inspector_id !== req.user.id) return null;
    return t;
  };
  const notFound = (req, res) => page(req, res, 'Not found', message({ title: 'Task not found', text: 'This task is not assigned to you, or it is already done.', cta: '' }), { status: 404 });

  app.get('/inspect/:id', need('inspector'), (req, res) => {
    const t = taskFor(req);
    if (!t) return notFound(req, res);
    page(req, res, 'Inspect', inspectForm({ t: { ...t, id: t.inspection_id } }));
  });

  app.post('/inspect/:id', need('inspector'), imageUpload([{ name: 'evidence', maxCount: 4 }]), (req, res) => {
    const t = taskFor(req);
    if (!t) return notFound(req, res);
    const errors = [];
    if (req.uploadError) errors.push(req.uploadError.code === 'LIMIT_FILE_SIZE' ? 'Each photo must be under 6 MB.' : 'Add at most 4 photos.');
    const counted = Math.floor(Number(req.body.counted_qty));
    if (!Number.isInteger(counted) || counted < 0) errors.push('Enter the number of units you counted.');
    const photos = (req.files?.evidence || []).map((f) => ({ f, t: sniffImage(f.buffer) }));
    if (!photos.length) errors.push('Add at least one photo of the stock.');
    if (photos.some((p) => !p.t)) errors.push('Photos must be JPEG, PNG or WebP.');
    if (errors.length) return page(req, res, 'Inspect', inspectForm({ t: { ...t, id: t.inspection_id }, errors }), { status: 400 });

    const matches = req.body.matches === '1';
    const grade = GRADES[req.body.grade_confirmed] ? req.body.grade_confirmed : t.grade;
    const ok = matches && counted === t.qty;
    tx(db, () => {
      for (const p of photos) db.prepare('INSERT INTO inspection_photos (inspection_id, file, mime) VALUES (?,?,?)').run(t.inspection_id, saveImage(p.f.buffer, p.t.ext), p.t.mime);
      db.prepare(`UPDATE inspections SET status = 'done', matches_listing = ?, counted_qty = ?, grade_confirmed = ?, notes = ?, fee = ?, done_at = datetime('now'),
        inspector_id = COALESCE(inspector_id, ?) WHERE id = ?`).run(matches ? 1 : 0, counted, grade, String(req.body.notes || '').slice(0, 800), config.inspectionFee, req.user.id, t.inspection_id);
      if (ok) {
        db.prepare('UPDATE listings SET verified = 1, grade = ? WHERE id = ?').run(grade, t.id);
      } else {
        const chk = JSON.parse(t.check_json || '{}');
        chk.flags = [...(chk.flags || []), { code: 'inspection_mismatch', level: 'review', message: `Inspector counted ${counted} ${t.unit} (listing says ${t.qty})${matches ? '' : ' and reported the stock does not match the listing'}.` }];
        db.prepare("UPDATE listings SET status = 'review', verified = 0, check_json = ? WHERE id = ?").run(JSON.stringify(chk), t.id);
      }
    });
    const seller = userById(t.seller_id);
    notify(seller.phone, ok
      ? `Your lot "${t.title}" passed inspection and now shows a Verified badge.`
      : `The inspector found a difference on "${t.title}" (counted ${counted} ${t.unit}). The lot is paused until we sort it out.`);
    res.redirect(`${req.user.role === 'admin' ? '/admin' : '/inspector'}?msg=` + encodeURIComponent('Inspection submitted. Thank you.'));
  });

  // ---------- admin ----------

  app.get('/admin', need('admin'), (req, res) => {
    const one = (sql, ...a) => db.prepare(sql).get(...a);
    const pct = (x) => (x == null || Number.isNaN(x) ? '–' : Math.round(x * 100) + '%');

    const published = one('SELECT COUNT(*) n FROM listings WHERE published_at IS NOT NULL').n;
    const sold = one("SELECT COUNT(*) n FROM listings WHERE status = 'sold'").n;
    const enq = one(`SELECT COUNT(*) eligible, SUM(hit) hits FROM (
        SELECT l.id, EXISTS (SELECT 1 FROM enquiries e WHERE e.listing_id = l.id AND julianday(e.created_at) - julianday(l.published_at) <= 7) hit,
               julianday('now') - julianday(l.published_at) age
        FROM listings l WHERE l.published_at IS NOT NULL) WHERE hit = 1 OR age >= 7`);
    const days = one("SELECT AVG(julianday(sold_at) - julianday(published_at)) d FROM listings WHERE status = 'sold' AND published_at IS NOT NULL").d;
    const realized = one('SELECT SUM(s.total) t, SUM(s.qty * l.retail_unit_price) r FROM sales s JOIN listings l ON l.id = s.listing_id');
    const ratings = one('SELECT COUNT(*) n, SUM(1 - as_described) bad FROM ratings');
    const metrics = {
      live: one("SELECT COUNT(*) n FROM listings WHERE status = 'live'").n,
      review: one("SELECT COUNT(*) n FROM listings WHERE status = 'review'").n,
      enquiryRate: enq.eligible ? pct(enq.hits / enq.eligible) : '–',
      sellThrough: published ? pct(sold / published) : '–',
      avgDays: days == null ? '–' : days.toFixed(1),
      realized: realized.r ? pct(realized.t / realized.r) : '–',
      repeatSellers: one('SELECT COUNT(*) n FROM (SELECT seller_id FROM listings GROUP BY seller_id HAVING COUNT(*) >= 2)').n,
      disputeRate: ratings.n ? pct(ratings.bad / ratings.n) : '–',
    };

    const series = [];
    for (let i = 13; i >= 0; i--) {
      const day = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      series.push({
        day,
        listings: one('SELECT COUNT(*) n FROM listings WHERE substr(created_at, 1, 10) = ?', day).n,
        enquiries: one('SELECT COUNT(*) n FROM enquiries WHERE substr(created_at, 1, 10) = ?', day).n,
      });
    }

    const review = db.prepare("SELECT * FROM listings WHERE status = 'review' ORDER BY id").all().map((l) => ({
      l,
      flags: (JSON.parse(l.check_json || '{}').flags || []).filter((f) => f.level === 'review'),
      photos: db.prepare('SELECT * FROM photos WHERE listing_id = ? ORDER BY id').all(l.id),
    }));

    page(req, res, 'Admin', adminPage({
      metrics, days: series, review, me: req.user,
      awaitingFee: db.prepare("SELECT l.*, u.phone seller_phone FROM listings l JOIN users u ON u.id = l.seller_id WHERE l.status = 'awaiting_fee'").all(),
      inspectionsOpen: db.prepare(`SELECT i.*, l.title, l.area, l.city, u.name inspector_name, u.phone inspector_phone FROM inspections i JOIN listings l ON l.id = i.listing_id
        LEFT JOIN users u ON u.id = i.inspector_id WHERE i.status = 'open' ORDER BY i.id`).all(),
      payouts: db.prepare(`SELECT i.*, l.title, u.name inspector_name, u.phone inspector_phone FROM inspections i JOIN listings l ON l.id = i.listing_id
        JOIN users u ON u.id = i.inspector_id WHERE i.status = 'done' AND i.paid = 0 AND i.fee > 0 ORDER BY i.id`).all(),
      inspectors: db.prepare("SELECT * FROM users WHERE role IN ('inspector', 'admin') ORDER BY role, id").all(),
      listings: db.prepare('SELECT * FROM listings ORDER BY id DESC LIMIT 100').all(),
      outbox: db.prepare('SELECT * FROM outbox ORDER BY id DESC LIMIT 40').all(),
      users: db.prepare('SELECT * FROM users ORDER BY id DESC LIMIT 200').all(),
    }));
  });

  const adminBack = (res, msg) => res.redirect('/admin?msg=' + encodeURIComponent(msg));

  app.post('/admin/listing/:id/decide', need('admin'), (req, res) => {
    const l = db.prepare("SELECT * FROM listings WHERE id = ? AND status = 'review'").get(Number(req.params.id));
    if (!l) return adminBack(res, 'That lot is no longer in review.');
    const seller = userById(l.seller_id);
    if (req.body.action === 'approve') {
      publish(l.id);
      const now = getListing(l.id);
      notify(seller.phone, now.status === 'live' ? `Your lot "${l.title}" is approved and live.` : `Your lot "${l.title}" is approved. Pay the listing fee to make it live.`);
      return adminBack(res, `Approved #${l.id}.`);
    }
    const reason = String(req.body.reason || '').trim().slice(0, 300) || 'It did not meet our listing standard.';
    db.prepare("UPDATE listings SET status = 'rejected', reject_reason = ? WHERE id = ?").run(reason, l.id);
    notify(seller.phone, `Your lot "${l.title}" was not approved: ${reason} You can list it again with the details fixed.`);
    adminBack(res, `Rejected #${l.id}.`);
  });

  app.post('/admin/listing/:id/fee', need('admin'), (req, res) => {
    const l = db.prepare("SELECT * FROM listings WHERE id = ? AND status = 'awaiting_fee'").get(Number(req.params.id));
    if (!l) return adminBack(res, 'That lot is not waiting for a fee.');
    db.prepare('UPDATE listings SET fee_paid = 1 WHERE id = ?').run(l.id);
    goLive(l.id);
    notify(userById(l.seller_id).phone, `Fee received, thank you. "${l.title}" is now live.`);
    adminBack(res, `Fee recorded. #${l.id} is live.`);
  });

  app.post('/admin/inspection/:id/assign', need('admin'), (req, res) => {
    const insp = db.prepare("SELECT i.*, l.title, l.area, l.city FROM inspections i JOIN listings l ON l.id = i.listing_id WHERE i.id = ? AND i.status = 'open'").get(Number(req.params.id));
    const who = db.prepare("SELECT * FROM users WHERE id = ? AND role IN ('inspector', 'admin')").get(Number(req.body.inspector_id));
    if (!insp || !who) return adminBack(res, 'Could not assign that inspection.');
    db.prepare('UPDATE inspections SET inspector_id = ? WHERE id = ?').run(who.id, insp.id);
    notify(who.phone, `New inspection: "${insp.title}" in ${insp.area}, ${insp.city}. Details: ${ctx.link('/inspector')}`);
    adminBack(res, `Assigned to ${who.name || who.phone}.`);
  });

  app.post('/admin/inspection/:id/paid', need('admin'), (req, res) => {
    const r = db.prepare("UPDATE inspections SET paid = 1 WHERE id = ? AND status = 'done'").run(Number(req.params.id));
    adminBack(res, r.changes ? 'Payout marked as paid.' : 'Nothing to update.');
  });

  app.post('/admin/user/:id/role', need('admin'), (req, res) => {
    if (!['member', 'inspector', 'admin'].includes(req.body.role) || Number(req.params.id) === req.user.id) return adminBack(res, 'Role not changed.');
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(req.body.role, Number(req.params.id));
    adminBack(res, 'Role updated.');
  });
}

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { tx } from '../db.js';
import { CATEGORIES, BATCH_REQUIRED, REFUSED_WORDS, GRADES, CITIES, UNITS } from '../config.js';
import { runChecks } from '../check.js';
import { sellForm, sellDone } from '../views/sell.js';
import { message } from '../views/guide.js';

export function validateListing(body, files, sniffImage) {
  const errors = [];
  const s = (k) => String(body[k] ?? '').trim();
  const v = {
    title: s('title').slice(0, 120), category: s('category'), grade: s('grade'), brand: s('brand').slice(0, 80),
    model: s('model').slice(0, 80), batch_code: s('batch_code').slice(0, 60), unit: s('unit'), city: s('city'),
    area: s('area').slice(0, 80), address: s('address').slice(0, 300), storage: s('storage') || 'indoor',
    description: s('description').slice(0, 800),
    qty: Math.floor(Number(body.qty)),
    retail_unit_price: Number(body.retail_unit_price),
    ask_unit_price: Number(body.ask_unit_price),
    age_months: Math.floor(Number(body.age_months || 0)),
  };
  const names = { title: 'Title', brand: 'Brand', model: 'Model or SKU', area: 'Area or sector', address: 'Pickup address' };
  for (const k of Object.keys(names)) if (!v[k]) errors.push(`${names[k]} is required.`);
  if (!CATEGORIES[v.category]) errors.push('Choose a category.');
  if (!GRADES[v.grade]) errors.push('Choose a grade.');
  if (!UNITS.includes(v.unit)) errors.push('Choose a unit.');
  if (!CITIES.includes(v.city)) errors.push('Choose a city.');
  if (!['indoor', 'outdoor'].includes(v.storage)) errors.push('Choose where it was stored.');
  if (!Number.isInteger(v.qty) || v.qty < 1 || v.qty > 100000) errors.push('Quantity must be a whole number of at least 1.');
  if (!(v.retail_unit_price > 0) || !(v.ask_unit_price > 0)) errors.push('Enter both prices as positive numbers.');
  if (!Number.isInteger(v.age_months) || v.age_months < 0 || v.age_months > 600) errors.push('Age in months must be between 0 and 600.');
  if (BATCH_REQUIRED.has(v.category) && !v.batch_code) errors.push('Tiles and stone need a batch or shade code from the box label, so buyers get pieces that match.');

  const text = `${v.title} ${v.brand} ${v.model} ${v.description}`.toLowerCase();
  const refused = REFUSED_WORDS.find((w) => new RegExp(`\\b${w}`).test(text));
  if (refused) errors.push(`We do not accept ${refused}: it spoils with age and moisture.`);

  const label = { photo_label: 'box label', photo_count: 'count', photo_items: 'items' };
  for (const k of Object.keys(label)) if (!files[k]?.length) errors.push(`Photo missing: ${label[k]}.`);
  const photos = [];
  for (const [field, kind] of [['photo_label', 'label'], ['photo_count', 'count'], ['photo_items', 'items'], ['photo_defect', 'defect']]) {
    for (const f of files[field] || []) {
      const t = sniffImage(f.buffer);
      if (!t) { errors.push(`${f.originalname || 'A file'} is not a JPEG, PNG or WebP photo.`); continue; }
      photos.push({ kind, buffer: f.buffer, ...t });
    }
  }
  if ((files.photo_defect || []).length > 4) errors.push('Add at most 4 defect photos.');
  return { v, errors, photos };
}

export default function sellRoutes(app, ctx) {
  const { db, config, page, need, wrap, publish, saveImage, imageUpload, sniffImage, getListing } = ctx;

  app.get('/sell/new', need(), (req, res) => page(req, res, 'List your surplus', sellForm({ config })));

  const upload = imageUpload([
    { name: 'photo_label', maxCount: 1 },
    { name: 'photo_count', maxCount: 1 },
    { name: 'photo_items', maxCount: 1 },
    { name: 'photo_defect', maxCount: 4 },
  ]);

  app.post('/sell', need(), upload, wrap(async (req, res) => {
    const formBack = (errors, status = 400) => page(req, res, 'List your surplus', sellForm({ v: req.body || {}, errors, config }), { status });
    if (req.uploadError) {
      const e = req.uploadError;
      return formBack([e.code === 'LIMIT_FILE_SIZE' ? 'Each photo must be under 6 MB.' : e.code === 'LIMIT_UNEXPECTED_FILE' ? 'Too many photos in one box (at most 4 defect photos).' : 'Upload failed: ' + e.message]);
    }
    const { v, errors, photos } = validateListing(req.body, req.files || {}, sniffImage);
    if (errors.length) return formBack(errors);

    const saved = [];
    let id;
    try {
      id = tx(db, () => {
        const r = db.prepare(`INSERT INTO listings (seller_id,title,category,brand,model,batch_code,grade,qty,qty_initial,unit,retail_unit_price,ask_unit_price,city,area,address,age_months,storage,description,status)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'review')`).run(
          req.user.id, v.title, v.category, v.brand, v.model, v.batch_code, v.grade, v.qty, v.qty, v.unit, v.retail_unit_price, v.ask_unit_price,
          v.city, v.area, v.address, v.age_months, v.storage, v.description);
        const lid = Number(r.lastInsertRowid);
        for (const p of photos) {
          const sha = crypto.createHash('sha256').update(p.buffer).digest('hex');
          const file = saveImage(p.buffer, p.ext);
          saved.push(file);
          db.prepare('INSERT INTO photos (listing_id, kind, file, sha256, mime) VALUES (?,?,?,?,?)').run(lid, p.kind, file, sha, p.mime);
        }
        return lid;
      });
    } catch (e) {
      for (const f of saved) fs.rmSync(path.join(config.uploadDir, f), { force: true });
      throw e;
    }

    const listing = getListing(id);
    const photoRows = db.prepare('SELECT * FROM photos WHERE listing_id = ?').all(id).map((p) => ({ ...p, path: path.join(config.uploadDir, p.file) }));
    const result = await runChecks({ db, config, listing, photos: photoRows, fetchImpl: ctx.fetchImpl });
    db.prepare('UPDATE listings SET check_json = ? WHERE id = ?').run(JSON.stringify(result), id);
    if (listing.ask_unit_price * listing.qty >= config.inspectThreshold) {
      db.prepare('INSERT INTO inspections (listing_id) VALUES (?)').run(id);
    }
    if (result.passed) publish(id);
    res.redirect(`/sell/done/${id}`);
  }));

  app.get('/sell/done/:id', need(), (req, res) => {
    const l = getListing(req.params.id);
    if (!l || l.seller_id !== req.user.id) return page(req, res, 'Not found', message({ title: 'Lot not found', text: 'We could not find that lot in your account.' }), { status: 404 });
    const flags = (JSON.parse(l.check_json || '{}').flags || []).filter((f) => f.level === 'review');
    page(req, res, 'Lot submitted', sellDone({ l, config, flags: l.status === 'review' ? flags : [] }));
  });
}

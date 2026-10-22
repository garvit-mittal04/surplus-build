import fs from 'node:fs';

/**
 * Listing checks. Two layers:
 *  1. Rule checks that always run (price sanity, duplicate photos, grade vs storage).
 *  2. An optional vision check: a Claude model reads the photos and we compare what
 *     it sees with what the seller declared. It only runs when ANTHROPIC_API_KEY is set.
 *
 * Anything flagged goes to the admin review queue instead of going live.
 */

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

export function ruleChecks({ listing, photoHashes, db }) {
  const flags = [];
  const ratio = listing.ask_unit_price / listing.retail_unit_price;

  if (ratio >= 1) {
    flags.push({ code: 'not_discounted', level: 'review', message: 'Asking price is not below the stated retail price.' });
  } else if (ratio < 0.1) {
    flags.push({ code: 'price_too_low', level: 'review', message: 'Asking price is under 10% of retail, which is unusual. Check the retail price.' });
  }

  if (listing.grade === 'A' && listing.storage === 'outdoor') {
    flags.push({ code: 'grade_vs_storage', level: 'review', message: 'Grade A (sealed) stock stored outdoors needs a person to confirm.' });
  }
  if (listing.grade === 'A' && listing.age_months > 36) {
    flags.push({ code: 'grade_vs_age', level: 'review', message: 'Grade A stock older than 36 months needs a person to confirm.' });
  }

  if (photoHashes.length) {
    const marks = photoHashes.map(() => '?').join(',');
    const dup = db
      .prepare(`SELECT DISTINCT listing_id FROM photos WHERE sha256 IN (${marks}) AND listing_id != ?`)
      .all(...photoHashes, listing.id ?? -1);
    if (dup.length) {
      flags.push({
        code: 'duplicate_photo',
        level: 'review',
        message: `A photo was already used in listing #${dup.map((d) => d.listing_id).join(', #')}.`,
      });
    }
    if (new Set(photoHashes).size < photoHashes.length) {
      flags.push({ code: 'repeated_photo', level: 'review', message: 'The same photo was uploaded more than once.' });
    }
  }
  return flags;
}

const PROMPT = `You are checking a seller's listing photos for a marketplace of surplus building materials.
Each image is labelled with the photo type before it. Read only what is visible; use null when unreadable.
Return ONLY a JSON object with these keys:
{
 "brand": string|null,
 "model": string|null,
 "batch_code": string|null,
 "counted_quantity": number|null,
 "damage_visible": boolean,
 "looks_like_stock_photo": boolean,
 "notes": string
}
"counted_quantity" is the total number of units you can count across the count and items photos, in the seller's unit.`;

export async function aiExtract({ config, listing, photos, fetchImpl = fetch }) {
  if (!config.anthropicKey) return { status: 'skipped', reason: 'No ANTHROPIC_API_KEY set.' };

  const content = [];
  for (const p of photos) {
    const buf = fs.readFileSync(p.path);
    if (buf.length > 4.5 * 1024 * 1024) continue; // API image limit is about 5 MB
    content.push({ type: 'text', text: `Photo type: ${p.kind}` });
    content.push({ type: 'image', source: { type: 'base64', media_type: p.mime, data: buf.toString('base64') } });
  }
  if (!content.length) return { status: 'skipped', reason: 'No photos small enough to send.' };
  content.push({ type: 'text', text: `${PROMPT}\nSeller declared: unit=${listing.unit}.` });

  try {
    const res = await fetchImpl('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': config.anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: config.checkModel,
        max_tokens: 600,
        messages: [{ role: 'user', content }],
      }),
    });
    if (!res.ok) return { status: 'error', reason: `API returned ${res.status}` };
    const body = await res.json();
    const text = (body.content || []).map((c) => c.text || '').join('');
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return { status: 'error', reason: 'Model did not return JSON.' };
    return { status: 'ok', data: JSON.parse(m[0]) };
  } catch (e) {
    return { status: 'error', reason: String(e.message || e) };
  }
}

export function compareAi(listing, ai) {
  const flags = [];
  if (ai.status === 'error') {
    flags.push({ code: 'ai_unavailable', level: 'review', message: `Automatic photo check failed (${ai.reason}). A person should review.` });
    return flags;
  }
  if (ai.status !== 'ok') return flags;
  const d = ai.data;

  if (d.looks_like_stock_photo) {
    flags.push({ code: 'stock_photo', level: 'review', message: 'Photos look like stock or catalogue images.' });
  }
  if (d.batch_code && listing.batch_code && norm(d.batch_code) !== norm(listing.batch_code)) {
    flags.push({ code: 'batch_mismatch', level: 'review', message: `Photo shows batch "${d.batch_code}" but the listing says "${listing.batch_code}".` });
  }
  if (d.brand && !norm(listing.brand).includes(norm(d.brand)) && !norm(d.brand).includes(norm(listing.brand))) {
    flags.push({ code: 'brand_mismatch', level: 'review', message: `Photo shows brand "${d.brand}" but the listing says "${listing.brand}".` });
  }
  if (Number.isFinite(d.counted_quantity) && d.counted_quantity > 0 && d.counted_quantity !== listing.qty) {
    flags.push({ code: 'qty_mismatch', level: 'review', message: `Photos show about ${d.counted_quantity} ${listing.unit} but the listing says ${listing.qty}.` });
  }
  if (d.damage_visible && (listing.grade === 'A' || listing.grade === 'B')) {
    flags.push({ code: 'damage_vs_grade', level: 'review', message: 'Damage is visible in the photos but the grade is A or B.' });
  }
  return flags;
}

export async function runChecks({ db, config, listing, photos, fetchImpl }) {
  const ruleFlags = ruleChecks({ listing, photoHashes: photos.map((p) => p.sha256), db });
  const ai = await aiExtract({ config, listing, photos, fetchImpl });
  const flags = [...ruleFlags, ...compareAi(listing, ai)];
  return {
    flags,
    ai: ai.status === 'ok' ? { status: 'ok', data: ai.data } : { status: ai.status, reason: ai.reason },
    passed: flags.every((f) => f.level !== 'review'),
    ran_at: new Date().toISOString(),
  };
}

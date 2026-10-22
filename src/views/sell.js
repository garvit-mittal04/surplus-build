import { html, raw, inr } from '../html.js';
import { icon } from './icons.js';
import { CATEGORIES, GRADES, GRADE_HELP, CITIES, UNITS, BATCH_REQUIRED } from '../config.js';

const sel = (name, options, value, extra = '') => html`<select name="${name}" id="f-${name}" ${raw(extra)}>
  ${options.map(([v, t]) => html`<option value="${v}" ${String(v) === String(value ?? '') ? raw('selected') : ''}>${t}</option>`)}
</select>`;

const WSTEPS = ['The goods', 'Quantity and price', 'Condition', 'Photos', 'Pickup'];

export function upiLink(config, l) {
  if (!config.upiId) return '';
  const p = new URLSearchParams({ pa: config.upiId, pn: 'Surplus Build', am: String(config.listingFee), cu: 'INR', tn: `Listing fee lot ${l.id}` });
  return 'upi://pay?' + p.toString().replace(/\+/g, '%20');
}

export function sellForm({ v = {}, errors = [], config }) {
  const val = (k, d = '') => v[k] ?? d;
  const grade = val('grade', 'A');
  return html`
<div class="page-head narrow-head rise d1">
  <p class="eyebrow">Sell</p>
  <h1>List your surplus</h1>
  <p class="muted">Five short steps, about five minutes. Do it on site with your phone so you can take the photos as you go.</p>
</div>
${errors.length ? html`<div class="callout err rise" role="alert">${icon('alert', 'icon')}<div><strong>Please fix ${errors.length === 1 ? 'this' : 'these'} and submit again:</strong><ul>${errors.map((e) => html`<li>${e}</li>`)}</ul><p class="small">Photos are not kept after an error, so add them again in step 4.</p></div></div>` : ''}

<form method="post" action="/sell" enctype="multipart/form-data" class="wizard" data-wizard>
  <div class="wiz-progress js-only" aria-hidden="true">
    <div class="wiz-bar"><span data-wiz-fill></span></div>
    <ol class="wiz-labels">${WSTEPS.map((s, i) => html`<li data-wiz-label="${i + 1}">${s}</li>`)}</ol>
  </div>

  <section class="wstep" data-step="1">
    <h2><span class="wnum">1</span> What are you selling?</h2>
    <label for="f-title">Title <span class="hint">What a buyer would search for: quantity, brand, item.</span></label>
    <input id="f-title" name="title" value="${val('title')}" maxlength="120" required placeholder="e.g. 12 Jaquar wall-hung WCs, white">
    <div class="two">
      <div><label for="f-category">Category</label>${sel('category', Object.entries(CATEGORIES), val('category'), `required data-batch-cats="${[...BATCH_REQUIRED].join(',')}"`)}</div>
      <div><label for="f-brand">Brand</label><input id="f-brand" name="brand" value="${val('brand')}" required placeholder="e.g. Jaquar"></div>
    </div>
    <div class="two">
      <div><label for="f-model">Model or SKU <span class="hint">On the box label.</span></label><input id="f-model" name="model" value="${val('model')}" required></div>
      <div><label for="f-batch_code">Batch, shade or lot code <span class="hint" data-batch-hint>Optional for this category.</span></label><input id="f-batch_code" name="batch_code" value="${val('batch_code')}" placeholder="e.g. KJ-2231"></div>
    </div>
    <p class="tip">${icon('info', 'icon sm')} We do not accept cement, paint, putty, primer or adhesives.</p>
    <div class="wnav js-only"><span></span><button type="button" class="btn" data-next>Next ${icon('arrow', 'icon sm')}</button></div>
  </section>

  <section class="wstep" data-step="2">
    <h2><span class="wnum">2</span> Quantity and price</h2>
    <div class="two">
      <div><label for="f-qty">Quantity</label><input type="number" id="f-qty" name="qty" min="1" value="${val('qty')}" required></div>
      <div><label for="f-unit">Unit</label>${sel('unit', UNITS.map((u) => [u, u]), val('unit', 'pcs'))}</div>
    </div>
    <div class="two">
      <div><label for="f-retail_unit_price">Retail price today, per unit (₹) <span class="hint">What a dealer charges now.</span></label><input type="number" id="f-retail_unit_price" name="retail_unit_price" min="1" step="any" value="${val('retail_unit_price')}" required></div>
      <div><label for="f-ask_unit_price">Your asking price, per unit (₹)</label><input type="number" id="f-ask_unit_price" name="ask_unit_price" min="1" step="any" value="${val('ask_unit_price')}" required></div>
    </div>
    <div class="price-preview js-only" data-price-preview aria-live="polite">
      <p class="muted">Enter both prices to see what buyers will see.</p>
    </div>
    <p class="tip">${icon('info', 'icon sm')} As a rough guide from surplus markets abroad, sealed stock resells at about 50 to 70% of retail and opened-but-unused stock at 40 to 60%.</p>
    <div class="wnav js-only"><button type="button" class="btn ghost" data-back>${icon('back', 'icon sm')} Back</button><button type="button" class="btn" data-next>Next ${icon('arrow', 'icon sm')}</button></div>
  </section>

  <section class="wstep" data-step="3">
    <h2><span class="wnum">3</span> Condition</h2>
    <fieldset class="grade-pick"><legend>Grade <span class="hint">Choose honestly. A wrong grade is the top reason lots are pulled back.</span></legend>
      ${Object.entries(GRADES).map(([g, label]) => html`<label class="grade-opt">
        <input type="radio" name="grade" value="${g}" ${g === grade ? raw('checked') : ''} required>
        <span class="grade-letter">${g}</span><span><strong>${label.split(': ')[1]}</strong><span class="small muted block">${GRADE_HELP[g]}</span></span>
      </label>`)}
    </fieldset>
    <div class="two">
      <div><label for="f-age_months">Age in months</label><input type="number" id="f-age_months" name="age_months" min="0" value="${val('age_months', '0')}"></div>
      <div><label for="f-storage">Where it has been stored</label>${sel('storage', [['indoor', 'Indoors'], ['outdoor', 'Outdoors']], val('storage', 'indoor'))}</div>
    </div>
    <label for="f-description">Anything else a buyer should know <span class="hint">Optional. Colour, finish, missing parts, why it is surplus.</span></label>
    <textarea id="f-description" name="description" rows="3" maxlength="800">${val('description')}</textarea>
    <div class="wnav js-only"><button type="button" class="btn ghost" data-back>${icon('back', 'icon sm')} Back</button><button type="button" class="btn" data-next>Next ${icon('arrow', 'icon sm')}</button></div>
  </section>

  <section class="wstep" data-step="4">
    <h2><span class="wnum">4</span> Photos <span class="hint">Use your camera now. Photos are resized on your phone before upload.</span></h2>
    <div class="photo-tiles">
      ${[
        ['photo_label', 'tag', 'Box label', 'Brand, model and batch code readable.', true],
        ['photo_count', 'tiles', 'The count', 'Boxes or pieces laid out so they can be counted.', true],
        ['photo_items', 'box', 'The items', 'One or two pieces, in daylight.', true],
        ['photo_defect', 'alert', 'Defects', 'Optional, up to 4. Showing them prevents disputes.', false],
      ].map(([name, ic, title, tip, req]) => html`<label class="photo-tile" data-photo>
        <input class="file-input" type="file" name="${name}" accept="image/*" capture="environment" ${req ? raw('required') : raw('multiple')}>
        <span class="tile-art">${icon(ic, 'icon lg')}</span>
        <span class="tile-preview" data-preview></span>
        <span class="tile-text"><strong>${title}${req ? '' : html` <span class="hint">optional</span>`}</strong><span class="small muted">${tip}</span></span>
        <span class="tile-done">${icon('check', 'icon sm')}</span>
      </label>`)}
    </div>
    <div class="wnav js-only"><button type="button" class="btn ghost" data-back>${icon('back', 'icon sm')} Back</button><button type="button" class="btn" data-next>Next ${icon('arrow', 'icon sm')}</button></div>
  </section>

  <section class="wstep" data-step="5">
    <h2><span class="wnum">5</span> Pickup</h2>
    <div class="two">
      <div><label for="f-city">City</label>${sel('city', CITIES.map((c) => [c, c]), val('city', 'Gurugram'))}</div>
      <div><label for="f-area">Area or sector <span class="hint">Shown publicly.</span></label><input id="f-area" name="area" value="${val('area')}" required placeholder="e.g. Sector 48"></div>
    </div>
    <label for="f-address">Full pickup address <span class="hint">Shown only to a buyer you accept.</span></label>
    <textarea id="f-address" name="address" rows="2" required>${val('address')}</textarea>
    <div class="summary js-only" data-summary></div>
    <p class="muted small">${config.feeRequired ? html`A listing fee of ${inr(config.listingFee)} applies. The lot goes live once it is paid.` : 'Listing is free during the pilot.'} By submitting you confirm the details are accurate and you have the right to sell these goods (<a href="/terms">terms</a>).</p>
    <div class="wnav"><button type="button" class="btn ghost js-only" data-back>${icon('back', 'icon sm')} Back</button><button class="btn" data-submit>${icon('check', 'icon sm')} Submit for checking</button></div>
  </section>
</form>`;
}

export function sellDone({ l, config, flags }) {
  const live = l.status === 'live';
  const fee = l.status === 'awaiting_fee';
  const upi = fee ? upiLink(config, l) : '';
  return html`
<div class="done-page rise d1">
  <svg class="done-check" viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="24"/><path d="M15 27l7 7 15-15"/></svg>
  <h1>${live ? 'Your lot is live' : fee ? 'Checks passed' : 'Submitted for a quick review'}</h1>
  <p class="lead">${live
    ? 'Buyers can see it now. We will message you when someone enquires.'
    : fee
      ? `Pay the ${inr(config.listingFee)} listing fee and the lot goes live as soon as we confirm it.`
      : 'Our automatic checks raised a question, so a person will look at it, usually within a day.'}</p>
  ${flags.length ? html`<div class="panel left"><h3>What the checks noticed</h3><ul>${flags.map((f) => html`<li>${f.message}</li>`)}</ul><p class="small muted">If something here is a mistake, there is nothing you need to do: the reviewer will see this note too.</p></div>` : ''}
  ${upi ? html`<p><a class="btn" href="${upi}">${icon('wallet', 'icon sm')} Pay ${inr(config.listingFee)} with UPI</a></p><p class="small muted">Opens your UPI app on a phone. Paying to ${config.upiId}.</p>` : ''}
  <div class="next-steps">
    <p class="eyebrow">What happens next</p>
    <ol>
      <li class="${live ? 'done' : ''}">${icon('shield', 'icon sm')} Checks and, for bigger lots, an inspector visit</li>
      <li>${icon('chat', 'icon sm')} Buyers enquire; you accept the ones you want</li>
      <li>${icon('handshake', 'icon sm')} The buyer collects, inspects and pays you</li>
      <li>${icon('check', 'icon sm')} You record the sale in My account</li>
    </ol>
  </div>
  <div class="cta-row center">
    ${live ? html`<a class="btn" href="/listing/${l.id}">View your lot</a>` : ''}
    <a class="btn ghost" href="/sell/new">List another lot</a>
    <a class="text-link" href="/my?tab=selling">My account ${icon('arrow', 'icon sm')}</a>
  </div>
</div>`;
}

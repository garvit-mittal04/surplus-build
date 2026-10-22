import { html, raw, inr, localDate } from '../html.js';
import { icon } from './icons.js';
import { CATEGORIES, CITIES, GRADES, GRADE_HELP } from '../config.js';
import { listingCard, gradeBadge, discountPct, sellerTrust, empty, statusBadge } from './components.js';

const sel = (name, options, value, label) => html`<label class="field-inline"><span class="sr">${label}</span><select name="${name}" aria-label="${label}">
  ${options.map(([v, t]) => html`<option value="${v}" ${String(v) === String(value ?? '') ? raw('selected') : ''}>${t}</option>`)}
</select></label>`;

export function browse({ rows, q, user, alertExists }) {
  const f = (k) => q[k] ?? '';
  const active = ['q', 'city', 'category', 'grade', 'min_qty'].some((k) => f(k));
  const alertHidden = html`${['q', 'city', 'category', 'min_qty'].map((k) => html`<input type="hidden" name="${k}" value="${f(k)}">`)}`;
  return html`
<div class="page-head rise d1">
  <div>
    <p class="eyebrow">Marketplace</p>
    <h1>Browse lots</h1>
    <p class="muted">${rows.length} lot${rows.length === 1 ? '' : 's'} ${active ? 'match your filters' : 'live right now'}</p>
  </div>
  ${active
    ? user
      ? alertExists
        ? html`<p class="pill ok">${icon('bell', 'icon sm')} You get alerts for this search</p>`
        : html`<form method="post" action="/alerts" class="inline">${alertHidden}<button class="btn ghost small">${icon('bell', 'icon sm')} Alert me about new matches</button></form>`
      : html`<a class="btn ghost small" href="/login?next=${encodeURIComponent('/browse?' + new URLSearchParams(Object.fromEntries(Object.entries(q).filter(([, v]) => v))).toString())}">${icon('bell', 'icon sm')} Log in to save this search</a>`
    : ''}
</div>
<form method="get" action="/browse" class="filters rise d2" data-autosubmit>
  <label class="search-field">${icon('search')}<input name="q" value="${f('q')}" placeholder="Brand, model or item" aria-label="Search"></label>
  ${sel('city', [['', 'Any city'], ...CITIES.map((c) => [c, c])], f('city'), 'City')}
  ${sel('category', [['', 'Any category'], ...Object.entries(CATEGORIES)], f('category'), 'Category')}
  ${sel('grade', [['', 'Any grade'], ...['A', 'B', 'C', 'D'].map((g) => [g, 'Grade ' + g])], f('grade'), 'Grade')}
  <label class="field-inline"><span class="sr">Minimum quantity</span><input name="min_qty" type="number" min="1" value="${f('min_qty')}" placeholder="Min qty" aria-label="Minimum quantity"></label>
  ${sel('sort', [['new', 'Newest first'], ['discount', 'Biggest discount'], ['price', 'Lowest price per unit']], f('sort') || 'new', 'Sort')}
  <button class="btn">Apply</button>
  ${active ? html`<a class="text-link small" href="/browse">Clear</a>` : ''}
</form>
${rows.length
    ? html`<div class="grid">${rows.map(({ l, photo }) => listingCard(l, photo))}</div>`
    : empty({
        iconName: 'search',
        title: active ? 'Nothing matches yet' : 'No live lots yet',
        text: active ? 'Try fewer filters. Or save this search and we will message you when a matching lot goes live.' : 'Lots appear here as soon as sellers list them.',
        cta: html`<a class="btn ghost" href="/sell/new">List your own surplus</a>`,
      })}`;
}

export function listingPage({ l, photos, user, enquiry, isOwner, trust, similar, ownerStats, inspection }) {
  const kindName = { label: 'Box label', count: 'Count', items: 'Items', defect: 'Defect' };
  const main = photos.find((p) => p.kind === 'items') || photos[0];
  const pct = discountPct(l);
  const canEnquire = l.status === 'live' && !isOwner;
  return html`
<nav class="crumbs rise d1" aria-label="Breadcrumb"><a href="/browse">Browse</a> <span>/</span> <a href="/browse?category=${l.category}">${CATEGORIES[l.category]}</a> <span>/</span> <span>${l.title}</span></nav>
<div class="detail">
  <div class="gallery rise d2" data-gallery>
    ${main ? html`<button type="button" class="gallery-main" data-lightbox aria-label="Open photo full size">
      <img src="/uploads/${main.file}" alt="${kindName[main.kind]} photo of ${l.title}" data-main>
      <span class="zoom-hint">${icon('search', 'icon sm')} Tap to zoom</span>
    </button>` : html`<div class="gallery-main noimg">${icon('box', 'icon xl')}</div>`}
    <div class="thumbs">
      ${photos.map((p) => html`<button type="button" class="thumb-btn ${p === main ? 'on' : ''}" data-src="/uploads/${p.file}" data-alt="${kindName[p.kind]} photo of ${l.title}">
        <img src="/uploads/${p.file}" alt="" loading="lazy"><span>${kindName[p.kind]}</span></button>`)}
    </div>
  </div>

  <div class="info rise d3">
    <div class="row">${gradeBadge(l.grade)} ${l.verified ? html`<span class="badge ver">${icon('shield', 'icon xs')} Verified on site</span>` : html`<span class="badge unv">Not yet inspected</span>`} ${l.status !== 'live' ? statusBadge(l.status) : ''}</div>
    <h1>${l.title}</h1>
    <div class="price-block">
      <p class="price big">${inr(l.ask_unit_price)} <small>per ${l.unit}</small></p>
      <p class="muted">Retail today <s>${inr(l.retail_unit_price)}</s> &middot; <strong class="accent">${pct}% off</strong></p>
      <div class="save-bar" aria-hidden="true"><span class="save-fill" data-fill="${100 - pct}"></span></div>
      <p class="small muted">${l.available} ${l.unit} available${l.reserved ? html`, ${l.reserved} reserved for buyers` : ''}${l.qty_initial !== l.qty ? html` (${l.qty_initial - l.qty} already sold)` : ''}. All available: ${inr(l.ask_unit_price * l.available)}.</p>
    </div>
    ${sellerTrust(trust)}
    <dl class="facts">
      <dt>Brand and model</dt><dd>${l.brand} ${l.model}</dd>
      <dt>Batch or shade code</dt><dd>${l.batch_code || 'Not applicable'}</dd>
      <dt>Grade</dt><dd>${GRADES[l.grade]}<span class="small muted block">${GRADE_HELP[l.grade]}</span></dd>
      <dt>Age and storage</dt><dd>${l.age_months} month${l.age_months === 1 ? '' : 's'}, stored ${l.storage}</dd>
      <dt>Pickup area</dt><dd>${icon('pin', 'icon xs')} ${l.area}, ${l.city}<span class="small muted block">Exact address shared after the seller accepts.</span></dd>
    </dl>
    ${l.description ? html`<p class="desc">${l.description}</p>` : ''}
    ${inspection ? html`<div class="panel inspected">
      <h3>${icon('shield', 'icon sm')} Inspected on site</h3>
      <p class="small">On ${localDate(inspection.done_at)} an inspector counted ${inspection.counted_qty} ${l.unit} and confirmed grade ${inspection.grade_confirmed}.</p>
      ${inspection.photos.length ? html`<div class="review-photos">${inspection.photos.map((p) => html`<a href="/uploads/${p.file}" target="_blank" rel="noopener"><img src="/uploads/${p.file}" alt="Inspection photo" loading="lazy"></a>`)}</div>` : ''}
    </div>` : ''}

    ${isOwner
      ? html`<div class="panel owner">
          <h3>${icon('chart', 'icon sm')} Your lot</h3>
          <p>${icon('eye', 'icon sm')} ${l.views} view${l.views === 1 ? '' : 's'} &middot; ${icon('chat', 'icon sm')} ${ownerStats.enquiries} enquir${ownerStats.enquiries === 1 ? 'y' : 'ies'}</p>
          <a class="btn small" href="/my?tab=selling">Manage in My account</a>
        </div>`
      : l.status !== 'live'
        ? html`<p class="callout">${icon('info', 'icon')} <span>This lot is no longer available.</span></p>`
        : !user
          ? html`<div class="panel enquire" id="enquire"><h3>Interested?</h3><p class="muted">Log in with your mobile number to send an enquiry. It takes 30 seconds.</p><a class="btn block" href="/login?next=/listing/${l.id}">Log in to enquire</a></div>`
          : enquiry
            ? html`<div class="panel enquire" id="enquire"><h3>${icon('check', 'icon sm')} Enquiry sent</h3><p>You asked for ${enquiry.qty} ${l.unit}. Status: ${statusBadge(enquiry.status)}</p><a class="text-link" href="/my?tab=buying">Track it in My account ${icon('arrow', 'icon sm')}</a></div>`
            : l.available < 1
              ? html`<div class="panel enquire" id="enquire"><h3>${icon('clock', 'icon sm')} Every unit is reserved</h3><p class="muted">Other buyers have accepted enquiries on this lot. Reservations expire after a few days if the pickup does not happen.</p><a class="btn ghost block" href="/browse?category=${l.category}">See similar lots</a></div>`
              : html`<form method="post" action="/listing/${l.id}/enquire" class="panel enquire stack" id="enquire">
                <h3>Reserve or ask a question</h3>
                <label>How many do you need? <span class="hint">Up to ${l.available} ${l.unit}</span>
                  <input type="number" name="qty" min="1" max="${l.available}" value="${l.available}" required></label>
                <label>Message to the seller <span class="hint">Optional</span>
                  <textarea name="message" rows="3" maxlength="500" placeholder="When could I collect? Any questions about condition?"></textarea></label>
                <button class="btn block">${icon('chat', 'icon sm')} Send enquiry</button>
              </form>`}

    <div class="mini-steps">
      <p class="eyebrow">How pickup works</p>
      <ol>
        <li>${icon('chat', 'icon sm')} You send an enquiry</li>
        <li>${icon('check', 'icon sm')} Seller accepts, you get the address and number</li>
        <li>${icon('handshake', 'icon sm')} Inspect at pickup, then pay the seller</li>
      </ol>
      <a class="small text-link" href="/how-it-works#safety">Safe pickup tips</a>
    </div>
  </div>
</div>

${similar.length ? html`<section class="section">
  <div class="section-head reveal"><h2>Similar lots</h2></div>
  <div class="grid">${similar.map(({ l: s, photo }) => listingCard(s, photo))}</div>
</section>` : ''}

${canEnquire ? html`<div class="sticky-cta"><div><strong>${inr(l.ask_unit_price)}</strong> <small>/ ${l.unit}</small><span class="accent small"> ${pct}% off</span></div><a class="btn small" href="#enquire">Enquire</a></div>` : ''}

<dialog class="lightbox" data-lightbox-dialog aria-label="Photo">
  <form method="dialog"><button class="lightbox-x" aria-label="Close">${icon('x')}</button></form>
  <img alt="" data-lightbox-img>
</dialog>`;
}

import { html } from '../html.js';
import { icon } from './icons.js';
import { CATEGORIES, CITIES, GRADE_HELP } from '../config.js';
import { listingCard, steps, empty } from './components.js';

const BUY_STEPS = [
  ['search', 'Find it nearby', 'Search by item, brand or city. Every lot shows counted photos, a grade and the discount off today’s retail price.'],
  ['chat', 'Send an enquiry', 'Say how many you need. When the seller accepts, you get the pickup address and their number.'],
  ['handshake', 'Inspect, then pay', 'Check the goods at pickup before loading. Pay the seller directly once you are happy.'],
];
const SELL_STEPS = [
  ['camera', 'List in five minutes', 'Snap the box label, the count and the items. Add a price. No account fee during the pilot.'],
  ['shield', 'We check every lot', 'Automatic checks read the photos and prices. Big lots get an on-site inspection that adds a Verified badge.'],
  ['wallet', 'Buyers come to you', 'Accept the enquiries you like. The buyer collects from your site and pays you directly.'],
];

const FAQ = [
  ['Who sells here?', 'Interior designers, fit-out contractors, builders, dealers and homeowners with leftover stock from a project.'],
  ['Is it free?', 'Browsing and enquiring are free. Listing is free during the pilot; a small listing fee may apply later and is always shown before you list.'],
  ['How do I pay?', 'Directly to the seller at pickup, after you have inspected the goods. Never pay before you have seen the stock.'],
  ['What if the goods do not match the listing?', 'Do not take them. Grade A and B lots are inspected at pickup before loading. Report the lot from your account and we will review the seller.'],
  ['Do you deliver?', 'Not yet. Buyers collect from the seller’s site. Most buyers bring their own tempo or book one.'],
  ['What can’t I list?', 'Cement, paint, putty, primer and adhesives. They spoil with age and moisture, and one bad bag ruins a buyer’s trust.'],
];

export function home({ latest, stats, catCounts, user }) {
  return html`
<section class="hero">
  <div class="hero-bg" aria-hidden="true"><span></span><span></span><span></span></div>
  <div class="hero-copy">
    <p class="eyebrow rise d1">${icon('leaf', 'icon sm')} Piloting in Gurugram and NCR</p>
    <h1 class="rise d2">Leftover building materials, <em>verified</em> and close by.</h1>
    <p class="lead rise d3">Sanitaryware, lights, doors, plywood, tiles and office furniture from fit-outs and renovations. Buy the 35 you need at 30 to 70% off, not the 500 a dealer wants to sell you.</p>
    <form action="/browse" method="get" class="searchbar rise d4" role="search" data-tour="search">
      ${icon('search')}
      <input name="q" placeholder="Try “Jaquar”, “LED panel” or “plywood”" aria-label="Search lots">
      <select name="city" aria-label="City"><option value="">All cities</option>${CITIES.filter((c) => c !== 'Other').map((c) => html`<option>${c}</option>`)}</select>
      <button class="btn">Search</button>
    </form>
    <div class="cta-row rise d5">
      <a class="btn ghost" href="/sell/new" data-tour="sell">${icon('camera', 'icon sm')} Sell your surplus, free</a>
      <a class="text-link" href="/how-it-works" data-tour="guide">How it works ${icon('arrow', 'icon sm')}</a>
    </div>
  </div>
  <div class="hero-visual rise d3" aria-hidden="true">
    <div class="mock-card float-a">
      <div class="mock-img tiles-img"></div>
      <div class="mock-body">
        <span class="badge g-A">Grade A</span>
        <strong>40 boxes vitrified tiles 600×600</strong>
        <span class="muted small">Udyog Vihar, Gurugram</span>
        <span class="mock-price">₹700 <s>₹1,450</s></span>
      </div>
    </div>
    <div class="check-list float-b">
      <p class="check-item c1">${icon('check', 'icon sm')} Batch code matches the label</p>
      <p class="check-item c2">${icon('check', 'icon sm')} 40 boxes counted in photos</p>
      <p class="check-item c3">${icon('check', 'icon sm')} 52% below today’s retail</p>
      <p class="check-item c4">${icon('shield', 'icon sm')} Inspected on site</p>
    </div>
  </div>
</section>

<section class="stats-band reveal">
  <div><strong data-count="${stats.live}">${stats.live}</strong><span>lots live now</span></div>
  <div><strong data-count="${stats.unitsSold}">${stats.unitsSold}</strong><span>units found a second home</span></div>
  <div><strong data-count="${stats.avgDiscount}" data-suffix="%">${stats.avgDiscount}%</strong><span>average discount on live lots</span></div>
  <div><strong data-count="${stats.cities}">${stats.cities}</strong><span>cities with live lots</span></div>
</section>

<section class="section" id="how">
  <div class="section-head reveal">
    <p class="eyebrow">How it works</p>
    <h2>Three steps on each side. No middlemen at pickup.</h2>
  </div>
  <div class="tabs" data-tabs>
    <div class="tab-list" role="tablist">
      <button type="button" role="tab" aria-selected="true" aria-controls="tab-buy" id="t-buy">I’m buying</button>
      <button type="button" role="tab" aria-selected="false" aria-controls="tab-sell" id="t-sell">I’m selling</button>
    </div>
    <div class="tab-panel" role="tabpanel" id="tab-buy" aria-labelledby="t-buy">${steps(BUY_STEPS)}</div>
    <div class="tab-panel" role="tabpanel" id="tab-sell" aria-labelledby="t-sell">${steps(SELL_STEPS)}</div>
  </div>
</section>

<section class="section">
  <div class="section-head reveal">
    <p class="eyebrow">Browse by category</p>
    <h2>What people are clearing out</h2>
  </div>
  <div class="cats">
    ${Object.entries(CATEGORIES).map(([k, label]) => html`<a class="cat reveal" href="/browse?category=${k}">
      <span class="cat-ic">${icon(k)}</span><span class="cat-name">${label}</span><span class="cat-n">${catCounts[k] || 0} live</span>
    </a>`)}
  </div>
</section>

<section class="section">
  <div class="section-head row-between reveal">
    <div><p class="eyebrow">Fresh stock</p><h2>Just listed</h2></div>
    <a class="text-link" href="/browse">See all lots ${icon('arrow', 'icon sm')}</a>
  </div>
  ${latest.length
    ? html`<div class="grid">${latest.map(({ l, photo }) => listingCard(l, photo))}</div>`
    : empty({ iconName: 'box', title: 'No live lots yet', text: 'The first lots in your area will show up here. Have leftovers from a project? List them in five minutes.', cta: html`<a class="btn" href="/sell/new">List the first lot</a>` })}
</section>

<section class="section trust">
  <div class="section-head reveal">
    <p class="eyebrow">Why you can trust a lot here</p>
    <h2>Every listing is checked before anyone sees it</h2>
  </div>
  <div class="features">
    <div class="feature reveal">${icon('camera', 'icon lg')}<h3>Counted photos</h3><p class="muted">Every lot shows the box label, the count and the items, taken with the seller’s phone camera.</p></div>
    <div class="feature reveal">${icon('sparkle', 'icon lg')}<h3>Automatic checks</h3><p class="muted">Prices are checked against retail, reused photos are caught, and an AI check reads labels, batch codes and counts.</p></div>
    <div class="feature reveal">${icon('shield', 'icon lg')}<h3>On-site inspection</h3><p class="muted">Bigger lots get a visit from a local inspector. A match earns the Verified badge.</p></div>
    <div class="feature reveal">${icon('pin', 'icon lg')}<h3>Private until agreed</h3><p class="muted">The pickup address and phone number are shared only after the seller accepts your enquiry.</p></div>
  </div>
  <div class="grades reveal" id="grades">
    ${Object.entries(GRADE_HELP).map(([g, text]) => html`<div class="grade-card g-${g}-card"><span class="grade-letter">${g}</span><p>${text}</p></div>`)}
  </div>
</section>

<section class="section faq">
  <div class="section-head reveal"><p class="eyebrow">Questions</p><h2>Before you start</h2></div>
  <div class="faq-list">
    ${FAQ.map(([q, a]) => html`<details class="reveal"><summary>${q}</summary><p>${a}</p></details>`)}
  </div>
</section>

<section class="cta-band reveal">
  <div>
    <h2>Got leftovers sitting on site?</h2>
    <p>Turn them into cash this week instead of paying someone to haul them away.</p>
  </div>
  <a class="btn light" href="${user ? '/sell/new' : '/login?next=/sell/new'}">${icon('camera', 'icon sm')} List your first lot</a>
</section>`;
}

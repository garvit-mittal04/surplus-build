import { html } from '../html.js';
import { icon } from './icons.js';
import { GRADE_HELP, REFUSED_WORDS } from '../config.js';
import { steps } from './components.js';
import { inr } from '../html.js';

export function howItWorks({ config }) {
  const toc = [
    ['quick', 'Quick start'], ['sellers', 'For sellers'], ['photos', 'Taking good photos'], ['buyers', 'For buyers'],
    ['grades', 'Grades explained'], ['checks', 'Checks and inspections'], ['safety', 'Safe pickup and payment'],
    ['fees', 'Fees'], ['inspectors', 'For inspectors'],
  ];
  return html`
<div class="guide">
  <aside class="toc">
    <p class="eyebrow">On this page</p>
    <nav>${toc.map(([id, t]) => html`<a href="#${id}">${t}</a>`)}</nav>
  </aside>
  <article class="guide-body">
    <header class="guide-head rise d1">
      <p class="eyebrow">Guide</p>
      <h1>How Surplus Build works</h1>
      <p class="lead">A marketplace for leftover building materials. Sellers list surplus from fit-outs and renovations; buyers nearby collect it at a discount. This page explains every step.</p>
    </header>

    <section id="quick">
      <h2>Quick start</h2>
      <div class="two-col">
        <div class="panel reveal"><h3>${icon('search', 'icon sm')} If you are buying</h3>
          <ol class="plain">
            <li><a href="/browse">Browse</a> or search for what you need, filtered by city, category, grade and quantity.</li>
            <li>Open a lot, check the photos and the grade, and send an enquiry with the quantity you need.</li>
            <li>When the seller accepts, the address and phone number appear in <a href="/my">My account</a>. Collect, inspect, then pay.</li>
          </ol></div>
        <div class="panel reveal"><h3>${icon('camera', 'icon sm')} If you are selling</h3>
          <ol class="plain">
            <li><a href="/login?next=/sell/new">Log in</a> with your mobile number. No password needed.</li>
            <li>Go to <a href="/sell/new">Sell</a> and follow the five short steps. Take the photos on site with your phone.</li>
            <li>Accept enquiries from <a href="/my">My account</a>, hand over the goods, and record the sale.</li>
          </ol></div>
      </div>
    </section>

    <section id="sellers">
      <h2>For sellers</h2>
      ${steps([
        ['camera', 'Describe the lot', 'Title, category, brand, model and the batch or shade code from the box label. Tiles and stone must have a batch code, because buyers need pieces that match.'],
        ['tag', 'Set quantity and price', 'Enter today’s retail price per unit and your asking price. The form shows the discount buyers will see.'],
        ['clipboard', 'Pick a grade', 'Choose honestly. A wrong grade is the most common reason a lot is pulled back for review.'],
        ['upload', 'Add four kinds of photo', 'Box label, the count, the items, and any defects. Photos are resized on your phone so uploads are quick on mobile data.'],
        ['pin', 'Say where to collect', 'Only the area is public. The full address is shared with a buyer after you accept their enquiry.'],
      ], 'compact')}
      <p>After you submit, the lot is checked automatically. Most go live straight away. If a check raises a question, a person reviews it, usually within a day, and you see the reason in <a href="/my">My account</a>.</p>
      <h3>Managing a live lot</h3>
      <ul class="plain">
        <li><strong>Accept or decline enquiries.</strong> Accepting shares your number and the pickup address with that buyer only, and reserves their units for ${config.reserveDays} days so nobody else can claim them. If the pickup does not happen by then, the units go back on sale.</li>
        <li><strong>Record a sale</strong> when goods leave your site. Partial sales are fine: the rest of the lot stays live.</li>
        <li><strong>Lower the price</strong> if a lot has not moved in ${config.priceNudgeDays} days. A 10 to 15% cut usually helps.</li>
        <li><strong>Withdraw</strong> a lot if you no longer want to sell it.</li>
      </ul>
    </section>

    <section id="photos">
      <h2>Taking good photos</h2>
      <p>Photos are the only thing a buyer sees before travelling to you. Our checks compare them with what you typed, so a clear photo gets you live faster.</p>
      <div class="photo-guide">
        <figure class="reveal"><div class="frame">${icon('tag', 'icon xl')}</div><figcaption><strong>1. Box label</strong>Brand, model and batch or shade code readable. Get close and avoid glare.</figcaption></figure>
        <figure class="reveal"><div class="frame">${icon('tiles', 'icon xl')}</div><figcaption><strong>2. The count</strong>Lay boxes or pieces out so they can be counted in one shot. Rows of 5 or 10 work well.</figcaption></figure>
        <figure class="reveal"><div class="frame">${icon('box', 'icon xl')}</div><figcaption><strong>3. The items</strong>One or two pieces out of the box, in daylight, so buyers see colour and finish.</figcaption></figure>
        <figure class="reveal"><div class="frame">${icon('alert', 'icon xl')}</div><figcaption><strong>4. Any defects</strong>Chips, scratches, missing parts. Showing them protects you from disputes.</figcaption></figure>
      </div>
      <p class="muted small">Catalogue images, screenshots and photos reused from another listing are caught by the checks and sent to review.</p>
    </section>

    <section id="buyers">
      <h2>For buyers</h2>
      <ul class="plain">
        <li><strong>Search and filter</strong> by city, category, grade, minimum quantity and words such as a brand or model.</li>
        <li><strong>Save a search</strong> from the browse page to get a message the moment a matching lot goes live. Contractors use this to catch stock for a job that starts next week.</li>
        <li><strong>Enquire</strong> with the quantity you need. You can take part of a lot.</li>
        <li><strong>Rate the seller</strong> after pickup. Ratings and the “as described” score show on every lot they list.</li>
      </ul>
    </section>

    <section id="grades">
      <h2>Grades explained</h2>
      <div class="grades">${Object.entries(GRADE_HELP).map(([g, text]) => html`<div class="grade-card g-${g}-card reveal"><span class="grade-letter">${g}</span><p>${text}</p></div>`)}</div>
    </section>

    <section id="checks">
      <h2>Checks and inspections</h2>
      <div class="two-col">
        <div class="panel reveal"><h3>${icon('sparkle', 'icon sm')} Automatic checks on every lot</h3>
          <ul class="plain">
            <li>Asking price must be below retail and not suspiciously low.</li>
            <li>Photos reused from another listing are caught.</li>
            <li>Grade A stock stored outdoors or older than three years goes to a person.</li>
            <li>When switched on, an AI check reads the label, batch code and count from the photos and compares them with the listing.</li>
            <li>We do not accept ${REFUSED_WORDS.join(', ')}.</li>
          </ul></div>
        <div class="panel reveal"><h3>${icon('shield', 'icon sm')} On-site inspection for bigger lots</h3>
          <p>Lots worth ${inr(config.inspectThreshold)} or more get a visit from a local inspector, who counts the stock, confirms the grade and takes photos. A match adds the <strong>Verified</strong> badge. A mismatch takes the lot off the marketplace until it is fixed.</p></div>
      </div>
    </section>

    <section id="safety">
      <h2>Safe pickup and payment</h2>
      <div class="callout reveal">${icon('shield', 'icon lg')}<div>
        <p><strong>Never pay before you have seen the goods.</strong> Surplus Build does not take payment for lots, and no one from Surplus Build will ask you to pay a seller in advance.</p>
        <ul class="plain">
          <li>Collect in daylight, and bring someone if the lot is large.</li>
          <li>Check the batch code on the boxes against the listing before loading.</li>
          <li>Count the units before you pay. Pay by UPI so you have a record.</li>
          <li>If something is wrong, do not take it, and tell us from your account.</li>
        </ul></div></div>
    </section>

    <section id="fees">
      <h2>Fees</h2>
      <p>Browsing and enquiring are always free for buyers. ${config.feeRequired
        ? html`Sellers pay a listing fee of ${inr(config.listingFee)} per lot, shown before you submit. The lot goes live once it is paid.`
        : 'Listing is free for sellers during the pilot. If a fee is introduced, it will be shown before you list, never charged afterwards.'}</p>
    </section>

    <section id="inspectors">
      <h2>For inspectors</h2>
      <p>Inspectors are local freelancers paid per visit (${inr(config.inspectionFee)} per completed inspection). Open <a href="/inspector">Inspections</a> to see tasks assigned to you, visit the site, count the stock, confirm the grade, take at least one photo and submit. Earnings show on the same page and are paid out by the admin.</p>
    </section>
  </article>
</div>`;
}

export function legal({ kind }) {
  const isTerms = kind === 'terms';
  return html`
<article class="prose">
  <div class="callout warn">${icon('alert', 'icon lg')}<p><strong>Draft for review.</strong> This page is a starting template, not legal advice. Have a lawyer review it before you launch publicly.</p></div>
  <h1>${isTerms ? 'Terms of use' : 'Privacy policy'}</h1>
  ${isTerms
    ? html`
  <h2>What Surplus Build is</h2><p>Surplus Build is a listing service that connects people selling surplus building materials with buyers nearby. Sales are made directly between buyer and seller. Surplus Build is not a party to the sale and does not take payment for goods.</p>
  <h2>Sellers</h2><p>You must own the goods or have the right to sell them. Listings must be accurate, including the grade, quantity, batch code and photos. Cement, paint, putty, primer and adhesives may not be listed. We may review, reject or remove any listing.</p>
  <h2>Buyers</h2><p>Inspect goods before paying. Surplus Build does not guarantee the condition of any lot, including lots marked Verified, which reflects an inspection at a point in time.</p>
  <h2>Fees</h2><p>Any listing or service fee is shown before you are asked to pay it.</p>
  <h2>Conduct</h2><p>Do not misdescribe goods, reuse photos, harass other users or move deals off the platform to avoid fees. We may suspend accounts that do.</p>
  <h2>Liability</h2><p>To the extent the law allows, Surplus Build is not liable for losses arising from transactions between users.</p>`
    : html`
  <h2>What we collect</h2><p>Your mobile number, name, city, the listings and photos you upload, enquiries, ratings, and basic technical logs.</p>
  <h2>Why</h2><p>To log you in, show listings, connect buyers and sellers, prevent fraud and improve the service.</p>
  <h2>Who sees what</h2><p>Your listing details, area and photos are public. Your phone number and the full pickup address are shared only with a buyer whose enquiry you accept, or with a seller whose enquiry acceptance you receive. Inspectors assigned to a lot see its address.</p>
  <h2>Service providers</h2><p>We use providers to send SMS and WhatsApp messages and, when enabled, an AI service to check listing photos. They receive only what they need for that job.</p>
  <h2>Your choices</h2><p>You can update your name and city in Settings, withdraw your listings, and ask us to delete your account.</p>`}
</article>`;
}

export function message({ title, text, cta }) {
  return html`<div class="message rise d1"><div class="empty-art">${icon('info', 'icon xl')}</div><h1>${title}</h1><p class="muted">${text}</p>${cta || html`<p><a class="btn" href="/">Go to the home page</a></p>`}</div>`;
}

import { html, raw, inr, localDate, localTime } from '../html.js';
import { icon } from './icons.js';
import { CATEGORIES, CITIES } from '../config.js';
import { statusBadge, statusHelp, lotTimeline, empty } from './components.js';
import { upiLink } from './sell.js';

export function login({ step, phone, next, devNote }) {
  return html`
<div class="auth rise d1">
  <div class="auth-art">${icon(step === 'otp' ? 'chat' : 'user', 'icon xl')}</div>
  ${step === 'otp'
    ? html`<h1>Enter the 6-digit code</h1>
<p class="muted">We sent it to ${phone}. It expires in 10 minutes.</p>
${devNote ? html`<p class="pill">${icon('info', 'icon sm')} ${devNote}</p>` : ''}
<form method="post" action="/verify" class="stack">
  <input type="hidden" name="phone" value="${phone}">
  <input type="hidden" name="next" value="${next}">
  <label>Code <input name="code" class="otp" inputmode="numeric" autocomplete="one-time-code" maxlength="64" required autofocus></label>
  <button class="btn block">Continue ${icon('arrow', 'icon sm')}</button>
</form>
<form method="post" action="/login" class="center small"><input type="hidden" name="phone" value="${phone}"><input type="hidden" name="next" value="${next}"><button class="link">Send a new code</button></form>`
    : html`<h1>Log in or sign up</h1>
<p class="muted">Just your mobile number. We text you a code, no password to remember.</p>
<form method="post" action="/login" class="stack">
  <input type="hidden" name="next" value="${next}">
  <label>Mobile number
    <span class="phone-field"><span>+91</span><input name="phone" inputmode="numeric" autocomplete="tel-national" placeholder="98765 43210" required autofocus></span></label>
  <button class="btn block">Send code ${icon('arrow', 'icon sm')}</button>
</form>
<p class="small muted center">By continuing you agree to the <a href="/terms">terms</a> and <a href="/privacy">privacy policy</a>.</p>`}
</div>`;
}

export function welcome({ user, next }) {
  return html`
<div class="auth wide rise d1">
  <p class="eyebrow">Welcome to Surplus Build</p>
  <h1>Let’s set you up</h1>
  <p class="muted">Two quick questions so we can show you the right things first.</p>
  <form method="post" action="/welcome" class="stack">
    <input type="hidden" name="next" value="${next}">
    <label>Your name or company <input name="name" value="${user.name}" maxlength="80" required placeholder="e.g. Sharma Interiors"></label>
    <fieldset class="intent-pick"><legend>What brings you here?</legend>
      ${[
        ['buy', 'search', 'I want to buy', 'Find materials for a job at a discount.'],
        ['sell', 'camera', 'I want to sell', 'Clear leftovers from a project or showroom.'],
        ['both', 'handshake', 'Both', 'I buy and sell regularly.'],
      ].map(([v, ic, t, d], i) => html`<label class="intent-opt"><input type="radio" name="intent" value="${v}" ${i === 0 ? raw('checked') : ''}>
        <span class="intent-ic">${icon(ic, 'icon lg')}</span><strong>${t}</strong><span class="small muted">${d}</span></label>`)}
    </fieldset>
    <label>Your city <select name="city">${CITIES.map((c) => html`<option ${c === (user.city || 'Gurugram') ? raw('selected') : ''}>${c}</option>`)}</select></label>
    <button class="btn block">Get started ${icon('arrow', 'icon sm')}</button>
  </form>
</div>`;
}

export function settings({ user }) {
  return html`
<div class="auth wide rise d1">
  <p class="eyebrow">Settings</p>
  <h1>Your details</h1>
  <form method="post" action="/account/settings" class="stack">
    <label>Name or company <input name="name" value="${user.name}" maxlength="80" required></label>
    <label>City <select name="city">${CITIES.map((c) => html`<option ${c === user.city ? raw('selected') : ''}>${c}</option>`)}</select></label>
    <label>Mostly here to <select name="intent">${[['buy', 'Buy'], ['sell', 'Sell'], ['both', 'Buy and sell']].map(([v, t]) => html`<option value="${v}" ${v === user.intent ? raw('selected') : ''}>${t}</option>`)}</select></label>
    <p class="small muted">Mobile number: ${user.phone}. To change it, log in with the new number.</p>
    <button class="btn">Save</button>
  </form>
</div>`;
}

const TABS = [['overview', 'Overview'], ['selling', 'Selling'], ['buying', 'Buying'], ['alerts', 'Alerts']];

function overview({ user, counts, checklist, toRate = [] }) {
  return html`
${toRate.map((e) => html`<a class="rate-prompt reveal" href="/my?tab=buying#enq-${e.id}">
  <span class="rate-stars" aria-hidden="true">★★★★★</span>
  <span><strong>How was your pickup of “${e.title}”?</strong><span class="small muted block">Rate ${e.seller_name || 'the seller'} in a few seconds. It helps other buyers.</span></span>
  ${icon('arrow', 'icon sm')}
</a>`)}
<div class="kpis">
  <a class="kpi reveal" href="/my?tab=selling">${icon('box', 'icon')}<strong>${counts.live}</strong><span>live lots</span></a>
  <a class="kpi reveal ${counts.waiting ? 'hot' : ''}" href="/my?tab=selling#enquiries">${icon('chat', 'icon')}<strong>${counts.waiting}</strong><span>enquiries waiting for you</span></a>
  <a class="kpi reveal" href="/my?tab=buying">${icon('search', 'icon')}<strong>${counts.myOpen}</strong><span>of your enquiries pending</span></a>
  <a class="kpi reveal" href="/my?tab=alerts">${icon('bell', 'icon')}<strong>${counts.alerts}</strong><span>saved search alerts</span></a>
</div>
<div class="panel checklist reveal">
  <h3>Getting started</h3>
  <ul>${checklist.map(([done, text, href]) => html`<li class="${done ? 'done' : ''}"><span class="tick">${icon('check', 'icon xs')}</span><a href="${href}">${text}</a></li>`)}</ul>
</div>
<div class="quick reveal">
  <a class="btn" href="/sell/new">${icon('camera', 'icon sm')} List a lot</a>
  <a class="btn ghost" href="/browse${user.city && user.city !== 'Other' ? '?city=' + encodeURIComponent(user.city) : ''}">${icon('search', 'icon sm')} Browse ${user.city && user.city !== 'Other' ? user.city : 'lots'}</a>
  <a class="text-link" href="/account/settings">Settings ${icon('arrow', 'icon sm')}</a>
</div>`;
}

function selling({ listings, received, config }) {
  return html`
${listings.length ? listings.map(({ l, flags, photo, sold, openEnquiries, nudge, accepted }) => html`
<article class="lot-row reveal">
  <a class="lot-thumb" href="/listing/${l.id}">${photo ? html`<img src="/uploads/${photo.file}" alt="" loading="lazy">` : icon('box', 'icon lg')}</a>
  <div class="lot-main">
    <div class="row-between"><h3><a href="/listing/${l.id}">${l.title}</a></h3>${statusBadge(l.status)}</div>
    ${lotTimeline(l)}
    <p class="small muted">${statusHelp(l.status)}</p>
    ${l.status === 'rejected' && l.reject_reason ? html`<p class="callout err small">${icon('alert', 'icon sm')} <span>${l.reject_reason}</span></p>` : ''}
    ${flags.length ? html`<ul class="flags small">${flags.map((f) => html`<li>${icon('info', 'icon xs')} ${f.message}</li>`)}</ul>` : ''}
    <p class="lot-stats small"><span>${icon('tag', 'icon xs')} ${inr(l.ask_unit_price)} / ${l.unit}</span><span>${icon('box', 'icon xs')} ${l.qty} of ${l.qty_initial} left</span>${l.reserved ? html`<span class="reserved-tag">${icon('clock', 'icon xs')} ${l.reserved} reserved</span>` : ''}<span>${icon('eye', 'icon xs')} ${l.views} views</span><span>${icon('chat', 'icon xs')} ${openEnquiries} open enquir${openEnquiries === 1 ? 'y' : 'ies'}</span>${sold ? html`<span>${icon('wallet', 'icon xs')} ${inr(sold)} sold</span>` : ''}</p>
    ${nudge ? html`<p class="nudge small">${icon('sparkle', 'icon sm')} Not moving after ${config.priceNudgeDays} days? A 10 to 15% price cut usually helps.</p>` : ''}
    ${l.status === 'awaiting_fee' && config.upiId ? html`<a class="btn small" href="${upiLink(config, l)}">${icon('wallet', 'icon sm')} Pay ${inr(config.listingFee)} with UPI</a>` : ''}
    ${l.status === 'live' ? html`<details class="actions">
      <summary>Manage this lot</summary>
      <form method="post" action="/listing/${l.id}/sale" class="action-form">
        <strong>Record a sale</strong>
        <label>Units sold <input type="number" name="qty" min="1" max="${l.qty}" value="${accepted.length ? accepted[0].qty : l.available}" required></label>
        <label>Total received (₹) <input type="number" name="total" min="1" step="any" required></label>
        ${accepted.length ? html`<label>Buyer <select name="enquiry_id">${accepted.map((e) => html`<option value="${e.id}">${e.buyer_name || e.buyer_phone} (${e.qty} ${l.unit} reserved)</option>`)}<option value="">Someone else</option></select></label>` : ''}
        <button class="btn small">Save sale</button>
      </form>
      <form method="post" action="/listing/${l.id}/price" class="action-form">
        <strong>Lower the price</strong>
        <label>New price per ${l.unit} (₹) <input type="number" name="ask_unit_price" min="1" max="${l.ask_unit_price - 1}" step="any" value="${Math.round(l.ask_unit_price * 0.88)}" required></label>
        <button class="btn small ghost">Update price</button>
      </form>
      <form method="post" action="/listing/${l.id}/withdraw" class="action-form" data-confirm="Take this lot off the marketplace?">
        <strong>Withdraw</strong><span class="small muted">Removes the lot from search. Open enquiries are declined.</span>
        <button class="btn small danger">Withdraw lot</button>
      </form>
    </details>` : ['review', 'awaiting_fee'].includes(l.status) ? html`<form method="post" action="/listing/${l.id}/withdraw" class="inline" data-confirm="Withdraw this lot?"><button class="link small">Withdraw</button></form>` : ''}
  </div>
</article>`) : empty({ iconName: 'camera', title: 'You have not listed anything yet', text: 'Leftovers from a project? List them in five minutes and buyers nearby will come to you.', cta: html`<a class="btn" href="/sell/new">List your first lot</a>` })}

<h2 id="enquiries">Enquiries on your lots</h2>
${received.length ? html`<div class="table-wrap"><table><thead><tr><th>Lot</th><th>Buyer wants</th><th>Message</th><th>Status</th></tr></thead><tbody>
${received.map((e) => html`<tr class="${e.status === 'open' ? 'hot' : ''}">
  <td><a href="/listing/${e.listing_id}">${e.title}</a></td>
  <td>${e.qty} ${e.unit}</td>
  <td>${e.message || html`<span class="muted">No message</span>`}</td>
  <td>${e.status === 'open'
      ? html`<form method="post" action="/enquiry/${e.id}/respond" class="inline">
          <button class="btn small" name="action" value="accept">Accept</button>
          <button class="btn small ghost" name="action" value="decline">Decline</button></form>
          <span class="small muted block">Accepting shares your number and the pickup address with this buyer.</span>`
      : e.status === 'accepted'
        ? html`${e.sold_total
            ? html`<span class="badge st-sold">Sold · ${inr(e.sold_total)}</span>`
            : e.reserving
              ? html`<span class="badge st-accepted">Reserved until ${localTime(e.reserved_until)}</span>`
              : html`<span class="badge st-open">Reservation expired</span>`}
          <span class="block small">${e.buyer_name || 'Buyer'}, <a href="tel:${e.buyer_phone}">${e.buyer_phone}</a></span>
          ${!e.sold_total ? html`<span class="block small muted">After pickup, record the sale under Manage this lot.</span>` : ''}`
        : statusBadge(e.status)}</td>
</tr>`)}
</tbody></table></div>` : html`<p class="muted">No enquiries yet. They appear here, and we message you when one arrives.</p>`}`;
}

function buying({ sent }) {
  return sent.length ? html`${sent.map((e) => html`
<article class="enq-row reveal" id="enq-${e.id}">
  <div class="row-between"><h3><a href="/listing/${e.listing_id}">${e.title}</a></h3>${e.status === 'accepted'
    ? e.sold_total ? html`<span class="badge st-sold">Bought · ${inr(e.sold_total)}</span>`
      : e.reserving ? html`<span class="badge st-accepted">Reserved for you</span>` : html`<span class="badge st-open">Reservation expired</span>`
    : statusBadge(e.status)}</div>
  <p class="small muted">You asked for ${e.qty} ${e.unit} on ${localDate(e.created_at)}.</p>
  ${e.status === 'open' ? html`<p class="small">${icon('clock', 'icon xs')} Waiting for the seller. We will message you when they respond.</p>` : ''}
  ${e.status === 'declined' ? html`<p class="small">The seller declined. <a href="/browse?category=${e.category}">See similar lots</a>.</p>` : ''}
  ${e.status === 'accepted' && !e.sold_total ? html`<p class="small">${e.reserving
      ? html`${icon('clock', 'icon xs')} Held for you until ${localTime(e.reserved_until)}. Arrange pickup with the seller before then.`
      : html`${icon('alert', 'icon xs')} The reservation has expired. Call the seller to check the stock is still available before you travel.`}</p>` : ''}
  ${e.status === 'accepted' ? html`<div class="pickup">
      <p>${icon('pin', 'icon sm')} <strong>${e.address}</strong></p>
      <p>${icon('user', 'icon sm')} ${e.seller_name || 'Seller'}, <a href="tel:${e.seller_phone}">${e.seller_phone}</a></p>
      <p class="small muted">${icon('shield', 'icon xs')} Inspect before you pay. Check the batch code and count before loading.</p>
    </div>
    ${e.rated ? html`<p class="small ok-text">${icon('check', 'icon xs')} Thanks for rating this seller.</p>` : html`<details class="actions" ${e.sold_total ? raw('open') : ''}><summary>Rate the seller after pickup</summary>
      <form method="post" action="/enquiry/${e.id}/rate" class="action-form">
        <fieldset class="star-pick"><legend>How was it?</legend>
          ${[5, 4, 3, 2, 1].map((n) => html`<input type="radio" id="s${e.id}-${n}" name="stars" value="${n}" ${n === 5 ? raw('checked') : ''}><label for="s${e.id}-${n}" title="${n} star${n === 1 ? '' : 's'}">★</label>`)}
        </fieldset>
        <label>Was the lot as described? <select name="as_described"><option value="1">Yes</option><option value="0">No</option></select></label>
        <label>Comment <span class="hint">Optional</span><input name="comment" maxlength="300"></label>
        <button class="btn small">Submit rating</button>
      </form></details>`}` : ''}
</article>`)}` : empty({ iconName: 'search', title: 'No enquiries yet', text: 'Find a lot you like and send an enquiry. It will show up here with the pickup details once accepted.', cta: html`<a class="btn" href="/browse">Browse lots</a>` });
}

function alertsTab({ alerts }) {
  return html`
<p class="muted">We message you the moment a lot matching a saved search goes live. To add one, filter on <a href="/browse">Browse</a> and press “Alert me about new matches”.</p>
${alerts.length ? html`<ul class="alert-list">${alerts.map((a) => html`<li class="reveal">
  ${icon('bell', 'icon sm')}
  <span>${[a.q && `“${a.q}”`, a.category && CATEGORIES[a.category], a.city, a.min_qty && `${a.min_qty}+ units`].filter(Boolean).join(' · ') || 'All new lots'}</span>
  <a class="text-link small" href="/browse?${new URLSearchParams(Object.fromEntries(['q', 'city', 'category', 'min_qty'].filter((k) => a[k]).map((k) => [k, String(a[k])]))).toString()}">View</a>
  <form method="post" action="/alerts/${a.id}/delete" class="inline"><button class="link small">Remove</button></form>
</li>`)}</ul>` : empty({ iconName: 'bell', title: 'No alerts yet', text: 'Save a search on Browse, for example “tiles in Gurugram, 30+ boxes”, and we will tell you when one appears.', cta: html`<a class="btn ghost" href="/browse">Go to Browse</a>` })}`;
}

export function myPage(d) {
  const tab = TABS.some(([k]) => k === d.tab) ? d.tab : 'overview';
  return html`
<div class="page-head rise d1">
  <div><p class="eyebrow">My account</p><h1>Hello${d.user.name ? ', ' + d.user.name : ''}</h1></div>
  <a class="btn small ghost" href="/account/settings">${icon('user', 'icon sm')} Settings</a>
</div>
<nav class="subtabs rise d2" aria-label="Account sections">${TABS.map(([k, t]) => html`<a href="/my?tab=${k}" class="${k === tab ? 'on' : ''}" ${k === tab ? raw('aria-current="page"') : ''}>${t}${k === 'selling' && d.counts.waiting ? html`<span class="dot">${d.counts.waiting}</span>` : ''}${k === 'buying' && d.counts.toRate ? html`<span class="dot">${d.counts.toRate}</span>` : ''}</a>`)}</nav>
<div class="tab-body">
${tab === 'overview' ? overview(d) : tab === 'selling' ? selling(d) : tab === 'buying' ? buying(d) : alertsTab(d)}
</div>`;
}

import { html, inr } from '../html.js';
import { icon } from './icons.js';
import { STATUS_HELP } from '../config.js';

export const discountPct = (l) => Math.round((1 - l.ask_unit_price / l.retail_unit_price) * 100);

export const gradeBadge = (g) => html`<span class="badge g-${g}" title="Grade ${g}">Grade ${g}</span>`;

const STATUS_LABEL = { review: 'In review', awaiting_fee: 'Awaiting fee', live: 'Live', sold: 'Sold', rejected: 'Not approved', withdrawn: 'Withdrawn', open: 'Waiting', accepted: 'Accepted', declined: 'Declined' };
export const statusBadge = (s) => html`<span class="badge st-${s}">${STATUS_LABEL[s] || s}</span>`;
export const statusHelp = (s) => STATUS_HELP[s] || '';

export function listingCard(l, photo) {
  return html`<a class="card" href="/listing/${l.id}">
  <div class="thumb">
    ${photo ? html`<img src="/uploads/${photo.file}" alt="" loading="lazy" decoding="async">` : html`<div class="noimg">${icon('box')}</div>`}
    <span class="ribbon">${discountPct(l)}% off</span>
    ${l.verified ? html`<span class="verified-chip">${icon('shield')} Verified</span>` : ''}
  </div>
  <div class="card-body">
    <div class="row">${gradeBadge(l.grade)}<span class="muted small">${l.available ?? l.qty} ${l.unit} available${l.reserved ? html` · ${l.reserved} reserved` : ''}</span></div>
    <h3>${l.title}</h3>
    <p class="loc">${icon('pin', 'icon sm')}${l.area}, ${l.city}</p>
    <p class="price">${inr(l.ask_unit_price)} <small>/ ${l.unit}</small> <s class="muted small">${inr(l.retail_unit_price)}</s></p>
  </div>
</a>`;
}

export function stars(n, max = 5) {
  const full = Math.round(n);
  return html`<span class="stars" aria-label="${n.toFixed(1)} out of ${max}">${Array.from({ length: max }, (_, i) => html`<span class="${i < full ? 'on' : ''}">★</span>`)}</span>`;
}

export function sellerTrust(s) {
  if (!s || !s.count) return html`<p class="trust-line">${icon('user', 'icon sm')} New seller on Surplus Build</p>`;
  return html`<p class="trust-line">${stars(s.avg)} <strong>${s.avg.toFixed(1)}</strong> from ${s.count} buyer${s.count === 1 ? '' : 's'} &middot; ${s.asDescribed}% said the lot was as described</p>`;
}

export function empty({ iconName = 'box', title, text, cta }) {
  return html`<div class="empty reveal">
  <div class="empty-art">${icon(iconName, 'icon xl')}</div>
  <h3>${title}</h3>
  <p class="muted">${text}</p>
  ${cta || ''}
</div>`;
}

export function steps(items, cls = '') {
  return html`<ol class="steps ${cls}">${items.map(([ic, title, text], i) => html`<li class="step reveal">
    <div class="step-num">${i + 1}</div>
    <div class="step-ic">${icon(ic)}</div>
    <h3>${title}</h3>
    <p class="muted">${text}</p>
  </li>`)}</ol>`;
}

const FLOW = ['submitted', 'checked', 'live', 'sold'];
export function lotTimeline(l) {
  const at = l.status === 'review' || l.status === 'awaiting_fee' ? 1 : l.status === 'live' ? 2 : l.status === 'sold' ? 3 : -1;
  if (at < 0) return '';
  const label = { submitted: 'Submitted', checked: l.status === 'awaiting_fee' ? 'Fee due' : l.status === 'review' ? 'In review' : 'Checked', live: 'Live', sold: 'Sold' };
  return html`<ol class="timeline" aria-label="Lot progress">${FLOW.map((k, i) => html`<li class="${i < at ? 'done' : i === at ? 'now' : ''}"><span></span>${label[k]}</li>`)}</ol>`;
}

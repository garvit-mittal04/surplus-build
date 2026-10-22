import { html, raw, inr, localTime } from '../html.js';
import { icon } from './icons.js';
import { statusBadge, empty } from './components.js';

export function inspectorPage({ tasks, earnings, config }) {
  return html`
<div class="page-head rise d1"><div><p class="eyebrow">Inspector</p><h1>Your inspections</h1>
<p class="muted">Visit each site, count the stock, confirm the grade and add at least one photo. You earn ${inr(config.inspectionFee)} per completed inspection.</p></div></div>
<div class="kpis">
  <div class="kpi reveal">${icon('clipboard', 'icon')}<strong>${tasks.length}</strong><span>open tasks</span></div>
  <div class="kpi reveal">${icon('check', 'icon')}<strong>${earnings.done}</strong><span>completed</span></div>
  <div class="kpi reveal">${icon('clock', 'icon')}<strong>${inr(earnings.pending)}</strong><span>earned, not yet paid</span></div>
  <div class="kpi reveal">${icon('wallet', 'icon')}<strong>${inr(earnings.paid)}</strong><span>paid out</span></div>
</div>
${tasks.length ? html`<div class="task-list">${tasks.map((t) => html`<article class="lot-row reveal">
  <div class="lot-thumb">${icon('clipboard', 'icon lg')}</div>
  <div class="lot-main">
    <div class="row-between"><h3>${t.title}</h3><a class="btn small" href="/inspect/${t.id}">Start ${icon('arrow', 'icon sm')}</a></div>
    <p class="small">${icon('pin', 'icon xs')} ${t.address}, ${t.area}, ${t.city}</p>
    <p class="small muted">Declared: ${t.qty} ${t.unit}, grade ${t.grade}</p>
  </div>
</article>`)}</div>` : empty({ iconName: 'clipboard', title: 'No open tasks', text: 'New inspections assigned to you appear here, and we message you when one arrives.' })}`;
}

export function inspectForm({ t, errors = [] }) {
  return html`
<nav class="crumbs rise d1"><a href="/inspector">Inspections</a> <span>/</span> <span>${t.title}</span></nav>
<div class="detail narrow-detail">
  <div class="panel rise d2">
    <h2>What the seller declared</h2>
    <dl class="facts">
      <dt>Item</dt><dd>${t.brand} ${t.model}</dd>
      <dt>Batch code</dt><dd>${t.batch_code || 'None given'}</dd>
      <dt>Quantity</dt><dd>${t.qty} ${t.unit}</dd>
      <dt>Grade</dt><dd>${t.grade}</dd>
      <dt>Address</dt><dd>${t.address}, ${t.area}, ${t.city}</dd>
    </dl>
    <p class="eyebrow">Checklist</p>
    <ol class="plain small">
      <li>Count every unit. Open one box per ten to check the contents.</li>
      <li>Check the batch or shade code on several boxes against the listing.</li>
      <li>Look for damage, moisture and missing parts. Grade A must be sealed.</li>
      <li>Photograph the stock as you found it, including any problems.</li>
    </ol>
  </div>
  <form method="post" action="/inspect/${t.id}" enctype="multipart/form-data" class="panel stack rise d3">
    <h2>Your findings</h2>
    ${errors.length ? html`<div class="callout err small" role="alert">${icon('alert', 'icon sm')}<ul>${errors.map((e) => html`<li>${e}</li>`)}</ul></div>` : ''}
    <label>Does the stock match the listing?
      <select name="matches" required><option value="1">Yes, it matches</option><option value="0">No, it does not</option></select></label>
    <label>Units you counted <input type="number" name="counted_qty" min="0" required></label>
    <label>Grade you confirm
      <select name="grade_confirmed">${['A', 'B', 'C', 'D'].map((g) => html`<option value="${g}" ${g === t.grade ? raw('selected') : ''}>Grade ${g}</option>`)}</select></label>
    <label>Photos <span class="hint">At least one, up to four.</span>
      <input type="file" name="evidence" accept="image/*" capture="environment" multiple required></label>
    <label>Notes <textarea name="notes" rows="3" maxlength="800" placeholder="Anything the buyer or admin should know"></textarea></label>
    <button class="btn">${icon('check', 'icon sm')} Submit inspection</button>
  </form>
</div>`;
}

function barChart(days) {
  const W = 560, H = 160, pad = 24, n = days.length;
  const max = Math.max(1, ...days.map((d) => Math.max(d.listings, d.enquiries)));
  const bw = (W - pad * 2) / n;
  const y = (v) => H - pad - ((H - pad * 2) * v) / max;
  return raw(`<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="New lots and enquiries per day, last 14 days">
  <line x1="${pad}" y1="${H - pad}" x2="${W - pad}" y2="${H - pad}" class="axis"/>
  ${days.map((d, i) => {
    const x = pad + i * bw;
    return `<rect class="b1" x="${x + bw * 0.12}" y="${y(d.listings)}" width="${bw * 0.36}" height="${H - pad - y(d.listings)}"><title>${d.day}: ${d.listings} new lots</title></rect>
  <rect class="b2" x="${x + bw * 0.52}" y="${y(d.enquiries)}" width="${bw * 0.36}" height="${H - pad - y(d.enquiries)}"><title>${d.day}: ${d.enquiries} enquiries</title></rect>
  ${i % 2 === 0 ? `<text x="${x + bw / 2}" y="${H - 6}" text-anchor="middle">${d.day.slice(5)}</text>` : ''}`;
  }).join('')}
  <text x="${pad}" y="14" class="max">${max}</text>
</svg>`);
}

export function adminPage({ metrics: m, days, review, awaitingFee, inspectionsOpen, payouts, inspectors, listings, outbox, users, me }) {
  return html`
<div class="page-head rise d1"><div><p class="eyebrow">Admin</p><h1>Marketplace health</h1><p class="muted">The numbers that decide whether a city is working. Compare them with the 90-day gates in the plan.</p></div></div>
<div class="kpis">
  <div class="kpi reveal"><strong>${m.live}</strong><span>live lots</span></div>
  <div class="kpi reveal ${m.review ? 'hot' : ''}"><strong>${m.review}</strong><span>waiting for review</span></div>
  <div class="kpi reveal"><strong>${m.enquiryRate}</strong><span>of lots got an enquiry within 7 days</span></div>
  <div class="kpi reveal"><strong>${m.sellThrough}</strong><span>of published lots fully sold</span></div>
  <div class="kpi reveal"><strong>${m.avgDays}</strong><span>average days to sell out</span></div>
  <div class="kpi reveal"><strong>${m.realized}</strong><span>realized share of retail</span></div>
  <div class="kpi reveal"><strong>${m.repeatSellers}</strong><span>repeat sellers (2+ lots)</span></div>
  <div class="kpi reveal"><strong>${m.disputeRate}</strong><span>ratings saying “not as described”</span></div>
</div>
<div class="panel reveal"><div class="row-between"><h3>Last 14 days</h3><p class="legend small"><span class="k1"></span> New lots <span class="k2"></span> Enquiries</p></div>${barChart(days)}</div>

<h2>Review queue</h2>
${review.length ? review.map(({ l, flags, photos }) => html`<div class="panel review-item reveal">
  <div class="row-between"><a href="/listing/${l.id}"><strong>#${l.id} ${l.title}</strong></a><span class="small muted">${inr(l.ask_unit_price)} / ${l.unit}, retail ${inr(l.retail_unit_price)}</span></div>
  <div class="review-photos">${photos.map((p) => html`<a href="/uploads/${p.file}" target="_blank" rel="noopener"><img src="/uploads/${p.file}" alt="${p.kind}" loading="lazy"></a>`)}</div>
  <ul class="flags small">${flags.map((f) => html`<li>${icon('info', 'icon xs')} ${f.message}</li>`)}</ul>
  <form method="post" action="/admin/listing/${l.id}/decide" class="inline">
    <button class="btn small" name="action" value="approve">${icon('check', 'icon sm')} Approve</button>
    <input name="reason" placeholder="Reason, if rejecting" aria-label="Rejection reason">
    <button class="btn small ghost" name="action" value="reject">Reject</button>
  </form></div>`) : html`<p class="muted">${icon('check', 'icon sm')} Nothing waiting.</p>`}

${awaitingFee.length ? html`<h2>Waiting for listing fee</h2>
<div class="table-wrap"><table><tbody>${awaitingFee.map((l) => html`<tr><td>#${l.id} ${l.title}</td><td>${l.seller_phone}</td>
<td><form method="post" action="/admin/listing/${l.id}/fee" class="inline"><button class="btn small">Mark fee paid</button></form></td></tr>`)}</tbody></table></div>` : ''}

<h2>Inspections</h2>
${inspectionsOpen.length ? html`<div class="table-wrap"><table><thead><tr><th>Lot</th><th>Where</th><th>Inspector</th></tr></thead><tbody>${inspectionsOpen.map((i) => html`<tr><td>#${i.listing_id} ${i.title}</td><td>${i.area}, ${i.city}</td>
<td>${i.inspector_id ? (i.inspector_name || i.inspector_phone) : html`<form method="post" action="/admin/inspection/${i.id}/assign" class="inline">
<select name="inspector_id" required aria-label="Inspector"><option value="">Choose inspector</option>${inspectors.map((u) => html`<option value="${u.id}">${u.name || u.phone}</option>`)}</select>
<button class="btn small">Assign</button></form>`}</td></tr>`)}</tbody></table></div>` : html`<p class="muted">No open inspections.</p>`}
${inspectors.length === 0 ? html`<p class="small muted">${icon('info', 'icon xs')} No inspectors yet. Ask a freelancer to log in once, then set their role to inspector under People.</p>` : ''}
${payouts.length ? html`<h3>Inspector payouts due</h3><div class="table-wrap"><table><tbody>${payouts.map((p) => html`<tr><td>${p.inspector_name || p.inspector_phone}</td><td>#${p.listing_id} ${p.title}</td><td>${inr(p.fee)}</td>
<td><form method="post" action="/admin/inspection/${p.id}/paid" class="inline"><button class="btn small ghost">Mark paid</button></form></td></tr>`)}</tbody></table></div>` : ''}

<h2>All lots</h2>
<div class="table-wrap"><table><thead><tr><th>#</th><th>Lot</th><th>Status</th><th>City</th><th>Left</th><th>Value left</th></tr></thead><tbody>
${listings.map((l) => html`<tr><td>${l.id}</td><td><a href="/listing/${l.id}">${l.title}</a></td><td>${statusBadge(l.status)}</td><td>${l.city}</td><td>${l.qty}/${l.qty_initial}</td><td>${inr(l.ask_unit_price * l.qty)}</td></tr>`)}
</tbody></table></div>

<h2>People</h2>
<div class="table-wrap"><table><thead><tr><th>Phone</th><th>Name</th><th>City</th><th>Role</th></tr></thead><tbody>
${users.map((u) => html`<tr><td>${u.phone}</td><td>${u.name}</td><td>${u.city}</td><td>
${u.id === me.id ? u.role : html`<form method="post" action="/admin/user/${u.id}/role" class="inline">
<select name="role" aria-label="Role">${['member', 'inspector', 'admin'].map((r) => html`<option ${r === u.role ? raw('selected') : ''}>${r}</option>`)}</select>
<button class="btn small ghost">Set</button></form>`}</td></tr>`)}
</tbody></table></div>

<h2>Messages sent</h2>
<p class="small muted">Every SMS and WhatsApp message, including login codes. “Logged” means no provider is configured yet, so nothing was actually sent.</p>
<div class="table-wrap"><table><thead><tr><th>When (IST)</th><th>To</th><th>Via</th><th>Status</th><th>Message</th></tr></thead><tbody>${outbox.map((o) => html`<tr><td class="nowrap">${localTime(o.created_at)}</td><td>${o.to_phone}</td><td>${o.channel}</td><td>${o.status}${o.error ? html`<span class="small muted block">${o.error}</span>` : ''}</td><td>${o.body}</td></tr>`)}</tbody></table></div>`;
}

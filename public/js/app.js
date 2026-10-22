// Progressive enhancement for Surplus Build. Every page works without this file;
// it adds animations, the sell wizard, photo previews and resizing, the lightbox and the first-visit tour.
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const store = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
  };
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const inr = (n) => '₹' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n);

  // ---------- mobile nav ----------
  const toggle = $('.nav-toggle');
  if (toggle) toggle.addEventListener('click', () => {
    const open = document.body.classList.toggle('nav-open');
    toggle.setAttribute('aria-expanded', String(open));
  });

  // ---------- toasts ----------
  $$('.toast').forEach((t) => {
    const close = () => { t.classList.add('out'); setTimeout(() => t.remove(), 350); };
    $('.toast-x', t)?.addEventListener('click', close);
    if (t.classList.contains('ok')) setTimeout(close, 5500);
  });
  // Drop ?msg= from the address bar so a refresh does not repeat the message.
  if (location.search.includes('msg=')) {
    const u = new URL(location.href);
    u.searchParams.delete('msg');
    history.replaceState(null, '', u.pathname + (u.search || '') + u.hash);
  }

  // ---------- reveal on scroll + count-up ----------
  const countUp = (node) => {
    const target = Number(node.dataset.count) || 0;
    const suffix = node.dataset.suffix || '';
    if (reduced || target === 0) { node.textContent = target + suffix; return; }
    const start = performance.now(), dur = 1100;
    const tick = (now) => {
      const p = Math.min(1, (now - start) / dur);
      node.textContent = Math.round(target * (1 - Math.pow(1 - p, 3))) + suffix;
      if (p < 1) requestAnimationFrame(tick);
    };
    node.textContent = '0' + suffix;
    requestAnimationFrame(tick);
  };
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add('in');
        $$('[data-count]', e.target).forEach(countUp);
        io.unobserve(e.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    $$('.reveal').forEach((n) => io.observe(n));
  } else {
    $$('.reveal').forEach((n) => n.classList.add('in'));
  }

  // ---------- tabs ----------
  $$('[data-tabs]').forEach((box) => {
    const tabs = $$('[role=tab]', box);
    const show = (tab) => {
      tabs.forEach((t) => {
        const on = t === tab;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        const panel = document.getElementById(t.getAttribute('aria-controls'));
        panel.hidden = !on;
        if (on) $$('.reveal', panel).forEach((n) => n.classList.add('in'));
      });
    };
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => show(t));
      t.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
          n.focus(); show(n);
        }
      });
    });
    show(tabs.find((t) => t.getAttribute('aria-selected') === 'true') || tabs[0]);
  });

  // ---------- auto-submit filters on select change ----------
  $$('form[data-autosubmit] select').forEach((s) => s.addEventListener('change', () => s.form.requestSubmit()));

  // ---------- confirm before destructive actions ----------
  $$('form[data-confirm]').forEach((f) => f.addEventListener('submit', (e) => { if (!window.confirm(f.dataset.confirm)) e.preventDefault(); }));

  // ---------- listing gallery + lightbox ----------
  const gallery = $('[data-gallery]');
  if (gallery) {
    const main = $('[data-main]', gallery);
    $$('.thumb-btn', gallery).forEach((b) => b.addEventListener('click', () => {
      if (!main) return;
      $$('.thumb-btn', gallery).forEach((x) => x.classList.toggle('on', x === b));
      main.classList.add('swap');
      setTimeout(() => { main.src = b.dataset.src; main.alt = b.dataset.alt; main.classList.remove('swap'); }, reduced ? 0 : 160);
    }));
    const dlg = $('[data-lightbox-dialog]');
    const big = $('[data-lightbox-img]');
    $('[data-lightbox]', gallery)?.addEventListener('click', () => {
      if (!dlg?.showModal) return window.open(main.src, '_blank');
      big.src = main.src; big.alt = main.alt; dlg.showModal();
    });
    dlg?.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  }
  $$('.save-fill').forEach((f) => requestAnimationFrame(() => setTimeout(() => { f.style.width = (Number(f.dataset.fill) || 0) + '%'; }, 250)));

  // ---------- photo previews + client-side resizing ----------
  async function shrink(file) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 400 * 1024) return file;
    try {
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
      const canvas = el('canvas');
      canvas.width = Math.round(bmp.width * scale);
      canvas.height = Math.round(bmp.height * scale);
      canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
      if (!blob || blob.size >= file.size) return file;
      return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
    } catch { return file; }
  }
  $$('[data-photo]').forEach((tile) => {
    const input = $('input[type=file]', tile);
    const prev = $('[data-preview]', tile);
    input.addEventListener('change', async () => {
      tile.classList.remove('missing');
      prev.replaceChildren();
      const files = [...input.files];
      if (!files.length) { tile.classList.remove('has-file'); return; }
      tile.classList.add('busy');
      const out = await Promise.all(files.map(shrink));
      if ('DataTransfer' in window) {
        try { const dt = new DataTransfer(); out.forEach((f) => dt.items.add(f)); input.files = dt.files; } catch {}
      }
      out.slice(0, 4).forEach((f) => { const img = el('img'); img.src = URL.createObjectURL(f); img.alt = ''; prev.append(img); });
      tile.classList.remove('busy');
      tile.classList.add('has-file');
      updateSummary();
    });
  });

  // ---------- sell wizard ----------
  const wiz = $('[data-wizard]');
  let updateSummary = () => {};
  if (wiz) {
    wiz.noValidate = true;
    wiz.classList.add('wiz-on');
    const steps = $$('.wstep', wiz);
    const fill = $('[data-wiz-fill]', wiz);
    const labels = $$('[data-wiz-label]', wiz);
    let at = 0;

    const cat = $('#f-category', wiz), batch = $('#f-batch_code', wiz), batchHint = $('[data-batch-hint]', wiz);
    const batchCats = (cat?.dataset.batchCats || '').split(',');
    const syncBatch = () => {
      const need = batchCats.includes(cat.value);
      batch.required = need;
      batchHint.textContent = need ? 'Required for tiles and stone: it is on the box label.' : 'Optional for this category.';
    };
    cat?.addEventListener('change', syncBatch); if (cat) syncBatch();

    const show = (i, focus = true) => {
      at = Math.max(0, Math.min(steps.length - 1, i));
      steps.forEach((s, k) => { s.hidden = k !== at; s.classList.toggle('enter', k === at); });
      if (fill) fill.style.width = ((at + 1) / steps.length) * 100 + '%';
      labels.forEach((l, k) => { l.classList.toggle('done', k < at); l.classList.toggle('now', k === at); });
      if (focus) {
        $('h2', steps[at])?.setAttribute('tabindex', '-1');
        $('h2', steps[at])?.focus({ preventScroll: true });
        wiz.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
      }
      if (at === steps.length - 1) updateSummary();
    };

    const firstInvalid = (step) => {
      for (const f of $$('input, select, textarea', step)) {
        if (f.checkValidity()) continue;
        if (f.type === 'file') {
          const tile = f.closest('[data-photo]');
          tile.classList.remove('missing'); void tile.offsetWidth; tile.classList.add('missing');
          return { field: f, file: true };
        }
        return { field: f };
      }
      return null;
    };
    const check = (k) => {
      const bad = firstInvalid(steps[k]);
      if (!bad) return true;
      if (k !== at) show(k, false);
      if (bad.file) bad.field.closest('[data-photo]').scrollIntoView({ behavior: 'smooth', block: 'center' });
      else bad.field.reportValidity();
      return false;
    };

    $$('[data-next]', wiz).forEach((b) => b.addEventListener('click', () => { if (check(at)) show(at + 1); }));
    $$('[data-back]', wiz).forEach((b) => b.addEventListener('click', () => show(at - 1)));
    wiz.addEventListener('submit', (e) => {
      for (let k = 0; k < steps.length; k++) if (!check(k)) { e.preventDefault(); return; }
      const btn = $('[data-submit]', wiz);
      btn.disabled = true;
      btn.classList.add('loading');
      btn.lastChild.textContent = ' Uploading and checking…';
    });
    // Enter in a text field moves to the next step instead of submitting early.
    wiz.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.tagName === 'INPUT' && at < steps.length - 1) { e.preventDefault(); if (check(at)) show(at + 1); }
    });

    // live price preview
    const qty = $('#f-qty', wiz), retail = $('#f-retail_unit_price', wiz), ask = $('#f-ask_unit_price', wiz), unit = $('#f-unit', wiz);
    const preview = $('[data-price-preview]', wiz);
    const renderPrice = () => {
      const r = Number(retail.value), a = Number(ask.value), q = Number(qty.value) || 0;
      preview.replaceChildren();
      if (!(r > 0 && a > 0)) { preview.append(el('p', 'muted', 'Enter both prices to see what buyers will see.')); return; }
      const pct = Math.round((1 - a / r) * 100);
      const line = el('p', 'pp-main');
      line.append(el('strong', '', `${inr(a)} per ${unit.value}`), document.createTextNode(' · '), el('span', pct > 0 ? 'accent' : 'warn', pct > 0 ? `${pct}% off retail` : 'not below retail'));
      const bar = el('div', 'save-bar'); const f = el('span', 'save-fill'); bar.append(f);
      requestAnimationFrame(() => { f.style.width = Math.max(0, Math.min(100, (a / r) * 100)) + '%'; });
      preview.append(line, bar);
      if (q) preview.append(el('p', 'small muted', `Whole lot: ${inr(a * q)} (retail value ${inr(r * q)}).`));
      if (pct <= 0) preview.append(el('p', 'small warn', 'Lots priced at or above retail go to a person for review and rarely sell.'));
      else if (a < r * 0.1) preview.append(el('p', 'small warn', 'Under 10% of retail looks like a typo, so a person will check it.'));
      else if (pct < 25) preview.append(el('p', 'small muted', 'Small discount. Buyers here usually expect 30% or more off.'));
    };
    [qty, retail, ask, unit].forEach((i) => i?.addEventListener('input', renderPrice));
    if (preview) renderPrice();

    // review summary on the last step
    const summary = $('[data-summary]', wiz);
    updateSummary = () => {
      if (!summary) return;
      const v = (n) => wiz.elements[n]?.value || '';
      const grade = wiz.querySelector('input[name=grade]:checked')?.value || '';
      const photos = $$('input[type=file]', wiz).reduce((n, i) => n + i.files.length, 0);
      const rows = [
        ['Lot', v('title')],
        ['Category', cat?.selectedOptions[0]?.textContent || ''],
        ['Brand and model', `${v('brand')} ${v('model')}`.trim()],
        ['Quantity', v('qty') ? `${v('qty')} ${v('unit')}` : ''],
        ['Asking price', v('ask_unit_price') ? `${inr(Number(v('ask_unit_price')))} per ${v('unit')}` : ''],
        ['Grade', grade],
        ['Photos', `${photos} added`],
      ];
      summary.replaceChildren(el('p', 'eyebrow', 'Check before you submit'));
      const dl = el('dl', 'facts');
      rows.forEach(([k, val]) => { dl.append(el('dt', '', k), el('dd', val ? '' : 'warn', val || 'Missing')); });
      summary.append(dl);
    };

    // If the server sent the form back with errors, open the step holding the first problem field.
    show(0, false);
  }

  // ---------- first-visit tour (home page) ----------
  const tourTargets = [
    ['search', 'Search nearby lots', 'Type a brand, model or item and pick your city. Results show the discount off today’s retail price.'],
    ['sell', 'Sell your leftovers', 'List surplus in five short steps with photos from your phone. Listing is free in the pilot.'],
    ['guide', 'New here?', 'This guide explains grades, checks, inspections and how to pick up safely.'],
    ['login', 'Log in with your number', 'No password. We text you a 6-digit code.'],
  ].filter(([k]) => $(`[data-tour="${k}"]`));
  const wantTour = new URLSearchParams(location.search).get('tour') === '1';
  if (tourTargets.length >= 3 && (wantTour || !store.get('sb_tour_done'))) setTimeout(() => runTour(tourTargets), wantTour ? 300 : 1400);

  function runTour(items) {
    let i = 0;
    const shade = el('div', 'tour-spot');
    const tip = el('div', 'tour-tip');
    tip.setAttribute('role', 'dialog');
    tip.setAttribute('aria-live', 'polite');
    document.body.append(shade, tip);
    const end = () => { store.set('sb_tour_done', '1'); shade.remove(); tip.remove(); window.removeEventListener('resize', place); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') end(); };
    document.addEventListener('keydown', onKey);
    function place() {
      const [key, title, text] = items[i];
      let target = $(`[data-tour="${key}"]`);
      if (target && target.offsetParent === null && key === 'login') target = toggle || target;
      target.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
      setTimeout(() => {
        const r = target.getBoundingClientRect();
        const pad = 8;
        Object.assign(shade.style, { top: r.top - pad + 'px', left: r.left - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
        tip.replaceChildren(
          el('p', 'eyebrow', `Step ${i + 1} of ${items.length}`),
          el('h3', '', title),
          el('p', '', text)
        );
        const row = el('div', 'tour-btns');
        const skip = el('button', 'link', 'Skip tour'); skip.type = 'button'; skip.onclick = end;
        const next = el('button', 'btn small', i === items.length - 1 ? 'Got it' : 'Next'); next.type = 'button';
        next.onclick = () => { if (++i >= items.length) end(); else place(); };
        row.append(skip, next); tip.append(row);
        const below = r.bottom + 220 < innerHeight;
        const w = Math.min(320, innerWidth - 24);
        tip.style.width = w + 'px';
        tip.style.left = Math.max(12, Math.min(innerWidth - w - 12, r.left + r.width / 2 - w / 2)) + 'px';
        tip.style.top = (below ? r.bottom + 16 : Math.max(12, r.top - 16 - tip.offsetHeight)) + 'px';
        tip.classList.remove('show'); void tip.offsetWidth; tip.classList.add('show');
        next.focus({ preventScroll: true });
      }, reduced ? 0 : 350);
    }
    window.addEventListener('resize', place);
    place();
  }
})();

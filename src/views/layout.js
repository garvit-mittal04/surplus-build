import { html } from '../html.js';
import { icon } from './icons.js';

export function layout({ user, title, body, msg, error, description, path = '/', v = '' }) {
  const nav = (href, label) => html`<a href="${href}" class="${path === href || (href !== '/' && path.startsWith(href)) ? 'active' : ''}">${label}</a>`;
  return html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${title} | Surplus Build</title>
<meta name="description" content="${description || 'Buy and sell verified surplus building materials near you: sanitaryware, lights, doors, plywood, tiles and office furniture at 30 to 70% off retail.'}">
<meta property="og:title" content="${title} | Surplus Build">
<meta property="og:description" content="${description || 'Verified surplus building materials near you. Inspect before you pay.'}">
<meta name="theme-color" content="#0f766e">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="stylesheet" href="/style.css?v=${v}">
<script src="/js/boot.js?v=${v}"></script>
<script src="/js/app.js?v=${v}" defer></script>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="top">
  <div class="top-inner">
    <a class="brand" href="/" aria-label="Surplus Build home">
      <span class="logo" aria-hidden="true">${icon('box')}</span><span class="wordmark">Surplus<span>Build</span></span>
    </a>
    <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav" aria-label="Menu">${icon('menu')}</button>
    <nav id="site-nav" class="nav">
      ${nav('/browse', 'Browse')}
      ${nav('/sell/new', 'Sell')}
      ${nav('/how-it-works', 'How it works')}
      ${user ? nav('/my', 'My account') : ''}
      ${user && (user.role === 'inspector' || user.role === 'admin') ? nav('/inspector', 'Inspections') : ''}
      ${user && user.role === 'admin' ? nav('/admin', 'Admin') : ''}
      ${user
        ? html`<form method="post" action="/logout" class="inline"><button class="link">Log out</button></form>`
        : html`<a href="/login" class="btn small" data-tour="login">Log in</a>`}
    </nav>
  </div>
</header>
<div class="toasts" aria-live="polite">
  ${msg ? html`<div class="toast ok" role="status">${icon('check')}<span>${msg}</span><button class="toast-x" type="button" aria-label="Dismiss">${icon('x')}</button></div>` : ''}
  ${error ? html`<div class="toast err" role="alert">${icon('alert')}<span>${error}</span><button class="toast-x" type="button" aria-label="Dismiss">${icon('x')}</button></div>` : ''}
</div>
<main id="main" class="page">
${body}
</main>
<footer class="foot">
  <div class="foot-inner">
    <div>
      <a class="brand small" href="/"><span class="logo" aria-hidden="true">${icon('box')}</span><span class="wordmark">Surplus<span>Build</span></span></a>
      <p class="muted">Leftover building materials from fit-outs and renovations, checked and close by. Inspect before you pay.</p>
    </div>
    <div class="foot-links">
      <a href="/how-it-works">How it works</a>
      <a href="/how-it-works#grades">Grades explained</a>
      <a href="/how-it-works#safety">Safe pickup</a>
      <a href="/?tour=1">Take the tour</a>
      <a href="/terms">Terms (draft)</a>
      <a href="/privacy">Privacy (draft)</a>
    </div>
  </div>
</footer>
</body>
</html>`;
}

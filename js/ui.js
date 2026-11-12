/**
 * Shared UI helpers: icons, toasts, modals, charts, router, session guard.
 * All dynamic text is escaped through U.escapeHtml before touching innerHTML.
 */
(function (root) {
  const AMS = (root.AMS = root.AMS || {});
  const U = AMS.utils;
  const esc = U.escapeHtml;

  // ------------------------------------------------------------------ icons
  const p = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const icons = {
    logo: p('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    dashboard: p('<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>'),
    users: p('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>'),
    calendar: p('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>'),
    clock: p('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    alert: p('<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>'),
    report: p('<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>'),
    logout: p('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>'),
    menu: p('<path d="M3 6h18M3 12h18M3 18h18"/>'),
    check: p('<path d="M20 6 9 17l-5-5"/>'),
    x: p('<path d="M18 6 6 18M6 6l12 12"/>'),
    plus: p('<path d="M12 5v14M5 12h14"/>'),
    download: p('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>'),
    history: p('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>'),
    user: p('<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>'),
    shield: p('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>'),
    inbox: p('<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.7 4H7.3a2 2 0 0 0-1.8 1.1z"/>'),
    login: p('<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"/>'),
    timer: p('<path d="M10 2h4M12 14l3-3"/><circle cx="12" cy="14" r="8"/>'),
    print: p('<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>'),
    key: p('<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 9.8-9.8M16 7l3 3"/>'),
    info: p('<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>'),
  };

  // ------------------------------------------------------------------ toasts
  function toast(message, type) {
    let box = document.querySelector('.toasts');
    if (!box) {
      box = document.createElement('div');
      box.className = 'toasts';
      box.setAttribute('role', 'status');
      box.setAttribute('aria-live', 'polite');
      document.body.appendChild(box);
    }
    const t = document.createElement('div');
    t.className = 'toast toast--' + (type || 'info');
    t.textContent = message;
    box.appendChild(t);
    setTimeout(() => t.remove(), type === 'error' ? 6000 : 3500);
  }

  function errMsg(e) { return (e && (e.userMessage || e.message)) || 'Something went wrong.'; }
  function toastError(e) { console.error(e); toast(errMsg(e), 'error'); }

  // ------------------------------------------------------------------- modal
  /**
   * openModal({ title, body, submitLabel, submitClass, cancelLabel, onSubmit(form)->Promise<bool|void> })
   * `body` is trusted HTML built with esc(). Returns { close, el }.
   */
  function openModal(opts) {
    const wrap = document.createElement('div');
    wrap.className = 'modal';
    wrap.innerHTML = `
      <form class="modal__dialog" role="dialog" aria-modal="true" aria-label="${esc(opts.title)}" novalidate>
        <div class="modal__head"><h2>${esc(opts.title)}</h2>
          <button type="button" class="icon-btn" data-close aria-label="Close">${icons.x}</button></div>
        <div class="modal__body">
          <div class="form-error" data-error hidden></div>${opts.body}
        </div>
        <div class="modal__foot">
          <button type="button" class="btn btn--ghost" data-close>${esc(opts.cancelLabel || 'Cancel')}</button>
          ${opts.submitLabel ? `<button type="submit" class="btn ${esc(opts.submitClass || 'btn--primary')}">${esc(opts.submitLabel)}</button>` : ''}
        </div>
      </form>`;
    document.body.appendChild(wrap);
    const form = wrap.querySelector('form');
    const prevFocus = document.activeElement;
    const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); if (prevFocus && prevFocus.focus) prevFocus.focus(); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) close(); });
    wrap.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!opts.onSubmit) return;
      const btn = form.querySelector('button[type=submit]');
      const errBox = form.querySelector('[data-error]');
      errBox.hidden = true;
      btn.setAttribute('aria-busy', 'true'); btn.disabled = true;
      try {
        const keepOpen = await opts.onSubmit(form);
        if (keepOpen !== false) close();
      } catch (err) {
        errBox.textContent = errMsg(err); errBox.hidden = false;
        btn.removeAttribute('aria-busy'); btn.disabled = false;
      }
    });
    const first = form.querySelector('input:not([type=hidden]), select, textarea');
    (first || form.querySelector('.btn')).focus();
    return { close, el: wrap };
  }

  function confirmDialog({ title, message, confirmLabel, danger }) {
    return new Promise((resolve) => {
      let done = false;
      const m = openModal({
        title,
        body: `<p>${esc(message)}</p>`,
        submitLabel: confirmLabel || 'Confirm',
        submitClass: danger ? 'btn--danger' : 'btn--primary',
        onSubmit: async () => { done = true; resolve(true); },
      });
      const obs = new MutationObserver(() => { if (!document.body.contains(m.el)) { obs.disconnect(); if (!done) resolve(false); } });
      obs.observe(document.body, { childList: true });
    });
  }

  // ----------------------------------------------------------------- badges
  const STATUS = {
    present: ['green', 'Present'], late: ['amber', 'Late'], working: ['blue', 'Working'],
    incomplete: ['red', 'No check-out'], absent: ['red', 'Absent'], pending: ['gray', 'Not in yet'],
    off: ['gray', 'Day off'], upcoming: ['gray', 'Upcoming'],
  };
  function statusBadge(status) {
    const s = STATUS[status] || ['gray', status];
    return `<span class="badge badge--${s[0]}">${esc(s[1])}</span>`;
  }
  const badge = (text, color) => `<span class="badge badge--${color}">${esc(text)}</span>`;

  // ----------------------------------------------------------------- charts
  /** Donut showing used/allowance. Colour shifts as the allowance is consumed. */
  function donut(used, allowance, centerTop, centerBottom) {
    const r = 70, c = 2 * Math.PI * r;
    const pct = allowance ? Math.min(1, used / allowance) : 0;
    const cls = used > allowance ? 'donut__bar--full' : pct >= 0.8 ? 'donut__bar--warn' : '';
    return `<div class="donut" role="img" aria-label="${esc(centerTop)} ${esc(centerBottom)}">
      <svg viewBox="0 0 170 170"><circle class="donut__track" cx="85" cy="85" r="${r}" fill="none" stroke-width="16"/>
      <circle class="donut__bar ${cls}" cx="85" cy="85" r="${r}" fill="none" stroke-width="16"
        stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${(c * (1 - pct)).toFixed(2)}"/></svg>
      <div class="donut__label"><strong>${esc(centerTop)}</strong><span>${esc(centerBottom)}</span></div></div>`;
  }

  /** Stacked columns: data = [{label, present, late, absent}] */
  function stackedBars(data) {
    const max = Math.max(1, ...data.map((d) => d.present + d.late + d.absent));
    return `<div class="bars" role="img" aria-label="Attendance for recent working days">${data.map((d) => {
      const total = d.present + d.late + d.absent;
      const h = (n) => (n / max) * 100;
      return `<div class="bars__col" title="${esc(d.label)}: ${d.present} on time, ${d.late} late, ${d.absent} absent">
        <span class="bars__val">${total ? d.present + d.late : '–'}</span>
        <div class="bars__stack" style="height:${Math.max(2, h(total) * 0.78)}%">
          <div class="bars__seg--present" style="height:${total ? (d.present / total) * 100 : 0}%"></div>
          <div class="bars__seg--late" style="height:${total ? (d.late / total) * 100 : 0}%"></div>
          <div class="bars__seg--absent" style="height:${total ? (d.absent / total) * 100 : 0}%"></div>
        </div><span class="bars__label">${esc(d.label)}</span></div>`;
    }).join('')}</div>
    <div class="legend"><span><i style="background:var(--blue-600)"></i>On time</span><span><i style="background:#f5a524"></i>Late</span><span><i style="background:#e8a1a9"></i>Absent</span></div>`;
  }

  /** Horizontal bars vs a limit. rows = [{name, value}] */
  function limitBars(rows, limit) {
    return `<div class="hbar">${rows.map((r) => {
      const pct = Math.min(100, (r.value / limit) * 100);
      const cls = r.value > limit ? 'meter--full' : r.value >= limit * 0.8 ? 'meter--warn' : '';
      return `<div class="hbar__row"><span class="name" title="${esc(r.name)}">${esc(r.name)}</span>
        <div class="meter ${cls}"><span style="width:${pct}%"></span></div>
        <span class="val">${U.minutesToText(r.value)}</span></div>`;
    }).join('')}</div>`;
  }

  function meter(used, allowance) {
    const pct = Math.min(100, (used / allowance) * 100);
    const cls = used > allowance ? 'meter--full' : used >= allowance * 0.8 ? 'meter--warn' : '';
    return `<div class="meter ${cls}" role="progressbar" aria-valuemin="0" aria-valuemax="${allowance}" aria-valuenow="${Math.min(used, allowance)}"><span style="width:${pct}%"></span></div>`;
  }

  function empty(title, text) {
    return `<div class="empty">${icons.inbox}<strong>${esc(title)}</strong><div>${esc(text || '')}</div></div>`;
  }

  function person(emp, sub) {
    return `<div class="cell-person"><span class="avatar avatar--sm">${esc(U.initials(emp.name))}</span>
      <div><strong>${esc(emp.name)}</strong><small>${esc(sub == null ? emp.designation || '' : sub)}</small></div></div>`;
  }

  // ------------------------------------------------------------------ shell
  function startClock(timeEl, dateEl) {
    const tick = () => {
      const now = new Date();
      timeEl.textContent = new Intl.DateTimeFormat('en-IN', { timeZone: AMS.config.timezone, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }).format(now).toUpperCase();
      if (dateEl) dateEl.textContent = new Intl.DateTimeFormat('en-GB', { timeZone: AMS.config.timezone, weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' }).format(now) + ' · IST';
    };
    tick();
    return setInterval(tick, 1000);
  }

  /** Redirects to the sign-in page unless a session with `role` exists. */
  async function guard(role) {
    try {
      const user = await AMS.store.getSession();
      if (!user || user.role !== role) { location.replace('index.html'); return null; }
      return user;
    } catch (e) { location.replace('index.html'); return null; }
  }

  /**
   * Hash router. views = { name: { title, render(containerEl) } }
   * Sections are already present in the HTML as <section data-view="name">.
   */
  function createRouter(views, defaultView, onChange) {
    const navItems = document.querySelectorAll('[data-nav]');
    async function go() {
      const name = (location.hash || '').replace('#', '') || defaultView;
      const view = views[name] ? name : defaultView;
      document.querySelectorAll('[data-view]').forEach((s) => { s.hidden = s.dataset.view !== view; });
      navItems.forEach((n) => n.classList.toggle('is-active', n.dataset.nav === view));
      const title = document.getElementById('topbarTitle');
      if (title) title.textContent = views[view].title;
      document.title = `${views[view].title} · ${AMS.config.appName}`;
      document.body.classList.remove('nav-open');
      window.scrollTo(0, 0);
      try { await views[view].render(); } catch (e) { toastError(e); }
      if (onChange) onChange(view);
    }
    window.addEventListener('hashchange', go);
    return { go, refresh: go };
  }

  function wireShell() {
    const open = () => document.body.classList.toggle('nav-open');
    document.getElementById('menuBtn')?.addEventListener('click', open);
    document.getElementById('overlay')?.addEventListener('click', () => document.body.classList.remove('nav-open'));
    const clockT = document.getElementById('clockTime');
    if (clockT) startClock(clockT, document.getElementById('clockDate'));
    document.getElementById('logoutBtn')?.addEventListener('click', async () => {
      await AMS.store.logout(); location.replace('index.html');
    });
  }

  /** Password change dialog shared by both panels. */
  function openChangePassword() {
    openModal({
      title: 'Change password',
      submitLabel: 'Update password',
      body: `<div class="field"><label for="cp0">Current password</label><input class="input" id="cp0" name="old" type="password" autocomplete="current-password" required></div>
        <div class="field"><label for="cp1">New password</label><input class="input" id="cp1" name="n1" type="password" autocomplete="new-password" required>
        <span class="hint">At least ${AMS.config.minPasswordLength} characters, with letters and numbers.</span></div>
        <div class="field"><label for="cp2">Confirm new password</label><input class="input" id="cp2" name="n2" type="password" autocomplete="new-password" required></div>`,
      onSubmit: async (f) => {
        if (f.n1.value !== f.n2.value) throw new Error('New passwords do not match.');
        await AMS.store.changePassword(f.old.value, f.n1.value);
        toast('Password updated.', 'success');
      },
    });
  }

  function setupPasswordToggles(scope) {
    (scope || document).querySelectorAll('[data-pw-toggle]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const input = btn.parentElement.querySelector('input');
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        btn.textContent = show ? 'Hide' : 'Show';
      });
    });
  }

  AMS.ui = {
    icons, toast, toastError, errMsg, openModal, confirmDialog, statusBadge, badge, donut,
    stackedBars, limitBars, meter, empty, person, startClock, guard, createRouter, wireShell,
    openChangePassword, setupPasswordToggles,
  };
})(typeof window !== 'undefined' ? window : globalThis);

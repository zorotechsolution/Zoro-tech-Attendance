/** Sign-in page controller (also handles one-time admin setup). */
(function () {
  const { store, ui, config } = window.AMS;
  const $ = (id) => document.getElementById(id);

  function fillStatic() {
    $('brandIcon').innerHTML = ui.icons.logo;
    $('brandName').textContent = config.appName;
    $('companyName').textContent = config.companyName;
    $('year').textContent = new Date().getFullYear();
    $('pwHint').textContent = `At least ${config.minPasswordLength} characters, with letters and numbers.`;
    document.querySelectorAll('[data-icon]').forEach((el) => { el.innerHTML = ui.icons[el.dataset.icon]; });
    ui.setupPasswordToggles();
  }

  function showError(el, msg) { el.textContent = msg; el.hidden = false; }

  async function busy(btn, label, fn) {
    const original = btn.textContent;
    btn.disabled = true; btn.setAttribute('aria-busy', 'true'); btn.textContent = label;
    try { await fn(); } finally { btn.disabled = false; btn.removeAttribute('aria-busy'); btn.textContent = original; }
  }

  function redirectFor(user) { location.replace(user.role === 'admin' ? 'admin.html' : 'employee.html'); }

  async function init() {
    fillStatic();
    const existing = await store.getSession();
    if (existing) return redirectFor(existing);

    if (await store.needsSetup()) $('setupForm').hidden = false;
    else $('loginForm').hidden = false;

    $('loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      $('loginError').hidden = true;
      await busy($('loginBtn'), 'Signing in…', async () => {
        try {
          const user = await store.login($('email').value, $('password').value);
          redirectFor(user);
        } catch (err) { showError($('loginError'), ui.errMsg(err)); $('password').value = ''; }
      });
    });

    $('setupForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      $('setupError').hidden = true;
      await busy($('setupBtn'), 'Creating…', async () => {
        try {
          if (f.password.value !== f.confirm.value) throw new Error('Passwords do not match.');
          await store.createAdmin({ name: f.name.value, email: f.email.value, password: f.password.value });
          const user = await store.login(f.email.value, f.password.value);
          redirectFor(user);
        } catch (err) { showError($('setupError'), ui.errMsg(err)); }
      });
    });
  }

  init().catch((e) => {
    $('loginForm').hidden = false;
    showError($('loginError'), ui.errMsg(e));
  });
})();

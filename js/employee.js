/** Employee panel controller. */
(function () {
  const AMS = window.AMS;
  const { store, ui, rules: R, utils: U, config: C } = AMS;
  const esc = U.escapeHtml;
  const $ = (id) => document.getElementById(id);

  let me = null;
  let router = null;
  let ticker = null;

  // ------------------------------------------------------------------ helpers
  async function load() {
    const [attendance, permissions, deductions] = await Promise.all([
      store.listAttendance(), store.listPermissions(), store.listDeductions(),
    ]);
    return { attendance, permissions, deductions };
  }

  function table(cols, rows, footer) {
    return `<div class="table-wrap"><table class="table table--stack"><thead><tr>${cols.map((c) => `<th class="${c.cls || ''}">${esc(c.label)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((r) => `<tr>${r.map((cell, i) => `<td data-label="${esc(cols[i].label)}" class="${cols[i].cls || ''}${i === 0 ? ' cell-first' : ''}">${cell}</td>`).join('')}</tr>`).join('')}</tbody></table></div>${footer ? `<div class="table-foot">${footer}</div>` : ''}`;
  }

  function statCard(icon, tone, label, value, sub) {
    return `<div class="card stat"><div class="stat__icon ${tone ? 'stat__icon--' + tone : ''}">${ui.icons[icon]}</div>
      <div><div class="stat__label">${esc(label)}</div><div class="stat__value">${esc(value)}</div><div class="stat__sub">${esc(sub || '')}</div></div></div>`;
  }

  const fmtDateRow = (d) => `${esc(U.formatDate(d))} <span class="muted">${esc(U.formatWeekday(d))}</span>`;
  const myPerms = (data) => data.permissions.filter((p) => p.employeeId === me.id);

  /** Donut + meter + key figures for a monthly summary. */
  function balanceBlock(sum) {
    const center = sum.excess > 0 ? `+${U.minutesToText(sum.excess)}` : U.minutesToText(sum.remaining);
    const caption = sum.excess > 0 ? 'excess' : 'remaining';
    return `${ui.donut(sum.used, sum.allowance, center, caption)}
      <div class="mt-2">${ui.meter(sum.used, sum.allowance)}</div>
      <div class="kv mt-1">
        <div><span>Monthly allowance</span><strong>${esc(U.minutesToText(sum.allowance))}</strong></div>
        <div><span>Used</span><strong>${esc(U.minutesToText(sum.used))}</strong></div>
        <div><span>Remaining</span><strong>${esc(U.minutesToText(sum.remaining))}</strong></div>
        <div><span>Excess</span><strong style="${sum.excess ? 'color:var(--danger)' : ''}">${esc(U.minutesToText(sum.excess))}</strong></div>
      </div>`;
  }

  // -------------------------------------------------------------------- today
  function renderHero(todayRec, now) {
    const working = U.isWorkingDay(now.dateKey);
    const st = todayRec ? R.recordStatus(todayRec, now) : null;
    let msg;
    if (!working) msg = 'Today is a day off. Enjoy your rest!';
    else if (!todayRec) msg = `Office hours: ${U.formatClock(C.workStart)} – ${U.formatClock(C.workEnd)}`;
    else if (!todayRec.checkOut) msg = st.isLate ? `You checked in ${U.minutesToText(st.lateMinutes)} after start time.` : 'You are checked in. Have a productive day!';
    else msg = 'You have checked out. See you next working day!';

    const canIn = working && !todayRec;
    const canOut = !!todayRec && !todayRec.checkOut;
    const hour = Number(now.time.slice(0, 2));
    const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

    $('hero').innerHTML = `
      <h2>${greet}, ${esc(me.name.split(' ')[0])}</h2><p>${esc(msg)}</p>
      <div class="hero__row">
        <div class="hero__metric"><span>Check-in</span><strong>${esc(U.formatTime(todayRec && todayRec.checkIn))}</strong></div>
        <div class="hero__metric"><span>Check-out</span><strong>${esc(U.formatTime(todayRec && todayRec.checkOut))}</strong></div>
        <div class="hero__metric"><span>Time at work</span><strong id="liveWork">${todayRec ? esc(U.minutesToText(todayRec.checkOut ? st.workedMinutes : U.minutesBetweenIso(todayRec.checkIn, new Date().toISOString()))) : '—'}</strong></div>
      </div>
      <div class="hero__actions">
        <button class="btn btn--primary btn--lg" id="checkInBtn" type="button" ${canIn ? '' : 'disabled'}><span data-icon="login"></span>Check in</button>
        <button class="btn btn--ghost btn--lg" id="checkOutBtn" type="button" ${canOut ? '' : 'disabled'}><span data-icon="logout"></span>Check out</button>
      </div>`;
    $('hero').querySelectorAll('[data-icon]').forEach((el) => { el.innerHTML = ui.icons[el.dataset.icon]; });

    $('checkInBtn').addEventListener('click', async (e) => {
      e.currentTarget.disabled = true;
      try { await store.checkIn(); ui.toast('Checked in. Have a great day!', 'success'); router.refresh(); }
      catch (err) { ui.toastError(err); router.refresh(); }
    });
    $('checkOutBtn').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const n = U.nowIST();
      if (n.minutes < U.timeToMinutes(C.workEnd)) {
        const left = U.timeToMinutes(C.workEnd) - n.minutes;
        const ok = await ui.confirmDialog({
          title: 'Check out early?',
          message: `Office hours end at ${U.formatClock(C.workEnd)}. You are leaving ${U.minutesToText(left)} early. If this is a planned absence, record it under Permission.`,
          confirmLabel: 'Check out now',
        });
        if (!ok) return;
      }
      btn.disabled = true;
      try { await store.checkOut(); ui.toast('Checked out. See you soon!', 'success'); router.refresh(); }
      catch (err) { ui.toastError(err); router.refresh(); }
    });

    clearInterval(ticker);
    if (canOut) {
      ticker = setInterval(() => {
        const el = $('liveWork');
        if (!el) return clearInterval(ticker);
        el.textContent = U.minutesToText(U.minutesBetweenIso(todayRec.checkIn, new Date().toISOString()));
      }, 15000);
    }
  }

  async function renderToday() {
    const data = await load();
    const now = U.nowIST();
    const todayRec = data.attendance.find((a) => a.date === now.dateKey) || null;
    renderHero(todayRec, now);

    const sum = R.permissionSummary(myPerms(data), now.monthKey);
    const ms = R.monthlySummary(me, data.attendance, data.permissions, now.monthKey, now);
    $('todayStats').innerHTML = [
      statCard('check', 'green', 'Days present', String(ms.present), `${U.formatMonth(now.monthKey)}`),
      statCard('clock', 'amber', 'Late arrivals', String(ms.late), 'This month'),
      statCard('timer', '', 'Permission left', U.minutesToText(sum.remaining), `of ${U.minutesToText(sum.allowance)}`),
      statCard('alert', sum.excess ? 'red' : '', 'Excess permission', U.minutesToText(sum.excess), sum.excess ? 'Beyond allowance' : 'Within allowance'),
    ].join('');

    const recent = data.attendance.slice(0, 5).map((a) => ({ a, s: R.recordStatus(a, now) }));
    $('todayRecent').innerHTML = recent.length ? table(
      [{ label: 'Date' }, { label: 'In' }, { label: 'Out' }, { label: 'Status' }],
      recent.map((r) => [fmtDateRow(r.a.date), esc(U.formatTime(r.a.checkIn)), esc(U.formatTime(r.a.checkOut)), ui.statusBadge(r.s.status)])
    ) : ui.empty('No attendance yet', 'Your check-ins will appear here.');

    $('todayPermSub').textContent = U.formatMonth(now.monthKey);
    $('todayPerm').innerHTML = balanceBlock(sum) + `<a class="btn btn--ghost btn--block mt-2" href="#permission">Record permission</a>`;
  }

  // ------------------------------------------------------------------ history
  async function renderHistory() {
    const data = await load();
    const now = U.nowIST();
    if (!$('histMonth').value) $('histMonth').value = now.monthKey;
    const month = $('histMonth').value;
    const ms = R.monthlySummary(me, data.attendance, data.permissions, month, now);

    $('histStats').innerHTML = [
      statCard('check', 'green', 'Present', String(ms.present), `of ${ms.workingDays} working days`),
      statCard('clock', 'amber', 'Late', String(ms.late), ms.lateMinutes ? `${U.minutesToText(ms.lateMinutes)} total` : 'None'),
      statCard('alert', ms.absent ? 'red' : '', 'Absent', String(ms.absent), 'No check-in recorded'),
      statCard('timer', '', 'Hours worked', (ms.workedMinutes / 60).toFixed(1), 'Completed days'),
    ].join('');

    const from = me.joinDate && me.joinDate > U.monthStart(month) ? me.joinDate : U.monthStart(month);
    const to = U.monthEnd(month) < now.dateKey ? U.monthEnd(month) : now.dateKey;
    const dates = U.dateRange(from, to).filter(U.isWorkingDay).reverse();
    const perms = myPerms(data);
    const rows = dates.map((d) => {
      const r = R.dailyRows([me], data.attendance, d, now)[0];
      const pMin = perms.filter((p) => p.date === d).reduce((s, p) => s + p.minutes, 0);
      return [fmtDateRow(d), ui.statusBadge(r.status), esc(U.formatTime(r.record && r.record.checkIn)), esc(U.formatTime(r.record && r.record.checkOut)),
        r.record && r.record.checkOut ? esc(U.minutesToText(r.workedMinutes)) : '—', r.lateMinutes ? esc(U.minutesToText(r.lateMinutes)) : '—', pMin ? esc(U.minutesToText(pMin)) : '—'];
    });
    $('histTable').innerHTML = rows.length ? table(
      [{ label: 'Date' }, { label: 'Status' }, { label: 'Check-in' }, { label: 'Check-out' }, { label: 'Worked', cls: 'num' }, { label: 'Late by', cls: 'num' }, { label: 'Permission', cls: 'num' }], rows
    ) : ui.empty('No working days yet', 'Nothing to show for this month.');
  }

  // --------------------------------------------------------------- permission
  function permissionPreviewText() {
    const f = $('permForm');
    const date = f.date.value, start = f.start.value, end = f.end.value;
    const minutes = start && end ? R.permissionMinutes(start, end) : NaN;
    if (!date || Number.isNaN(minutes)) {
      return `Choose a date and time between ${U.formatClock(C.workStart)} and ${U.formatClock(C.workEnd)}.`;
    }
    const month = U.monthKeyOf(date);
    return store.listPermissions().then((all) => {
      const sum = R.permissionSummary(all, month);
      const used = sum.used + minutes;
      const rem = Math.max(0, C.monthlyPermissionMinutes - used);
      const exc = Math.max(0, used - C.monthlyPermissionMinutes);
      return exc > 0
        ? `This permission is ${U.minutesToText(minutes)}. Your ${U.formatMonth(month)} allowance would be used up, with ${U.minutesToText(exc)} counted as excess.`
        : `This permission is ${U.minutesToText(minutes)}. You would have ${U.minutesToText(rem)} left in ${U.formatMonth(month)}.`;
    });
  }

  async function updatePreview() {
    const box = $('permPreview');
    box.innerHTML = `${ui.icons.info}<div>${esc(await permissionPreviewText())}</div>`;
  }

  async function renderPermission() {
    const data = await load();
    const now = U.nowIST();
    const f = $('permForm');
    if (!f.date.value) {
      f.date.value = U.isWorkingDay(now.dateKey) ? now.dateKey : '';
      f.date.min = U.addDays(now.dateKey, -C.permissionBackdateDays);
      f.date.max = U.addDays(now.dateKey, C.permissionAdvanceDays);
      f.start.min = f.end.min = C.workStart; f.start.max = f.end.max = C.workEnd;
    }
    if (!$('permMonth').value) $('permMonth').value = now.monthKey;
    const month = $('permMonth').value;
    const sum = R.permissionSummary(myPerms(data), month);

    $('permIntro').textContent = `${U.minutesToText(C.monthlyPermissionMinutes)} of permission each month · resets on the 1st`;
    $('permBalSub').textContent = U.formatMonth(month);
    $('permBalance').innerHTML = balanceBlock(sum);

    // excess card + admin decision (read-only for employee)
    const decisions = data.deductions.filter((d) => d.month === month);
    $('excessCard').hidden = sum.excess === 0;
    if (sum.excess > 0) {
      const approved = decisions.filter((d) => d.decision === 'approved').reduce((t, d) => t + d.days, 0);
      let decision;
      if (!decisions.length) decision = ui.badge('Awaiting admin decision', 'amber');
      else if (approved) decision = ui.badge(`${approved} day deducted by admin`, 'red');
      else decision = ui.badge('No deduction by admin', 'green');
      $('excessBody').innerHTML = `<div class="kv"><div><span>Excess this month</span><strong style="color:var(--danger)">${esc(U.minutesToText(sum.excess))}</strong></div>
        <div><span>Admin decision</span><strong>${decision}</strong></div></div>
        <p class="muted mt-1" style="font-size:.82rem">Excess is only reported. Any half-day deduction is decided manually by your admin.</p>`;
    }

    $('permListSub').textContent = `${U.formatMonth(month)} · ${sum.items.length} record${sum.items.length === 1 ? '' : 's'}`;
    const items = sum.items.slice().sort((a, b) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime));
    $('permList').innerHTML = items.length ? table(
      [{ label: 'Date' }, { label: 'Time' }, { label: 'Duration', cls: 'num' }, { label: 'Excess', cls: 'num' }, { label: 'Reason' }],
      items.map((it) => [fmtDateRow(it.date), `${esc(U.formatClock(it.startTime))} – ${esc(U.formatClock(it.endTime))}`, esc(U.minutesToText(it.minutes)),
        it.excessMinutes ? ui.badge(U.minutesToText(it.excessMinutes), 'red') : ui.badge('Within limit', 'green'), esc(it.reason || '—')]),
      'Made a mistake? Ask your admin to delete the record.'
    ) : ui.empty('No permission recorded', 'Use the form to record your permission time.');
    updatePreview();
  }

  async function onPermissionSubmit(e) {
    e.preventDefault();
    const f = e.target;
    const err = $('permError'), btn = $('permSubmit');
    err.hidden = true; btn.disabled = true;
    try {
      const rec = await store.addPermission({ date: f.date.value, startTime: f.start.value, endTime: f.end.value, reason: f.reason.value });
      ui.toast(`Permission recorded (${U.minutesToText(rec.minutes)}).`, 'success');
      f.start.value = ''; f.end.value = ''; f.reason.value = '';
      $('permMonth').value = U.monthKeyOf(rec.date);
      await renderPermission();
    } catch (ex) { err.textContent = ui.errMsg(ex); err.hidden = false; }
    finally { btn.disabled = false; }
  }

  // --------------------------------------------------------------------- init
  async function init() {
    me = await ui.guard('employee');
    if (!me) return;
    document.querySelectorAll('[data-icon]').forEach((el) => { el.innerHTML = ui.icons[el.dataset.icon]; });
    document.querySelectorAll('[data-app-name]').forEach((el) => { el.textContent = C.appName; });
    $('meName').textContent = me.name; $('meSub').textContent = me.designation || me.email; $('meAvatar').textContent = U.initials(me.name);
    ui.wireShell();
    $('pwBtn').addEventListener('click', ui.openChangePassword);

    router = ui.createRouter({
      today: { title: 'Today', render: renderToday },
      history: { title: 'Attendance history', render: renderHistory },
      permission: { title: 'Permission', render: renderPermission },
    }, 'today');

    $('histMonth').addEventListener('change', renderHistory);
    $('permMonth').addEventListener('change', renderPermission);
    $('permForm').addEventListener('submit', onPermissionSubmit);
    ['pDate', 'pStart', 'pEnd'].forEach((id) => $(id).addEventListener('input', updatePreview));

    router.go();
  }

  init().catch((e) => { console.error(e); location.replace('index.html'); });
})();

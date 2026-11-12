/** Admin panel controller. */
(function () {
  const AMS = window.AMS;
  const { store, ui, rules: R, utils: U, config: C } = AMS;
  const esc = U.escapeHtml;
  const $ = (id) => document.getElementById(id);

  let me = null;
  const state = { report: 'daily' };

  // ------------------------------------------------------------------ helpers
  async function load() {
    const [employees, attendance, permissions, deductions] = await Promise.all([
      store.listEmployees(), store.listAttendance(), store.listPermissions(), store.listDeductions(),
    ]);
    const active = employees.filter((e) => e.active);
    const byId = new Map(employees.map((e) => [e.id, e]));
    return { employees, active, byId, attendance, permissions, deductions };
  }

  /** Build a responsive table. cols: [{label, cls}], rows: array of arrays of cell HTML. */
  function table(cols, rows, footer) {
    return `<div class="table-wrap"><table class="table table--stack"><thead><tr>${cols.map((c) => `<th class="${c.cls || ''}">${esc(c.label)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((r) => `<tr>${r.map((cell, i) => `<td data-label="${esc(cols[i].label)}" class="${(cols[i].cls || '')}${i === 0 ? ' cell-first' : ''}">${cell}</td>`).join('')}</tr>`).join('')}</tbody></table></div>${footer ? `<div class="table-foot">${footer}</div>` : ''}`;
  }

  function statCard(icon, tone, label, value, sub) {
    return `<div class="card stat"><div class="stat__icon ${tone ? 'stat__icon--' + tone : ''}">${ui.icons[icon]}</div>
      <div><div class="stat__label">${esc(label)}</div><div class="stat__value">${esc(value)}</div><div class="stat__sub">${esc(sub || '')}</div></div></div>`;
  }

  function fillEmployeeSelect(sel, employees, keep) {
    const prev = keep ? sel.value : '';
    sel.innerHTML = `<option value="">All employees</option>` + employees.map((e) => `<option value="${esc(e.id)}">${esc(e.name)}${e.active ? '' : ' (inactive)'}</option>`).join('');
    if (prev) sel.value = prev;
  }

  const fmtDateRow = (d) => `${esc(U.formatDate(d))} <span class="muted">${esc(U.formatWeekday(d))}</span>`;

  /** Month summary + excess state for every active employee. */
  function excessRows(data, month) {
    return data.active.map((e) => {
      const sum = R.permissionSummary(data.permissions.filter((p) => p.employeeId === e.id), month);
      const decisions = data.deductions.filter((d) => d.employeeId === e.id && d.month === month);
      return { employee: e, sum, decisions };
    });
  }
  const needsDecision = (r) => r.sum.excess > 0 && r.decisions.length === 0;

  async function refreshBadge(data) {
    const d = data || await load();
    const month = U.nowIST().monthKey;
    const n = excessRows(d, month).filter(needsDecision).length;
    const b = $('excessBadge');
    b.textContent = n; b.hidden = n === 0;
  }

  // ---------------------------------------------------------------- dashboard
  async function renderDashboard() {
    const data = await load();
    const now = U.nowIST();
    const working = U.isWorkingDay(now.dateKey);
    $('dashSub').textContent = working
      ? `${U.formatDate(now.dateKey, { weekday: 'long' })} · Office hours ${U.formatClock(C.workStart)} – ${U.formatClock(C.workEnd)}`
      : `${U.formatDate(now.dateKey, { weekday: 'long' })} · Day off`;

    const rows = R.dailyRows(data.active, data.attendance, now.dateKey, now);
    const inCount = rows.filter((r) => r.record).length;
    const lateCount = rows.filter((r) => r.record && r.isLate).length;
    const notIn = rows.filter((r) => r.status === 'pending' || r.status === 'absent').length;
    const ex = excessRows(data, now.monthKey);
    const exCount = ex.filter((r) => r.sum.excess > 0).length;

    $('dashStats').innerHTML = [
      statCard('users', '', 'Active employees', String(data.active.length), `Team limit: ${C.maxEmployees}`),
      statCard('check', 'green', 'Checked in today', String(inCount), working ? `of ${data.active.length} employees` : 'Not a working day'),
      statCard('clock', 'amber', 'Late today', String(lateCount), `After ${U.formatClock(C.workStart)}`),
      statCard('alert', exCount ? 'red' : '', 'With excess permission', String(exCount), `${U.formatMonth(now.monthKey)}${notIn && working ? ` · ${notIn} not in yet` : ''}`),
    ].join('');

    // last 7 working days chart
    const days = [];
    for (let d = now.dateKey; days.length < 7 && d >= U.addDays(now.dateKey, -21); d = U.addDays(d, -1)) {
      if (U.isWorkingDay(d)) days.unshift(d);
    }
    const chart = days.map((d) => {
      const rs = R.dailyRows(data.active, data.attendance, d, now);
      return {
        label: `${U.formatWeekday(d)} ${d.slice(8)}`,
        present: rs.filter((r) => r.record && !r.isLate).length,
        late: rs.filter((r) => r.record && r.isLate).length,
        absent: rs.filter((r) => r.status === 'absent').length,
      };
    });
    $('dashChart').innerHTML = data.active.length ? ui.stackedBars(chart) : ui.empty('No employees yet', 'Add employees to see attendance trends.');

    // permission usage
    $('dashPermSub').textContent = `${U.formatMonth(now.monthKey)} · limit ${U.minutesToText(C.monthlyPermissionMinutes)} each`;
    $('dashPerm').innerHTML = data.active.length
      ? ui.limitBars(ex.map((r) => ({ name: r.employee.name, value: r.sum.used })).sort((a, b) => b.value - a.value), C.monthlyPermissionMinutes)
      : ui.empty('No data', 'Permission usage appears once employees record permission.');

    // today list
    $('dashTodaySub').textContent = working ? 'Live status for every active employee' : 'No attendance expected today';
    $('dashToday').innerHTML = rows.length ? table(
      [{ label: 'Employee' }, { label: 'Status' }, { label: 'Check-in' }, { label: 'Check-out' }],
      rows.map((r) => [ui.person(r.employee), ui.statusBadge(r.status), esc(U.formatTime(r.record && r.record.checkIn)), esc(U.formatTime(r.record && r.record.checkOut))])
    ) : ui.empty('No employees yet', 'Use the Employees page to add your team.');
    refreshBadge(data);
  }

  // ---------------------------------------------------------------- employees
  function genPassword() {
    const L = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz', D = '23456789';
    const pick = (set, n) => Array.from(crypto.getRandomValues(new Uint32Array(n)), (x) => set[x % set.length]).join('');
    return pick(L, 8) + pick(D, 2) + pick(L, 2);
  }

  function employeeForm(e) {
    const adding = !e;
    return `<div class="form-grid">
      <div class="field"><label for="f_name">Full name</label><input class="input" id="f_name" name="name" required value="${esc(e ? e.name : '')}"></div>
      <div class="field"><label for="f_email">Email (login)</label><input class="input" id="f_email" name="email" type="email" required value="${esc(e ? e.email : '')}"></div>
      <div class="field"><label for="f_phone">Phone</label><input class="input" id="f_phone" name="phone" type="tel" value="${esc(e ? e.phone : '')}"></div>
      <div class="field"><label for="f_role">Designation</label><input class="input" id="f_role" name="designation" value="${esc(e ? e.designation : '')}" placeholder="e.g. Frontend Developer"></div>
      <div class="field"><label for="f_join">Join date</label><input class="input" id="f_join" name="joinDate" type="date" required value="${esc(e ? e.joinDate : U.nowIST().dateKey)}"></div>
      ${adding ? `<div class="field"><label for="f_pw">Temporary password</label>
        <div class="pw-wrap"><input class="input" id="f_pw" name="password" type="text" autocomplete="off" required>
        <button type="button" class="pw-toggle" id="genPw">Generate</button></div>
        <span class="hint">Share this with the employee. They can change it after signing in.</span></div>` : ''}
    </div>`;
  }

  async function renderEmployees() {
    const data = await load();
    $('empSub').textContent = `${data.active.length} active of ${C.maxEmployees} allowed`;
    $('empTable').innerHTML = data.employees.length ? table(
      [{ label: 'Employee' }, { label: 'Contact' }, { label: 'Joined' }, { label: 'Status' }, { label: 'Actions', cls: 'text-right' }],
      data.employees.map((e) => [
        ui.person(e),
        `${esc(e.email)}<br><span class="muted">${esc(e.phone || '')}</span>`,
        esc(U.formatDate(e.joinDate)),
        e.active ? ui.badge('Active', 'green') : ui.badge('Inactive', 'gray'),
        `<div class="row-actions">
          <button class="btn btn--ghost btn--sm" data-act="edit" data-id="${esc(e.id)}" type="button">Edit</button>
          <button class="btn btn--ghost btn--sm" data-act="reset" data-id="${esc(e.id)}" type="button">Reset password</button>
          <button class="btn btn--ghost btn--sm" data-act="toggle" data-id="${esc(e.id)}" type="button">${e.active ? 'Deactivate' : 'Activate'}</button></div>`,
      ])) : ui.empty('No employees yet', 'Click "Add employee" to create the first account.');
  }

  function openEmployeeModal(emp) {
    const adding = !emp;
    const m = ui.openModal({
      title: adding ? 'Add employee' : 'Edit employee',
      submitLabel: adding ? 'Add employee' : 'Save changes',
      body: employeeForm(emp),
      onSubmit: async (f) => {
        const v = { name: f.name.value, email: f.email.value, phone: f.phone.value, designation: f.designation.value, joinDate: f.joinDate.value };
        if (adding) await store.addEmployee({ ...v, password: f.password.value });
        else await store.updateEmployee(emp.id, v);
        ui.toast(adding ? 'Employee added.' : 'Employee updated.', 'success');
        router.refresh();
      },
    });
    const gen = m.el.querySelector('#genPw');
    if (gen) gen.addEventListener('click', () => { m.el.querySelector('#f_pw').value = genPassword(); });
  }

  async function onEmployeeAction(e) {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const emp = (await store.listEmployees()).find((x) => x.id === btn.dataset.id);
    if (!emp) return;
    try {
      if (btn.dataset.act === 'edit') openEmployeeModal(emp);
      if (btn.dataset.act === 'reset') {
        const m = ui.openModal({
          title: `Reset password · ${emp.name}`, submitLabel: 'Set new password',
          body: `<div class="field"><label for="rp">New temporary password</label>
            <div class="pw-wrap"><input class="input" id="rp" name="pw" type="text" autocomplete="off" required>
            <button type="button" class="pw-toggle" id="rpGen">Generate</button></div>
            <span class="hint">At least ${C.minPasswordLength} characters, with letters and numbers.</span></div>`,
          onSubmit: async (f) => { await store.resetEmployeePassword(emp.id, f.pw.value); ui.toast('Password reset.', 'success'); },
        });
        m.el.querySelector('#rpGen').addEventListener('click', () => { m.el.querySelector('#rp').value = genPassword(); });
      }
      if (btn.dataset.act === 'toggle') {
        const ok = await ui.confirmDialog({
          title: emp.active ? 'Deactivate employee?' : 'Activate employee?',
          message: emp.active ? `${emp.name} will no longer be able to sign in. Their history is kept.` : `${emp.name} will be able to sign in again.`,
          confirmLabel: emp.active ? 'Deactivate' : 'Activate', danger: emp.active,
        });
        if (ok) { await store.setEmployeeActive(emp.id, !emp.active); ui.toast('Status updated.', 'success'); router.refresh(); }
      }
    } catch (err) { ui.toastError(err); }
  }

  // --------------------------------------------------------------- attendance
  let attRows = [];
  async function renderAttendance() {
    const data = await load();
    fillEmployeeSelect($('attEmp'), data.employees, true);
    const now = U.nowIST();
    if (!$('attFrom').value) $('attFrom').value = U.monthStart(now.monthKey);
    if (!$('attTo').value) $('attTo').value = now.dateKey;
    const list = await store.listAttendance({ employeeId: $('attEmp').value, from: $('attFrom').value, to: $('attTo').value });
    attRows = list.map((a) => {
      const s = R.recordStatus(a, now);
      return { a, s, emp: data.byId.get(a.employeeId) };
    }).filter((r) => r.emp);
    $('attTable').innerHTML = attRows.length ? table(
      [{ label: 'Employee' }, { label: 'Date' }, { label: 'Check-in' }, { label: 'Check-out' }, { label: 'Worked' }, { label: 'Late by' }, { label: 'Status' }],
      attRows.map((r) => [ui.person(r.emp), fmtDateRow(r.a.date), esc(U.formatTime(r.a.checkIn)), esc(U.formatTime(r.a.checkOut)),
        r.a.checkOut ? esc(U.minutesToText(r.s.workedMinutes)) : '—', r.s.lateMinutes ? esc(U.minutesToText(r.s.lateMinutes)) : '—', ui.statusBadge(r.s.status)]),
      `${attRows.length} record${attRows.length === 1 ? '' : 's'}. Absences are shown in the daily and monthly reports.`
    ) : ui.empty('No attendance records', 'Nothing matches these filters yet.');
  }

  function exportAttendance() {
    if (!attRows.length) return ui.toast('Nothing to export.', 'error');
    U.downloadCsv(`attendance_${$('attFrom').value}_to_${$('attTo').value}.csv`,
      [['Employee', 'Date', 'Check-in (IST)', 'Check-out (IST)', 'Worked (min)', 'Late (min)', 'Status']]
        .concat(attRows.map((r) => [r.emp.name, r.a.date, U.formatTime(r.a.checkIn), U.formatTime(r.a.checkOut), r.s.workedMinutes, r.s.lateMinutes, r.s.status])));
  }

  // -------------------------------------------------------------- permissions
  let permFlat = [];
  async function renderPermissions() {
    const data = await load();
    const now = U.nowIST();
    if (!$('permMonth').value) $('permMonth').value = now.monthKey;
    fillEmployeeSelect($('permEmp'), data.employees, true);
    const month = $('permMonth').value || now.monthKey;
    const only = $('permEmp').value;

    permFlat = [];
    data.employees.filter((e) => !only || e.id === only).forEach((e) => {
      const sum = R.permissionSummary(data.permissions.filter((p) => p.employeeId === e.id), month);
      sum.items.forEach((it) => permFlat.push({ emp: e, it }));
    });
    permFlat.sort((a, b) => b.it.date.localeCompare(a.it.date) || b.it.startTime.localeCompare(a.it.startTime));
    const total = permFlat.reduce((s, r) => s + r.it.minutes, 0);
    $('permSub').textContent = `${U.formatMonth(month)} · ${permFlat.length} record${permFlat.length === 1 ? '' : 's'} · ${U.minutesToText(total)} total`;

    $('permTable').innerHTML = permFlat.length ? table(
      [{ label: 'Employee' }, { label: 'Date' }, { label: 'Time' }, { label: 'Duration', cls: 'num' }, { label: 'Excess', cls: 'num' }, { label: 'Reason' }, { label: '', cls: 'text-right' }],
      permFlat.map(({ emp, it }) => [ui.person(emp), fmtDateRow(it.date),
        `${esc(U.formatClock(it.startTime))} – ${esc(U.formatClock(it.endTime))}`, esc(U.minutesToText(it.minutes)),
        it.excessMinutes ? ui.badge(U.minutesToText(it.excessMinutes), 'red') : ui.badge('Within limit', 'green'),
        esc(it.reason || '—'),
        `<div class="row-actions"><button class="btn btn--ghost btn--sm" data-del="${esc(it.id)}" type="button">Delete</button></div>`]),
      'Excess is calculated in date order: only minutes beyond the monthly allowance are flagged.'
    ) : ui.empty('No permission records', 'No permission was recorded for this selection.');
  }

  function exportPermissions() {
    if (!permFlat.length) return ui.toast('Nothing to export.', 'error');
    U.downloadCsv(`permissions_${$('permMonth').value}.csv`,
      [['Employee', 'Date', 'From', 'To', 'Minutes', 'Excess minutes', 'Reason']]
        .concat(permFlat.map(({ emp, it }) => [emp.name, it.date, it.startTime, it.endTime, it.minutes, it.excessMinutes, it.reason])));
  }

  async function onPermissionDelete(e) {
    const btn = e.target.closest('[data-del]');
    if (!btn) return;
    const ok = await ui.confirmDialog({ title: 'Delete permission record?', message: 'This removes it from the employee\'s monthly usage. Use only to correct a mistake.', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await store.deletePermission(btn.dataset.del); ui.toast('Record deleted.', 'success'); router.refresh(); } catch (err) { ui.toastError(err); }
  }

  // ------------------------------------------------- excess + half-day decisions
  async function renderExcess() {
    const data = await load();
    const now = U.nowIST();
    if (!$('excessMonth').value) $('excessMonth').value = now.monthKey;
    const month = $('excessMonth').value || now.monthKey;
    const rows = excessRows(data, month).sort((a, b) => b.sum.excess - a.sum.excess || a.employee.name.localeCompare(b.employee.name));
    const pending = rows.filter(needsDecision).length;
    $('excessSub').textContent = `${U.formatMonth(month)} · allowance ${U.minutesToText(C.monthlyPermissionMinutes)} per employee · ${pending} awaiting your decision`;

    $('excessTable').innerHTML = rows.length ? table(
      [{ label: 'Employee' }, { label: 'Used', cls: 'num' }, { label: 'Remaining', cls: 'num' }, { label: 'Excess', cls: 'num' }, { label: 'Decision' }, { label: 'Actions', cls: 'text-right' }],
      rows.map((r) => {
        const { sum, employee: e, decisions } = r;
        const latest = decisions[0];
        let decisionCell;
        if (sum.excess === 0 && decisions.length === 0) decisionCell = ui.badge('No excess', 'green');
        else if (decisions.length === 0) decisionCell = ui.badge('Awaiting decision', 'amber');
        else {
          decisionCell = decisions.map((d) => `<div>${d.decision === 'approved' ? ui.badge('Half-day approved', 'red') : ui.badge('No deduction', 'gray')}
            <button class="btn btn--ghost btn--sm" data-revoke="${esc(d.id)}" type="button" title="Undo this decision">Undo</button>
            ${d.note ? `<div class="muted" style="font-size:.78rem">${esc(d.note)}</div>` : ''}</div>`).join('');
          if (latest && latest.excessMinutes !== sum.excess) decisionCell += `<div class="muted" style="font-size:.78rem">Excess is now ${esc(U.minutesToText(sum.excess))} (was ${esc(U.minutesToText(latest.excessMinutes))} at decision).</div>`;
        }
        const actions = sum.excess > 0
          ? `<div class="row-actions">
              <button class="btn btn--danger btn--sm" data-decide="approved" data-id="${esc(e.id)}" type="button">Approve half-day</button>
              <button class="btn btn--ghost btn--sm" data-decide="declined" data-id="${esc(e.id)}" type="button">No deduction</button></div>`
          : '<span class="muted">—</span>';
        return [ui.person(e), esc(U.minutesToText(sum.used)), esc(U.minutesToText(sum.remaining)),
          sum.excess ? `<strong style="color:var(--danger)">${esc(U.minutesToText(sum.excess))}</strong>` : '0m', decisionCell, actions];
      }),
      'Approve once per half-day you want to deduct. "No deduction" clears earlier approvals for that month.'
    ) : ui.empty('No active employees', 'Add employees to track permission usage.');
    refreshBadge(data);
  }

  async function onExcessAction(e) {
    const decide = e.target.closest('[data-decide]');
    const revoke = e.target.closest('[data-revoke]');
    try {
      if (revoke) {
        const ok = await ui.confirmDialog({ title: 'Undo this decision?', message: 'The employee will return to "Awaiting decision".', confirmLabel: 'Undo decision' });
        if (ok) { await store.revokeDeduction(revoke.dataset.revoke); ui.toast('Decision removed.', 'success'); router.refresh(); }
        return;
      }
      if (!decide) return;
      const data = await load();
      const month = $('excessMonth').value;
      const emp = data.byId.get(decide.dataset.id);
      const sum = R.permissionSummary(data.permissions.filter((p) => p.employeeId === emp.id), month);
      const approve = decide.dataset.decide === 'approved';
      ui.openModal({
        title: approve ? `Approve half-day · ${emp.name}` : `No deduction · ${emp.name}`,
        submitLabel: approve ? 'Approve half-day deduction' : 'Confirm no deduction',
        submitClass: approve ? 'btn--danger' : 'btn--primary',
        body: `<div class="kv mb-2"><div><span>Month</span><strong>${esc(U.formatMonth(month))}</strong></div>
          <div><span>Permission used</span><strong>${esc(U.minutesToText(sum.used))} of ${esc(U.minutesToText(sum.allowance))}</strong></div>
          <div><span>Excess</span><strong>${esc(U.minutesToText(sum.excess))}</strong></div></div>
          <div class="field"><label for="dn">Note (optional)</label><textarea class="input" id="dn" name="note" maxlength="200" placeholder="Reason for this decision"></textarea></div>`,
        onSubmit: async (f) => {
          await store.addDeductionDecision({ employeeId: emp.id, month, decision: decide.dataset.decide, excessMinutes: sum.excess, note: f.note.value });
          ui.toast(approve ? 'Half-day deduction approved.' : 'Recorded: no deduction.', 'success');
          router.refresh();
        },
      });
    } catch (err) { ui.toastError(err); }
  }

  // ------------------------------------------------------------------ reports
  let repCsv = [];
  async function renderReports() {
    const data = await load();
    const now = U.nowIST();
    if (!$('repDate').value) $('repDate').value = now.dateKey;
    if (!$('repMonth').value) $('repMonth').value = now.monthKey;
    document.querySelectorAll('[data-report]').forEach((b) => b.classList.toggle('is-active', b.dataset.report === state.report));
    $('repDate').hidden = state.report !== 'daily';
    $('repMonth').hidden = state.report !== 'monthly';

    if (state.report === 'daily') {
      const date = $('repDate').value;
      $('repTitle').textContent = `Daily report · ${U.formatDate(date, { weekday: 'long' })}`;
      const rows = R.dailyRows(data.active, data.attendance, date, now);
      const permOn = (id) => data.permissions.filter((p) => p.employeeId === id && p.date === date).reduce((s, p) => s + p.minutes, 0);
      $('repTable').innerHTML = rows.length ? table(
        [{ label: 'Employee' }, { label: 'Status' }, { label: 'Check-in' }, { label: 'Check-out' }, { label: 'Worked', cls: 'num' }, { label: 'Late by', cls: 'num' }, { label: 'Permission', cls: 'num' }],
        rows.map((r) => [ui.person(r.employee), ui.statusBadge(r.status), esc(U.formatTime(r.record && r.record.checkIn)), esc(U.formatTime(r.record && r.record.checkOut)),
          r.record && r.record.checkOut ? esc(U.minutesToText(r.workedMinutes)) : '—', r.lateMinutes ? esc(U.minutesToText(r.lateMinutes)) : '—', permOn(r.employee.id) ? esc(U.minutesToText(permOn(r.employee.id))) : '—'])
      ) : ui.empty('No employees on this date', 'Employees appear from their join date.');
      repCsv = [['Employee', 'Date', 'Status', 'Check-in (IST)', 'Check-out (IST)', 'Worked (min)', 'Late (min)', 'Permission (min)']]
        .concat(rows.map((r) => [r.employee.name, date, r.status, U.formatTime(r.record && r.record.checkIn), U.formatTime(r.record && r.record.checkOut), r.workedMinutes, r.lateMinutes, permOn(r.employee.id)]));
    } else {
      const month = $('repMonth').value;
      $('repTitle').textContent = `Monthly report · ${U.formatMonth(month)}`;
      const sums = data.active.map((e) => {
        const s = R.monthlySummary(e, data.attendance, data.permissions, month, now);
        const half = data.deductions.filter((d) => d.employeeId === e.id && d.month === month && d.decision === 'approved').reduce((t, d) => t + d.days, 0);
        return { s, half };
      });
      $('repTable').innerHTML = sums.length ? table(
        [{ label: 'Employee' }, { label: 'Working days', cls: 'num' }, { label: 'Present', cls: 'num' }, { label: 'Late', cls: 'num' }, { label: 'Absent', cls: 'num' }, { label: 'Hours worked', cls: 'num' }, { label: 'Permission', cls: 'num' }, { label: 'Excess', cls: 'num' }, { label: 'Half-day deducted', cls: 'num' }],
        sums.map(({ s, half }) => [ui.person(s.employee), String(s.workingDays), String(s.present), String(s.late), s.absent ? `<strong style="color:var(--danger)">${s.absent}</strong>` : '0',
          esc((s.workedMinutes / 60).toFixed(1)) + ' h', esc(U.minutesToText(s.permission.used)), s.permission.excess ? esc(U.minutesToText(s.permission.excess)) : '0m', half ? esc(String(half)) + ' day' : '—']),
        'Working days count up to today (today only after office hours). Absences are derived from missing records. "No check-out" days still count as present.'
      ) : ui.empty('No employees', 'Add employees to generate reports.');
      repCsv = [['Employee', 'Month', 'Working days', 'Present', 'Late', 'Absent', 'Hours worked', 'Permission (min)', 'Excess (min)', 'Half-day deducted (days)']]
        .concat(sums.map(({ s, half }) => [s.employee.name, month, s.workingDays, s.present, s.late, s.absent, (s.workedMinutes / 60).toFixed(1), s.permission.used, s.permission.excess, half]));
    }
  }

  // --------------------------------------------------------------------- init
  let router;
  async function init() {
    me = await ui.guard('admin');
    if (!me) return;
    document.querySelectorAll('[data-icon]').forEach((el) => { el.innerHTML = ui.icons[el.dataset.icon]; });
    document.querySelectorAll('[data-app-name]').forEach((el) => { el.textContent = C.appName; });
    $('meName').textContent = me.name; $('meEmail').textContent = me.email; $('meAvatar').textContent = U.initials(me.name);
    ui.wireShell();
    $('pwBtn').addEventListener('click', ui.openChangePassword);

    router = ui.createRouter({
      dashboard: { title: 'Dashboard', render: renderDashboard },
      employees: { title: 'Employees', render: renderEmployees },
      attendance: { title: 'Attendance', render: renderAttendance },
      permissions: { title: 'Permission records', render: renderPermissions },
      excess: { title: 'Excess & deductions', render: renderExcess },
      reports: { title: 'Reports', render: renderReports },
    }, 'dashboard');

    $('addEmpBtn').addEventListener('click', () => openEmployeeModal(null));
    $('empTable').addEventListener('click', onEmployeeAction);
    ['attEmp', 'attFrom', 'attTo'].forEach((id) => $(id).addEventListener('change', renderAttendance));
    $('attExport').addEventListener('click', exportAttendance);
    ['permMonth', 'permEmp'].forEach((id) => $(id).addEventListener('change', renderPermissions));
    $('permExport').addEventListener('click', exportPermissions);
    $('permTable').addEventListener('click', onPermissionDelete);
    $('excessMonth').addEventListener('change', renderExcess);
    $('excessTable').addEventListener('click', onExcessAction);
    ['repDate', 'repMonth'].forEach((id) => $(id).addEventListener('change', renderReports));
    document.querySelectorAll('[data-report]').forEach((b) => b.addEventListener('click', () => { state.report = b.dataset.report; renderReports(); }));
    $('repExport').addEventListener('click', () => {
      if (repCsv.length < 2) return ui.toast('Nothing to export.', 'error');
      U.downloadCsv(`${state.report}_report_${state.report === 'daily' ? $('repDate').value : $('repMonth').value}.csv`, repCsv);
    });
    $('repPrint').addEventListener('click', () => window.print());

    router.go();
    // Keep the dashboard fresh as the day moves on.
    setInterval(() => { if ((location.hash || '#dashboard') === '#dashboard' && !document.querySelector('.modal')) renderDashboard().catch(() => {}); }, 60000);
  }

  init().catch((e) => { console.error(e); location.replace('index.html'); });
})();

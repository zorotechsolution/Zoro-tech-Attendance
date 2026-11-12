/**
 * Business rules as PURE functions (no DOM, no storage) so they are easy to
 * test and can be reused unchanged when the backend moves to Supabase.
 *
 * IMPORTANT policy: nothing here ever deducts a half-day automatically.
 * Excess permission minutes are only *reported*; the admin decides separately.
 */
(function (root) {
  const AMS = (root.AMS = root.AMS || {});
  const cfg = () => AMS.config;
  const U = () => AMS.utils;

  // ---------------------------------------------------------------- permissions

  /** Minutes for a permission window; returns NaN if end <= start. */
  function permissionMinutes(start, end) {
    const m = U().timeToMinutes(end) - U().timeToMinutes(start);
    return m > 0 ? m : NaN;
  }

  /**
   * Monthly permission summary for ONE employee.
   * Permissions are consumed in chronological order; once cumulative usage passes
   * the allowance, only the minutes BEYOND it count as excess.
   */
  function permissionSummary(permissions, monthKey) {
    const allowance = cfg().monthlyPermissionMinutes;
    const list = permissions
      .filter((p) => p.date.startsWith(monthKey))
      .sort((a, b) => a.date.localeCompare(b.date) || String(a.startTime).localeCompare(String(b.startTime)) ||
        String(a.createdAt).localeCompare(String(b.createdAt)));

    let running = 0;
    const items = list.map((p) => {
      const before = running;
      running += p.minutes;
      const excessMinutes = Math.max(0, running - allowance) - Math.max(0, before - allowance);
      return Object.assign({}, p, { excessMinutes, withinMinutes: p.minutes - excessMinutes });
    });

    const used = running;
    return {
      month: monthKey,
      allowance,
      used,
      remaining: Math.max(0, allowance - used),
      excess: Math.max(0, used - allowance),
      percent: allowance ? Math.min(100, (used / allowance) * 100) : 0,
      items,
    };
  }

  /** Validate a new permission request. Returns an array of error strings (empty = ok). */
  function validatePermission(input, existing, now) {
    const errors = [];
    const { date, startTime, endTime } = input;
    const c = cfg();
    const minutes = permissionMinutes(startTime || '', endTime || '');

    if (!date) errors.push('Choose a date.');
    if (!startTime || !endTime) errors.push('Enter both start and end time.');
    if (date) {
      if (!U().isWorkingDay(date)) errors.push('Permission can only be taken on working days (Mon–Sat).');
      const minDate = U().addDays(now.dateKey, -c.permissionBackdateDays);
      const maxDate = U().addDays(now.dateKey, c.permissionAdvanceDays);
      if (date < minDate) errors.push(`Date is too old (limit: ${c.permissionBackdateDays} days back).`);
      if (date > maxDate) errors.push(`Date is too far ahead (limit: ${c.permissionAdvanceDays} days).`);
    }
    if (startTime && endTime) {
      if (Number.isNaN(minutes)) {
        errors.push('End time must be after start time.');
      } else {
        const ws = U().timeToMinutes(c.workStart);
        const we = U().timeToMinutes(c.workEnd);
        if (U().timeToMinutes(startTime) < ws || U().timeToMinutes(endTime) > we) {
          errors.push(`Permission must fall within office hours (${U().formatClock(c.workStart)} – ${U().formatClock(c.workEnd)}).`);
        }
        if (minutes < c.minPermissionMinutes) errors.push(`Minimum permission is ${c.minPermissionMinutes} minutes.`);
        const sMin = U().timeToMinutes(startTime);
        const eMin = U().timeToMinutes(endTime);
        const overlap = (existing || []).some((p) => p.date === date &&
          sMin < U().timeToMinutes(p.endTime) && eMin > U().timeToMinutes(p.startTime));
        if (overlap) errors.push('This overlaps another permission you already recorded for that day.');
      }
    }
    return errors;
  }

  // ----------------------------------------------------------------- attendance

  /**
   * Status for one stored attendance record.
   *  working    = checked in today, not yet out
   *  incomplete = checked in on a past day, never checked out
   *  late       = checked in after start time (+ grace)
   *  present    = on time
   */
  function recordStatus(rec, now) {
    const c = cfg();
    const startLimit = U().timeToMinutes(c.workStart) + c.lateGraceMinutes;
    const inMin = U().isoToOfficeMinutes(rec.checkIn);
    const lateMinutes = Math.max(0, inMin - U().timeToMinutes(c.workStart));
    const isLate = inMin > startLimit;
    const workedMinutes = rec.checkOut ? U().minutesBetweenIso(rec.checkIn, rec.checkOut) : 0;

    let status;
    if (!rec.checkOut) status = rec.date === now.dateKey ? 'working' : 'incomplete';
    else status = isLate ? 'late' : 'present';

    const earlyLeaveMinutes = rec.checkOut
      ? Math.max(0, U().timeToMinutes(c.workEnd) - U().isoToOfficeMinutes(rec.checkOut))
      : 0;

    return { status, isLate, lateMinutes: isLate ? lateMinutes : 0, workedMinutes, earlyLeaveMinutes };
  }

  /**
   * One row per employee for a given date (daily report / dashboard).
   * "absent" is DERIVED for display; nothing fake is ever written to storage.
   */
  function dailyRows(employees, attendance, dateKey, now) {
    const c = cfg();
    const byEmp = new Map(attendance.filter((a) => a.date === dateKey).map((a) => [a.employeeId, a]));
    const working = U().isWorkingDay(dateKey);
    const endMin = U().timeToMinutes(c.workEnd);

    return employees
      .filter((e) => !e.joinDate || e.joinDate <= dateKey)
      .map((e) => {
        const rec = byEmp.get(e.id) || null;
        if (rec) {
          const info = recordStatus(rec, now);
          return Object.assign({ employee: e, record: rec }, info);
        }
        let status;
        if (!working) status = 'off';
        else if (dateKey > now.dateKey) status = 'upcoming';
        else if (dateKey === now.dateKey && now.minutes < endMin) status = 'pending';
        else status = 'absent';
        return { employee: e, record: null, status, isLate: false, lateMinutes: 0, workedMinutes: 0, earlyLeaveMinutes: 0 };
      });
  }

  /** Working days from `from` to `to` inclusive. */
  function countWorkingDays(from, to) {
    if (to < from) return 0;
    return U().dateRange(from, to).filter(U().isWorkingDay).length;
  }

  /**
   * Month summary for one employee. Absent days are derived only for working days
   * that have fully passed (or today after office hours) and after the join date.
   */
  function monthlySummary(employee, attendance, permissions, monthKey, now) {
    const first = U().monthStart(monthKey);
    const last = U().monthEnd(monthKey);
    const from = employee.joinDate && employee.joinDate > first ? employee.joinDate : first;
    const endMin = U().timeToMinutes(cfg().workEnd);

    let upTo = last < now.dateKey ? last : now.dateKey;
    const todayInMonth = now.dateKey >= first && now.dateKey <= last;
    // Today only counts toward "elapsed" once the office day is over.
    if (todayInMonth && now.minutes < endMin) upTo = U().addDays(now.dateKey, -1);
    if (upTo > last) upTo = last;

    const recs = attendance.filter((a) => a.employeeId === employee.id && a.date.startsWith(monthKey));
    const recDates = new Set(recs.map((r) => r.date));
    const workingDays = countWorkingDays(from, upTo);

    let present = 0, late = 0, incomplete = 0, workedMinutes = 0, lateMinutes = 0;
    recs.forEach((r) => {
      const s = recordStatus(r, now);
      if (s.isLate) late += 1; // counts late arrivals even while still checked in
      if (s.status === 'incomplete') incomplete += 1;
      if (s.status === 'present' || s.status === 'late' || s.status === 'working' || s.status === 'incomplete') present += 1;
      workedMinutes += s.workedMinutes;
      lateMinutes += s.lateMinutes;
    });

    const absentDates = U().dateRange(from, upTo).filter((d) => U().isWorkingDay(d) && !recDates.has(d));
    const perm = permissionSummary(permissions.filter((p) => p.employeeId === employee.id), monthKey);

    return {
      employee, month: monthKey, workingDays, present, late, incomplete,
      absent: absentDates.length, absentDates, workedMinutes, lateMinutes, permission: perm,
    };
  }

  AMS.rules = {
    permissionMinutes, permissionSummary, validatePermission,
    recordStatus, dailyRows, countWorkingDays, monthlySummary,
  };
})(typeof window !== 'undefined' ? window : globalThis);

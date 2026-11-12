/**
 * Date/time + misc helpers. All "calendar" logic runs in the office timezone
 * (Asia/Kolkata) regardless of the browser's own timezone.
 * Dates are passed around as 'YYYY-MM-DD' keys, months as 'YYYY-MM'.
 */
(function (root) {
  const AMS = (root.AMS = root.AMS || {});
  const cfg = () => AMS.config;

  const partsFormatter = () =>
    new Intl.DateTimeFormat('en-GB', {
      timeZone: cfg().timezone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hourCycle: 'h23',
    });

  /** Current (or given) instant expressed in office time. */
  function nowIST(date) {
    const d = date || new Date();
    const p = {};
    partsFormatter().formatToParts(d).forEach((x) => { p[x.type] = x.value; });
    const dateKey = `${p.year}-${p.month}-${p.day}`;
    return {
      iso: d.toISOString(),
      dateKey,
      monthKey: dateKey.slice(0, 7),
      time: `${p.hour}:${p.minute}`,
      minutes: Number(p.hour) * 60 + Number(p.minute),
      dow: dowOf(dateKey),
    };
  }

  function dowOf(dateKey) { return new Date(dateKey + 'T00:00:00Z').getUTCDay(); }
  function monthKeyOf(dateKey) { return dateKey.slice(0, 7); }

  function addDays(dateKey, n) {
    const d = new Date(dateKey + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }

  function addMonths(monthKey, n) {
    const [y, m] = monthKey.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    return d.toISOString().slice(0, 7);
  }

  function daysInMonth(monthKey) {
    const [y, m] = monthKey.split('-').map(Number);
    return new Date(Date.UTC(y, m, 0)).getUTCDate();
  }

  function monthStart(monthKey) { return monthKey + '-01'; }
  function monthEnd(monthKey) { return `${monthKey}-${String(daysInMonth(monthKey)).padStart(2, '0')}`; }

  function dateRange(from, to) {
    const out = [];
    for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
    return out;
  }

  function isWorkingDay(dateKey) { return cfg().workingDays.includes(dowOf(dateKey)); }

  function timeToMinutes(hhmm) {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  }

  /** 135 -> "2h 15m", 45 -> "45m", 0 -> "0m" */
  function minutesToText(total) {
    const t = Math.max(0, Math.round(total || 0));
    const h = Math.floor(t / 60);
    const m = t % 60;
    if (h && m) return `${h}h ${m}m`;
    if (h) return `${h}h`;
    return `${m}m`;
  }

  function formatTime(iso) {
    if (!iso) return '—';
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: cfg().timezone, hour: '2-digit', minute: '2-digit', hour12: true,
    }).format(new Date(iso)).toUpperCase();
  }

  function formatClock(hhmm) {
    const [h, m] = hhmm.split(':').map(Number);
    const suffix = h >= 12 ? 'PM' : 'AM';
    return `${String(((h + 11) % 12) + 1).padStart(2, '0')}:${String(m).padStart(2, '0')} ${suffix}`;
  }

  function formatDate(dateKey, opts) {
    if (!dateKey) return '—';
    return new Intl.DateTimeFormat('en-GB', Object.assign(
      { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric' }, opts || {}
    )).format(new Date(dateKey + 'T00:00:00Z'));
  }

  function formatWeekday(dateKey) {
    return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short' })
      .format(new Date(dateKey + 'T00:00:00Z'));
  }

  function formatMonth(monthKey) {
    return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', month: 'long', year: 'numeric' })
      .format(new Date(monthKey + '-01T00:00:00Z'));
  }

  function minutesBetweenIso(a, b) {
    return Math.max(0, Math.round((new Date(b) - new Date(a)) / 60000));
  }

  /** Minutes since midnight (office time) for an ISO instant. */
  function isoToOfficeMinutes(iso) { return nowIST(new Date(iso)).minutes; }

  function escapeHtml(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  function uid() {
    if (root.crypto && root.crypto.randomUUID) return root.crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  function initials(name) {
    return (name || '?').trim().split(/\s+/).slice(0, 2).map((s) => s[0].toUpperCase()).join('');
  }

  function debounce(fn, ms) {
    let t;
    return function () { const a = arguments; clearTimeout(t); t = setTimeout(() => fn.apply(null, a), ms); };
  }

  function downloadCsv(filename, rows) {
    const esc = (v) => {
      let s = String(v == null ? '' : v);
      // Neutralise spreadsheet formula injection
      if (/^[=+\-@]/.test(s)) s = "'" + s;
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const csv = rows.map((r) => r.map(esc).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  AMS.utils = {
    nowIST, dowOf, monthKeyOf, addDays, addMonths, daysInMonth, monthStart, monthEnd,
    dateRange, isWorkingDay, timeToMinutes, minutesToText, formatTime, formatClock,
    formatDate, formatWeekday, formatMonth, minutesBetweenIso, isoToOfficeMinutes,
    escapeHtml, uid, initials, debounce, downloadCsv,
  };
})(typeof window !== 'undefined' ? window : globalThis);

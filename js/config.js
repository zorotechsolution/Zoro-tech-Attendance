/**
 * Central configuration for the Attendance Management System.
 * All office rules live here so nothing is hard-coded in views.
 */
(function (root) {
  const AMS = (root.AMS = root.AMS || {});

  AMS.config = {
    appName: 'AttendPro',
    companyName: 'Your IT Company', // change to your company name

    // ---- Office rules ----
    timezone: 'Asia/Kolkata',
    workingDays: [1, 2, 3, 4, 5, 6], // 0 = Sunday ... 6 = Saturday (Monday-Saturday)
    workStart: '09:30',
    workEnd: '17:30',
    lateGraceMinutes: 0, // check-in after workStart + grace is marked "Late"

    // ---- Permission rules ----
    monthlyPermissionMinutes: 150, // resets automatically on the 1st of each month
    minPermissionMinutes: 5,
    permissionBackdateDays: 7, // employees may record permission up to N days in the past
    permissionAdvanceDays: 30, // ...and up to N days ahead

    // ---- Team size ----
    maxEmployees: 9, // "below 10" employees (admin accounts are not counted)

    // ---- Security / session ----
    sessionHours: 8,
    minPasswordLength: 8,
    loginMaxAttempts: 5, // UX-level lockout only; real enforcement comes from Supabase Auth later
    loginLockMinutes: 5,

    // ---- Data backend ----
    // 'local'    = browser localStorage (current, frontend-only phase)
    // 'supabase' = future phase. Implement js/store.js against Supabase and flip this flag.
    backend: 'local',
    storagePrefix: 'ams_v1_',

    // FUTURE SUPABASE SETTINGS
    // Only the public "anon" key may ever go here, and only protected by Row Level Security.
    // NEVER place a service_role key (or any secret) in front-end code.
    supabase: { url: '', anonKey: '' },
  };
})(typeof window !== 'undefined' ? window : globalThis);

# AttendPro: Employee Attendance Management System

A frontend-only attendance system for a small IT company (fewer than 10 employees).
HTML + CSS + vanilla JavaScript, no build step. Prepared for a later Supabase integration.

## Run it

**Option A — Open directly (no server needed):**
Just open `index.html` in your browser from the file system. The app works via `file://` with a built-in pure-JS SHA-256 fallback for password hashing.

**Option B — Serve over localhost (stronger security):**
When served over `localhost` or `https://`, the app automatically uses the browser's native Web Crypto API (PBKDF2-SHA256) for stronger password hashing.

```bash
cd attendance-system
python -m http.server 8000      # then open http://localhost:8000
```

> **Note:** Passwords hashed via `file://` (pure-JS fallback) and `localhost` (PBKDF2) use different algorithms and are **not interchangeable**. If you switch modes, existing accounts will need their passwords reset by the admin.

**First run:** the sign-in page shows a one-time *Set up your workspace* form to create the admin account. There are no default passwords and no seeded attendance data. Then, as admin, add employees from **Employees**; each gets an email + temporary password.

## Office rules (all in `js/config.js`)

| Rule | Value |
|---|---|
| Working days | Monday–Saturday (Sunday off) |
| Hours | 9:30 AM – 5:30 PM, timezone `Asia/Kolkata` |
| Permission allowance | 150 min / month, resets automatically on the 1st |
| Team size | up to 9 active employees ("below 10") |

Dates are always computed in IST regardless of the user's device timezone.

## Permission & deduction logic (`js/rules.js`)

- Employees record permission directly (date + from/to inside office hours). No approval step.
- Usage is summed per calendar month; remaining = 150 − used.
- **Excess = only the minutes beyond 150.** It is split across records in date order, so you can see exactly which permission crossed the limit.
- **Nothing ever deducts a half-day automatically.** The admin sees excess under *Excess & deductions* and explicitly chooses *Approve half-day* or *No deduction* (with an optional note). Decisions are reversible (*Undo*) and flag if the excess changed afterwards.

"Absent" is derived at display time from missing records (working days only, after the join date, and today only once office hours end). Nothing fake is ever written to storage.

## Structure

```
index.html            sign-in + first-run admin setup
admin.html            admin panel   (dashboard, employees, attendance, permissions, excess & deductions, reports)
employee.html         employee panel (today / check-in-out, history, permission)
css/  base.css        tokens, reset
      layout.css      sidebar, topbar, grids, responsive
      components.css  buttons, forms, cards, tables, charts, modal, toast
js/   config.js       ALL office rules + backend switch
      utils.js        IST date/time helpers, CSV export
      rules.js        pure business logic (permission math, statuses, reports)
      store.js        async data layer: localStorage today, Supabase later
      ui.js           icons, toasts, modals, charts, router, guards
      login.js · admin.js · employee.js   page controllers
supabase/schema.sql   prepared tables, RLS policies, check-in RPCs (not used yet)
tests/rules.test.js   run: node tests/rules.test.js
```

## Preparing for Supabase

Views never touch storage directly; they call `AMS.store.*` (all `async`). To integrate:

1. Run `supabase/schema.sql` in your project (tables, RLS, `check_in()` / `check_out()` RPCs using server time).
2. Add `js/store.supabase.js` implementing the same methods as `store.js`, load the Supabase client, and set `backend: 'supabase'` plus your **public anon** URL/key in `config.js`.
3. Replace the local login with Supabase Auth; keep `rules.js` unchanged.

**Never** put the `service_role` key (or any secret) in front-end code.

## Security notes for this phase

- Data lives in the browser's `localStorage`. It is **not secure storage**: anyone with access to that browser profile can read or edit it, and data is per-browser, not shared between devices. Use it for UI development and demos only.
- Passwords are salted and hashed (PBKDF2-SHA256), never stored in plain text. Login lockout (5 attempts) is a UX guard, not real protection.
- All dynamic content is HTML-escaped; CSV exports neutralise spreadsheet formulas.
- Real access control, shared data and tamper-proof timestamps arrive with Supabase (RLS + server-side time).

## Known limits (candidates for the next phase)

Admin cannot yet edit a missed check-out; no public-holiday calendar (every Mon–Sat counts as a working day); no password-reset email (admin resets passwords).

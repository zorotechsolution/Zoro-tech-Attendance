/**
 * Data layer. Every method is async and returns plain objects, so this file can
 * be swapped for a Supabase implementation without touching any view code.
 *
 * Current backend: browser localStorage (frontend-only phase).
 * NOTE: localStorage is NOT secure storage — anyone with access to the browser
 * can read/edit it. Real security (auth, RLS) arrives with Supabase.
 *
 * Supabase mapping (future):  users -> profiles + auth.users,
 *   attendance -> attendance, permissions -> permissions, deductions -> half_day_deductions
 * See /supabase/schema.sql.
 */
(function (root) {
  const AMS = (root.AMS = root.AMS || {});
  const cfg = AMS.config;
  const U = AMS.utils;

  const K = {
    users: cfg.storagePrefix + 'users',
    attendance: cfg.storagePrefix + 'attendance',
    permissions: cfg.storagePrefix + 'permissions',
    deductions: cfg.storagePrefix + 'deductions',
    session: cfg.storagePrefix + 'session',
    lock: cfg.storagePrefix + 'login_lock',
  };

  // ------------------------------------------------------------------ low level
  function read(key, fallback) {
    try {
      const raw = root.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function write(key, value) { root.localStorage.setItem(key, JSON.stringify(value)); }

  function fail(msg) { const e = new Error(msg); e.userMessage = msg; throw e; }

  // ------------------------------------------------------------ password hashing
  function toHex(buf) { return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join(''); }
  function fromHex(hex) { return new Uint8Array(hex.match(/.{2}/g).map((h) => parseInt(h, 16))); }

  // Pure-JS SHA-256 for environments without SubtleCrypto (e.g., file://)
  function sha256Hex(message) {
    const K = [
      0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
      0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
      0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
      0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
      0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
      0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
      0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
      0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2,
    ];
    const H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
    const enc = new TextEncoder();
    const bytes = enc.encode(message);
    const bits = bytes.length * 8;
    const extra = (55 - bytes.length % 64 + 64) % 64;
    const padded = new Uint8Array(bytes.length + 1 + extra + 8);
    padded.set(bytes); padded[bytes.length] = 0x80;
    for (let i = 0; i < 8; i++) padded[padded.length - 8 + i] = (bits / Math.pow(2, (7 - i) * 8)) & 0xff;
    const W = new Uint32Array(64);
    const rotr = (x, n) => (x >>> n) | (x << (32 - n));
    for (let o = 0; o < padded.length; o += 64) {
      for (let i = 0; i < 16; i++) W[i] = (padded[o+i*4]<<24)|(padded[o+i*4+1]<<16)|(padded[o+i*4+2]<<8)|padded[o+i*4+3];
      for (let i = 16; i < 64; i++) {
        const s0 = rotr(W[i-15],7)^rotr(W[i-15],18)^(W[i-15]>>>3);
        const s1 = rotr(W[i-2],17)^rotr(W[i-2],19)^(W[i-2]>>>10);
        W[i] = (W[i-16]+s0+W[i-7]+s1) >>> 0;
      }
      let [a,b,c,d,e,f,g,h] = H;
      for (let i = 0; i < 64; i++) {
        const S1 = rotr(e,6)^rotr(e,11)^rotr(e,25);
        const ch = (e&f)^(~e&g);
        const t1 = (h+S1+ch+K[i]+W[i]) >>> 0;
        const S0 = rotr(a,2)^rotr(a,13)^rotr(a,22);
        const maj = (a&b)^(a&c)^(b&c);
        const t2 = (S0+maj) >>> 0;
        h=g; g=f; f=e; e=(d+t1)>>>0; d=c; c=b; b=a; a=(t1+t2)>>>0;
      }
      H[0]=(H[0]+a)>>>0; H[1]=(H[1]+b)>>>0; H[2]=(H[2]+c)>>>0; H[3]=(H[3]+d)>>>0;
      H[4]=(H[4]+e)>>>0; H[5]=(H[5]+f)>>>0; H[6]=(H[6]+g)>>>0; H[7]=(H[7]+h)>>>0;
    }
    return H.map(x => x.toString(16).padStart(8,'0')).join('');
  }

  async function hashPassword(password, saltHex) {
    const salt = saltHex ? fromHex(saltHex) : (root.crypto ? root.crypto.getRandomValues(new Uint8Array(16)) : (() => { const a = new Uint8Array(16); for (let i=0;i<16;i++) a[i]=Math.random()*256|0; return a; })());
    const saltHexStr = toHex(salt);

    if (root.crypto && root.crypto.subtle) {
      const key = await root.crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
      const bits = await root.crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 150000, hash: 'SHA-256' }, key, 256);
      return { salt: saltHexStr, hash: toHex(bits) };
    }
    // Fallback: SHA-256 key-stretching for file:// context (no SubtleCrypto).
    // 5,000 rounds keeps login fast while making brute-force harder than plain SHA-256.
    let h = password + ':' + saltHexStr;
    for (let i = 0; i < 5000; i++) h = sha256Hex(h + saltHexStr + i);
    return { salt: saltHexStr, hash: h };
  }

  function checkPasswordStrength(pw) {
    if (!pw || pw.length < cfg.minPasswordLength) fail(`Password must be at least ${cfg.minPasswordLength} characters.`);
    if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) fail('Password must contain letters and numbers.');
  }

  const safeUser = (u) => {
    if (!u) return null;
    const { pwHash, pwSalt, ...rest } = u; // never hand hashes to the UI
    return rest;
  };

  const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

  // --------------------------------------------------------------- session utils
  function currentSessionRaw() {
    const s = read(K.session, null);
    if (!s) return null;
    if (Date.now() > s.expiresAt) { root.localStorage.removeItem(K.session); return null; }
    return s;
  }

  function requireUser(role) {
    const s = currentSessionRaw();
    if (!s) fail('Your session has expired. Please sign in again.');
    const u = read(K.users, []).find((x) => x.id === s.userId);
    if (!u || !u.active) fail('This account is not active.');
    if (role && u.role !== role) fail('You do not have permission to do that.');
    return u;
  }

  // ===================================================================== store
  const store = {
    backend: 'local',

    // ------------------------------------------------------------------- auth
    async needsSetup() { return !read(K.users, []).some((u) => u.role === 'admin'); },

    async createAdmin({ name, email, password }) {
      if (read(K.users, []).some((u) => u.role === 'admin')) fail('An admin account already exists.');
      name = (name || '').trim(); email = (email || '').trim().toLowerCase();
      if (!name) fail('Enter your name.');
      if (!validEmail(email)) fail('Enter a valid email address.');
      checkPasswordStrength(password);
      const { salt, hash } = await hashPassword(password);
      const user = { id: U.uid(), role: 'admin', name, email, active: true, pwSalt: salt, pwHash: hash, createdAt: new Date().toISOString() };
      write(K.users, [...read(K.users, []), user]);
      return safeUser(user);
    },

    async login(email, password) {
      const lock = read(K.lock, { count: 0, until: 0 });
      if (Date.now() < lock.until) {
        fail(`Too many failed attempts. Try again in ${Math.ceil((lock.until - Date.now()) / 60000)} minute(s).`);
      }
      email = (email || '').trim().toLowerCase();
      const user = read(K.users, []).find((u) => u.email === email);
      let ok = false;
      if (user && user.active) {
        const { hash } = await hashPassword(password || '', user.pwSalt);
        ok = hash === user.pwHash;
      } else {
        await hashPassword(password || ''); // keep timing similar
      }
      if (!ok) {
        const count = (lock.count || 0) + 1;
        write(K.lock, count >= cfg.loginMaxAttempts
          ? { count: 0, until: Date.now() + cfg.loginLockMinutes * 60000 }
          : { count, until: 0 });
        fail('Incorrect email or password.');
      }
      write(K.lock, { count: 0, until: 0 });
      write(K.session, { userId: user.id, expiresAt: Date.now() + cfg.sessionHours * 3600000 });
      return safeUser(user);
    },

    async logout() { root.localStorage.removeItem(K.session); },

    async getSession() {
      const s = currentSessionRaw();
      if (!s) return null;
      const u = read(K.users, []).find((x) => x.id === s.userId);
      return u && u.active ? safeUser(u) : null;
    },

    async changePassword(oldPassword, newPassword) {
      const me = requireUser();
      const { hash } = await hashPassword(oldPassword || '', me.pwSalt);
      if (hash !== me.pwHash) fail('Current password is incorrect.');
      checkPasswordStrength(newPassword);
      const h = await hashPassword(newPassword);
      write(K.users, read(K.users, []).map((u) => (u.id === me.id ? { ...u, pwSalt: h.salt, pwHash: h.hash } : u)));
    },

    // -------------------------------------------------------------- employees
    async listEmployees() {
      requireUser();
      return read(K.users, []).filter((u) => u.role === 'employee').map(safeUser)
        .sort((a, b) => a.name.localeCompare(b.name));
    },

    async addEmployee({ name, email, phone, designation, joinDate, password }) {
      requireUser('admin');
      name = (name || '').trim(); email = (email || '').trim().toLowerCase();
      if (!name) fail('Enter the employee name.');
      if (!validEmail(email)) fail('Enter a valid email address.');
      if (!joinDate) fail('Choose a join date.');
      const users = read(K.users, []);
      if (users.some((u) => u.email === email)) fail('Another account already uses this email.');
      if (users.filter((u) => u.role === 'employee' && u.active).length >= cfg.maxEmployees) {
        fail(`Team limit reached (${cfg.maxEmployees} active employees). Deactivate someone first.`);
      }
      checkPasswordStrength(password);
      const h = await hashPassword(password);
      const user = {
        id: U.uid(), role: 'employee', name, email, phone: (phone || '').trim(),
        designation: (designation || '').trim(), joinDate, active: true,
        pwSalt: h.salt, pwHash: h.hash, createdAt: new Date().toISOString(),
      };
      write(K.users, [...users, user]);
      return safeUser(user);
    },

    async updateEmployee(id, patch) {
      requireUser('admin');
      const users = read(K.users, []);
      const target = users.find((u) => u.id === id && u.role === 'employee');
      if (!target) fail('Employee not found.');
      const next = { ...target };
      if (patch.name !== undefined) { next.name = patch.name.trim(); if (!next.name) fail('Enter the employee name.'); }
      if (patch.email !== undefined) {
        const em = patch.email.trim().toLowerCase();
        if (!validEmail(em)) fail('Enter a valid email address.');
        if (users.some((u) => u.id !== id && u.email === em)) fail('Another account already uses this email.');
        next.email = em;
      }
      ['phone', 'designation', 'joinDate'].forEach((f) => { if (patch[f] !== undefined) next[f] = String(patch[f]).trim(); });
      write(K.users, users.map((u) => (u.id === id ? next : u)));
      return safeUser(next);
    },

    async setEmployeeActive(id, active) {
      requireUser('admin');
      const users = read(K.users, []);
      const target = users.find((u) => u.id === id && u.role === 'employee');
      if (!target) fail('Employee not found.');
      if (active && !target.active &&
        users.filter((u) => u.role === 'employee' && u.active).length >= cfg.maxEmployees) {
        fail(`Team limit reached (${cfg.maxEmployees} active employees).`);
      }
      write(K.users, users.map((u) => (u.id === id ? { ...u, active: !!active } : u)));
    },

    async resetEmployeePassword(id, newPassword) {
      requireUser('admin');
      checkPasswordStrength(newPassword);
      const h = await hashPassword(newPassword);
      const users = read(K.users, []);
      if (!users.some((u) => u.id === id && u.role === 'employee')) fail('Employee not found.');
      write(K.users, users.map((u) => (u.id === id ? { ...u, pwSalt: h.salt, pwHash: h.hash } : u)));
    },

    // ------------------------------------------------------------- attendance
    /** Admin: all (optionally filtered). Employee: own records only. */
    async listAttendance({ employeeId, from, to } = {}) {
      const me = requireUser();
      let list = read(K.attendance, []);
      if (me.role !== 'admin') employeeId = me.id;
      if (employeeId) list = list.filter((a) => a.employeeId === employeeId);
      if (from) list = list.filter((a) => a.date >= from);
      if (to) list = list.filter((a) => a.date <= to);
      return list.sort((a, b) => b.date.localeCompare(a.date));
    },

    async checkIn() {
      const me = requireUser('employee');
      const now = U.nowIST();
      if (!U.isWorkingDay(now.dateKey)) fail('Today is not a working day (Mon–Sat).');
      const all = read(K.attendance, []);
      if (all.some((a) => a.employeeId === me.id && a.date === now.dateKey)) fail('You have already checked in today.');
      const rec = { id: U.uid(), employeeId: me.id, date: now.dateKey, checkIn: now.iso, checkOut: null };
      write(K.attendance, [...all, rec]);
      return rec;
    },

    async checkOut() {
      const me = requireUser('employee');
      const now = U.nowIST();
      const all = read(K.attendance, []);
      const rec = all.find((a) => a.employeeId === me.id && a.date === now.dateKey);
      if (!rec) fail('You have not checked in today.');
      if (rec.checkOut) fail('You have already checked out today.');
      const updated = { ...rec, checkOut: now.iso };
      write(K.attendance, all.map((a) => (a.id === rec.id ? updated : a)));
      return updated;
    },

    // ------------------------------------------------------------ permissions
    async listPermissions({ employeeId, month } = {}) {
      const me = requireUser();
      let list = read(K.permissions, []);
      if (me.role !== 'admin') employeeId = me.id;
      if (employeeId) list = list.filter((p) => p.employeeId === employeeId);
      if (month) list = list.filter((p) => p.date.startsWith(month));
      return list.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
    },

    /** Employees record their own permission directly (no approval step). */
    async addPermission({ date, startTime, endTime, reason }) {
      const me = requireUser('employee');
      const all = read(K.permissions, []);
      const mine = all.filter((p) => p.employeeId === me.id);
      const errors = AMS.rules.validatePermission({ date, startTime, endTime }, mine, U.nowIST());
      if (errors.length) fail(errors[0]);
      const rec = {
        id: U.uid(), employeeId: me.id, date, startTime, endTime,
        minutes: AMS.rules.permissionMinutes(startTime, endTime),
        reason: (reason || '').trim().slice(0, 200), createdAt: new Date().toISOString(),
      };
      write(K.permissions, [...all, rec]);
      return rec;
    },

    /** Admin only: remove a wrongly recorded permission. */
    async deletePermission(id) {
      requireUser('admin');
      write(K.permissions, read(K.permissions, []).filter((p) => p.id !== id));
    },

    // ------------------------------------------------------------- deductions
    /** Admin: all. Employee: own (read-only transparency). */
    async listDeductions({ employeeId, month } = {}) {
      const me = requireUser();
      let list = read(K.deductions, []);
      if (me.role !== 'admin') employeeId = me.id;
      if (employeeId) list = list.filter((d) => d.employeeId === employeeId);
      if (month) list = list.filter((d) => d.month === month);
      return list.sort((a, b) => b.decidedAt.localeCompare(a.decidedAt));
    },

    /**
     * Admin records a MANUAL decision. decision: 'approved' (one half-day deduction)
     * or 'declined' (no deduction). Nothing in the app creates these automatically.
     */
    async addDeductionDecision({ employeeId, month, decision, excessMinutes, note }) {
      const me = requireUser('admin');
      if (!['approved', 'declined'].includes(decision)) fail('Invalid decision.');
      if (!(excessMinutes > 0)) fail('There is no excess permission to act on for this month.');
      const all = read(K.deductions, []);
      function mk() {
        return {
          id: U.uid(), employeeId, month, decision, days: decision === 'approved' ? 0.5 : 0,
          excessMinutes, note: (note || '').trim().slice(0, 200), decidedBy: me.id, decidedAt: new Date().toISOString(),
        };
      }
      if (decision === 'declined') {
        // A decline replaces earlier decisions for that employee-month.
        const kept = all.filter((d) => !(d.employeeId === employeeId && d.month === month));
        kept.push(mk());
        write(K.deductions, kept);
      } else {
        // Approving removes a previous "declined" and adds one half-day.
        const kept = all.filter((d) => !(d.employeeId === employeeId && d.month === month && d.decision === 'declined'));
        kept.push(mk());
        write(K.deductions, kept);
      }
    },

    async revokeDeduction(id) {
      requireUser('admin');
      write(K.deductions, read(K.deductions, []).filter((d) => d.id !== id));
    },
  };

  AMS.store = store;
})(typeof window !== 'undefined' ? window : globalThis);

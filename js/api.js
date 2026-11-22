(function (root) {
  'use strict';

  const makeKeys = (p) => ({
    set: p + 'set.v1',
    compare: p + 'compare.v1',
    users: p + 'users.v1',
    session: p + 'session.v1',
    sets: p + 'sets.v1',
    catalog: p + 'catalog.v1',
    token: p + 'token.v1',
  });
  let K = makeKeys('subdog.');

  const mem = {};
  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? (key in mem ? mem[key] : fallback) : JSON.parse(raw);
    } catch (e) {
      return key in mem ? mem[key] : fallback;
    }
  }
  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { mem[key] = value; }
  }
  function remove(key) {
    try { localStorage.removeItem(key); } catch (e) { }
    delete mem[key];
  }

  function weakHash(str) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }
  const hasCrypto = () => !!(root.crypto && root.crypto.subtle && root.TextEncoder);

  async function strongHash(password, salt) {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(salt), iterations: 120000, hash: 'SHA-256' }, key, 256);
    return 'p2:' + Array.from(new Uint8Array(bits)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  async function makeHash(password, salt) {
    return hasCrypto() ? strongHash(password, salt) : weakHash(salt + password);
  }
  async function verify(user, password) {
    if (String(user.hash).indexOf('p2:') === 0) return hasCrypto() && (await strongHash(password, user.salt)) === user.hash;
    return weakHash(user.salt + password) === user.hash;
  }

  const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  function allUsers() {
    let u = read(K.users, null);
    if (!u) {
      u = [{ id: 'u-admin', email: 'admin@subdog.local', name: 'Адміністратор', role: 'admin', salt: 's0', hash: weakHash('s0admin123') }];
      write(K.users, u);
    }
    return u;
  }
  const pub = (u) => (u ? { id: u.id, email: u.email, name: u.name, role: u.role } : null);

  let baseCache = null;
  async function loadBase() {
    if (baseCache) return baseCache;
    try {
      const res = await fetch('data/catalog.json', { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      baseCache = await res.json();
    } catch (e) {
      if (!root.SUBDOG_DATA) throw new Error(tr('Не вдалося завантажити каталог'));
      baseCache = root.SUBDOG_DATA;
    }
    return baseCache;
  }

  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  function diffAgainstBase(services, base) {
    const baseById = {};
    base.services.forEach((s) => { baseById[s.id] = s; });
    const upserts = {};
    services.forEach((s) => { if (!baseById[s.id] || !same(baseById[s.id], s)) upserts[s.id] = s; });
    const present = {};
    services.forEach((s) => { present[s.id] = true; });
    const deleted = base.services.filter((s) => !present[s.id]).map((s) => s.id);
    return { v: 2, cur: 'USD', upserts: upserts, deleted: deleted, savedAt: Date.now() };
  }

  function normalizeOverride(ov, base) {
    if (!ov) return null;
    if (ov.cur !== 'USD') { remove(K.catalog); return null; }
    if (ov.v === 2) return ov;
    if (Array.isArray(ov.services)) {
      const n = diffAgainstBase(ov.services, base);
      write(K.catalog, n);
      return n;
    }
    return null;
  }

  function mergeCatalog(base, ov) {
    const copy = JSON.parse(JSON.stringify(base));
    const up = (ov && ov.upserts) || {};
    const del = new Set((ov && ov.deleted) || []);
    const baseIds = new Set(base.services.map((s) => s.id));
    const out = base.services.filter((s) => !del.has(s.id)).map((s) => JSON.parse(JSON.stringify(up[s.id] || s)));
    Object.keys(up).forEach((id) => { if (!baseIds.has(id)) out.push(JSON.parse(JSON.stringify(up[id]))); });
    copy.services = out;
    copy.customized = !!(ov && (Object.keys(up).length || del.size));
    return copy;
  }

  let serverMode = false;
  let forcedLocal = false;
  const ready = (async function detect() {
    if (!/^https?:$/.test(root.location ? root.location.protocol : '')) return;
    try {
      const r = await fetch('api/health', { cache: 'no-store' });
      const j = r.ok ? await r.json() : null;
      serverMode = !!(j && j.subdog);
    } catch (e) { serverMode = false; }
  })();
  const useServer = async () => { await ready; return serverMode && !forcedLocal; };

  const MSG = {
    invalid_email: 'Введіть коректну пошту',
    invalid_name: "Вкажіть ім'я (мінімум 2 символи)",
    weak_password: 'Пароль має містити щонайменше 6 символів',
    email_taken: 'Акаунт із такою поштою вже існує',
    bad_credentials: 'Невірна пошта або пароль',
    unauthorized: 'Увійдіть в акаунт',
    forbidden: 'Недостатньо прав для цієї дії',
    too_many_attempts: 'Забагато невдалих спроб входу. Спробуйте через 10 хвилин',
    invalid_set: 'Набір має неправильний вигляд',
    invalid_catalog: 'Правки каталогу мають неправильний вигляд',
    not_found: 'Не знайдено',
    too_large: 'Забагато даних',
    bad_request: 'Неправильний запит',
    server_error: 'Помилка сервера',
  };
  const tr = (s, p) => (root.I18n ? root.I18n.t(s, p) : s);
  const E = (code) => new Error(tr(MSG[code]));
  const getToken = () => read(K.token, null);
  const setToken = (t) => { if (t) write(K.token, t); else remove(K.token); };

  async function call(method, path, body) {
    const headers = {};
    const tok = getToken();
    if (tok) headers.Authorization = 'Bearer ' + tok;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    let res;
    try {
      res = await fetch('api/' + path, { method: method, headers: headers, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store' });
    } catch (e) { throw new Error(tr("Немає зв'язку із сервером")); }
    let json = null;
    try { json = await res.json(); } catch (e) { }
    if (!res.ok) {
      if (res.status === 401 && tok && path !== 'login' && path !== 'register') setToken(null);
      throw new Error(MSG[json && json.error] ? tr(MSG[json.error]) : tr('Помилка сервера ({status})', { status: res.status }));
    }
    return json;
  }

  const remote = {
    async getCatalog() {
      const base = await loadBase();
      let ov = null;
      try { ov = (await call('GET', 'catalog-overrides')).overrides; } catch (e) { }
      return mergeCatalog(base, ov && ov.v === 2 && ov.cur === 'USD' ? ov : null);
    },
    async saveServices(services) { await call('PUT', 'catalog-overrides', diffAgainstBase(services, await loadBase())); },
    async resetCatalog() { await call('DELETE', 'catalog-overrides'); },
    async me() {
      if (!getToken()) return null;
      try { return (await call('GET', 'me')).user; } catch (e) { setToken(null); return null; }
    },
    async register(d) {
      const r = await call('POST', 'register', { name: d.name, email: d.email, password: d.password });
      setToken(r.token); return r.user;
    },
    async login(d) {
      const r = await call('POST', 'login', { email: d.email, password: d.password });
      setToken(r.token); return r.user;
    },
    async logout() { try { await call('POST', 'logout', {}); } catch (e) { } setToken(null); },
    async listSets() { return getToken() ? (await call('GET', 'sets')).sets : []; },
    async saveUserSet(name, state) {
      if (!getToken()) throw new Error(tr('Увійдіть в акаунт, щоб зберегти набір'));
      return (await call('POST', 'sets', { name: name, state: state })).set;
    },
    async deleteUserSet(id) { await call('DELETE', 'sets/' + encodeURIComponent(id)); },
  };

  const local = {
    async getCatalog() {
      const base = await loadBase();
      return mergeCatalog(base, normalizeOverride(read(K.catalog, null), base));
    },
    async saveServices(services) { write(K.catalog, diffAgainstBase(services, await loadBase())); },
    async resetCatalog() { remove(K.catalog); },
    async me() {
      const id = read(K.session, null);
      return pub(allUsers().find((u) => u.id === id));
    },
    async register(data) {
      const email = String(data.email || '').trim().toLowerCase();
      const name = String(data.name || '').trim();
      const password = String(data.password || '');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw E('invalid_email');
      if (name.length < 2) throw E('invalid_name');
      if (password.length < 6) throw E('weak_password');
      const users = allUsers();
      if (users.some((u) => u.email === email)) throw E('email_taken');
      const salt = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
      const user = { id: uid('u-'), email: email, name: name, role: 'user', salt: salt, hash: await makeHash(password, salt) };
      users.push(user);
      write(K.users, users);
      write(K.session, user.id);
      return pub(user);
    },
    async login(data) {
      const email = String(data.email || '').trim().toLowerCase();
      const password = String(data.password || '');
      const users = allUsers();
      const user = users.find((u) => u.email === email);
      if (!user || !(await verify(user, password))) throw E('bad_credentials');
      if (String(user.hash).indexOf('p2:') !== 0 && hasCrypto()) {
        user.hash = await strongHash(password, user.salt);
        write(K.users, users);
      }
      write(K.session, user.id);
      return pub(user);
    },
    async logout() { remove(K.session); },
    async listSets() {
      const id = read(K.session, null);
      if (!id) return [];
      return read(K.sets, []).filter((s) => s.userId === id).sort((a, b) => b.createdAt - a.createdAt);
    },
    async saveUserSet(name, state) {
      const id = read(K.session, null);
      if (!id) throw new Error(tr('Увійдіть в акаунт, щоб зберегти набір'));
      const all = read(K.sets, []);
      const rec = { id: uid('set-'), userId: id, name: name, state: JSON.parse(JSON.stringify(state)), createdAt: Date.now() };
      all.push(rec);
      write(K.sets, all);
      return rec;
    },
    async deleteUserSet(setId) {
      const id = read(K.session, null);
      write(K.sets, read(K.sets, []).filter((s) => !(s.id === setId && s.userId === id)));
    },
  };

  const Api = {
    ready: ready,
    mode() { return serverMode && !forcedLocal ? 'server' : 'local'; },
    forceLocal(v) { forcedLocal = !!v; },
    setNamespace(prefix) { K = makeKeys(prefix); },
    namespaceKeys() { return Object.keys(K).map((k) => K[k]); },

    loadSet() { return read(K.set, null); },
    saveSet(state) { write(K.set, state); },
    loadCompare() { return read(K.compare, []); },
    saveCompare(ids) { write(K.compare, ids); },
  };
  ['getCatalog', 'saveServices', 'resetCatalog', 'me', 'register', 'login', 'logout', 'listSets', 'saveUserSet', 'deleteUserSet'].forEach((name) => {
    Api[name] = async function () {
      const impl = (await useServer()) ? remote : local;
      return impl[name].apply(null, arguments);
    };
  });

  root.Api = Api;
})(typeof window !== 'undefined' ? window : globalThis);
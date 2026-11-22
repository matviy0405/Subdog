/* Subdog — інтерфейс / interface. Залежить від Calc (calc.js), I18n (i18n.js) та Api (api.js).
   Усі видимі рядки загорнуто в T('український текст'): англійський переклад лежить у js/i18n.js. */
(function () {
  'use strict';

  const { priceFor, setTotals, duplicates, recommend, PLAN_LABELS, r2 } = Calc;
  const T = I18n.t;
  const L = I18n.L;

  /* ---------- утиліти ---------- */
  const $ = (s, root) => (root || document).querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // Усі ціни в доларах США. Цілі числа без копійок, інакше два знаки: $20, $4.99
  const fmts = {};
  const fmt = (n) => {
    const loc = I18n.locale();
    const key = loc + (Number.isInteger(n) ? 'i' : 'f');
    if (!fmts[key]) fmts[key] = new Intl.NumberFormat(loc, Number.isInteger(n) ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return fmts[key].format(n);
  };
  const money = (n) => '$' + fmt(n);
  const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : '#');
  const fmtDate = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso + 'T00:00:00Z');
    return isNaN(d) ? iso : d.toLocaleDateString(I18n.locale(), { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
  };
  const mono = (s, cls) => `<span class="mono ${cls || ''}" aria-hidden="true">${esc(s.name.charAt(0))}</span>`;
  const PLANS = ['individual', 'student', 'team'];
  const planLabel = (p) => T(PLAN_LABELS[p]);
  const serviceWord = (n) => I18n.plural(n, ['сервіс', 'сервіси', 'сервісів'], ['service', 'services']);

  /* ---------- стан ---------- */
  const S = {
    data: null,
    byId: {},
    user: null,
    set: { items: [], plan: 'individual', seats: 3, yearly: true },
    compare: [],
    filters: { q: '', cat: 'all', max: null, free: false, student: false, team: false, sort: 'name' },
    adder: { q: '', cat: 'all' },
    wiz: { step: 1, mode: null, role: null, sphere: null },
    accTab: 'login',
  };

  const svc = (id) => S.byId[id];
  const catOf = (id) => (S.data.categories.find((c) => c.id === id) || { name: id, icon: '•' });
  const catName = (id) => L(catOf(id), 'name');
  const calcOpts = () => ({ plan: S.set.plan, seats: S.set.seats, useYearly: S.set.yearly });
  const totals = (opts) => setTotals(S.set.items, S.byId, opts || calcOpts());
  const inSet = (id) => S.set.items.some((i) => i.id === id);
  const isAdmin = () => !!(S.user && S.user.role === 'admin');
  // Тестові дані адміна показуємо лише під час локальної розробки
  const isLocalHost = () => location.protocol === 'file:' || ['localhost', '127.0.0.1', '[::1]', ''].includes(location.hostname);

  function indexCatalog() {
    S.byId = {};
    S.data.services.forEach((s) => { S.byId[s.id] = s; });
  }

  function sanitizeSet(raw) {
    const base = { items: [], plan: 'individual', seats: 3, yearly: true };
    if (!raw || typeof raw !== 'object') return base;
    const seen = {};
    const items = (Array.isArray(raw.items) ? raw.items : [])
      .filter((i) => i && S.byId[i.id] && !seen[i.id] && (seen[i.id] = true))
      .map((i) => {
        const out = { id: i.id, free: !!i.free };
        const q = Math.floor(Number(i.qty));
        if (q >= 1) out.qty = Math.min(500, q); // ліцензії саме для цього сервісу
        return out;
      });
    return {
      items: items,
      plan: PLANS.includes(raw.plan) ? raw.plan : 'individual',
      seats: Math.min(500, Math.max(1, Math.floor(Number(raw.seats) || 3))),
      yearly: raw.yearly !== false,
    };
  }

  function persist() {
    Api.saveSet(S.set);
    Api.saveCompare(S.compare);
    chrome();
  }

  /* ---------- UI-помічники ---------- */
  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  function formDialog(opts) {
    return new Promise((resolve) => {
      const dlg = $('#dlg');
      dlg.innerHTML = `<form novalidate><h2 id="dlgTitle">${esc(opts.title)}</h2>${opts.body || ''}<p class="form-error" role="alert" hidden></p>
        <div class="dlg-actions"><button type="button" class="btn ghost" data-close>${esc(opts.cancel || T('Скасувати'))}</button>
        <button class="btn ${opts.danger ? 'danger' : 'primary'}">${esc(opts.ok || T('Зберегти'))}</button></div></form>`;
      const form = $('form', dlg);
      let done = false;
      const finish = (v) => { if (done) return; done = true; if (dlg.open) dlg.close(); resolve(v); };
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const fd = {};
        new FormData(form).forEach((v, k) => { fd[k] = v; });
        const err = opts.validate ? opts.validate(fd) : '';
        if (err) { const p = $('.form-error', form); p.textContent = err; p.hidden = false; return; }
        finish(fd);
      });
      $('[data-close]', form).addEventListener('click', () => finish(null));
      dlg.addEventListener('close', () => finish(null), { once: true });
      dlg.showModal();
      const first = $('input:not([type=hidden]), select, textarea', form);
      if (first) first.focus();
    });
  }
  const confirmDialog = (title, text, ok, danger) =>
    formDialog({ title: title, body: `<p>${esc(text)}</p>`, ok: ok || T('Так'), danger: !!danger }).then((r) => !!r);

  /* ---------- статичні тексти index.html і мова ---------- */
  function applyStatic() {
    const lang = I18n.lang();
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = T(el.getAttribute('data-i18n')); });
    document.querySelectorAll('[data-i18n-label]').forEach((el) => { el.setAttribute('aria-label', T(el.getAttribute('data-i18n-label'))); });
    const meta = $('meta[name="description"]');
    if (meta) meta.setAttribute('content', T('Оберіть мету й сферу — Subdog збере комплект підписок для навчання й роботи та порахує вартість на місяць і на рік, у тому числі для команди.'));
    const lb = $('#langBtn');
    if (lb) {
      lb.textContent = lang === 'uk' ? 'EN' : 'UA';
      lb.setAttribute('aria-label', lang === 'uk' ? 'Switch to English' : 'Перемкнути на українську');
      lb.setAttribute('title', lang === 'uk' ? 'English' : 'Українська');
    }
    setMenuLabel();
  }

  /* ---------- шапка ---------- */
  function chrome() {
    const route = currentRoute().name;
    const links = [
      ['', T('Головна'), ''],
      ['catalog', T('Каталог'), ''],
      ['builder', T('Конструктор'), S.set.items.length || ''],
      ['compare', T('Порівняння'), S.compare.length || ''],
      ['account', S.user ? T('Мої набори') : T('Вхід'), ''],
    ];
    if (isAdmin()) links.push(['admin', T('Адмін'), '']);
    $('#nav').innerHTML = links.map(([r, label, n]) =>
      `<a href="#/${r}" ${route === r || (r === 'catalog' && route === 'service') ? 'aria-current="page"' : ''}>${label}${n !== '' ? `<span class="pill">${n}</span>` : ''}</a>`).join('');
    $('#footNote').textContent = (S.data ? L(S.data, 'pricesNote') + ' ' : '') + T("Назви належать їхнім власникам; Subdog з ними не пов'язаний.");
  }

  /* ---------- роутер ---------- */
  function currentRoute() {
    const parts = location.hash.replace(/^#\/?/, '').split('/');
    return { name: parts[0] || '', arg: parts[1] ? decodeURIComponent(parts[1]) : '' };
  }
  const pageTitle = (name) => ({
    catalog: T('Каталог'), builder: T('Конструктор набору'), compare: T('Порівняння підписок'),
    account: T('Акаунт'), admin: T('Адмін-панель'), service: T('Картка підписки'),
  }[name]);

  let lastRouteKey = null;

  /* Селектор елемента, що зараз у фокусі, щоб повернути фокус після перемальовування.
     Лише кнопки, галочки й списки: текстові поля не чіпаємо, щоб не красти фокус у Tab. */
  function focusSelector() {
    const a = document.activeElement;
    if (!a || !a.dataset) return '';
    const ok = a.tagName === 'BUTTON' || a.tagName === 'SELECT' || (a.tagName === 'INPUT' && a.type === 'checkbox');
    if (!ok) return '';
    const v = a.dataset.v !== undefined ? `[data-v="${CSS.escape(a.dataset.v)}"]` : '';
    if (a.dataset.act) return `[data-act="${a.dataset.act}"]` + v;
    if (a.dataset.actChange) return `[data-act-change="${a.dataset.actChange}"]` + v;
    if (a.dataset.bind) return `[data-bind="${a.dataset.bind}"]`;
    return '';
  }
  const restoreFocus = (sel) => { if (!sel) return; const el = $(sel); if (el) el.focus({ preventScroll: true }); };

  /* Перемальовує поточну сторінку. Якщо це та сама сторінка (змінили фільтр, план, мову),
     позиція прокрутки сторінки й бічної панелі та фокус зберігаються; на нову сторінку — нагору. */
  function render() {
    if (!S.data) return;
    const { name, arg } = currentRoute();
    const key = name + '/' + arg;
    const samePage = key === lastRouteKey;

    const scrollY = window.scrollY;
    const side = $('.filters');
    const sideTop = side ? side.scrollTop : 0;
    const focusSel = samePage ? focusSelector() : '';

    const pages = { '': pageHome, catalog: pageCatalog, builder: pageBuilder, compare: pageCompare, account: pageAccount, admin: pageAdmin, service: pageService };
    const fn = pages[name] || pageHome;
    $('#app').innerHTML = `<div class="wrap">${fn(arg)}</div>`;
    document.title = name === '' ? T('Subdog — конструктор комплекту підписок') : (pageTitle(name) || 'Subdog') + ' — Subdog';
    chrome();

    if (samePage) {
      window.scrollTo({ top: scrollY, behavior: 'instant' });
      const newSide = $('.filters');
      if (newSide) newSide.scrollTop = sideTop;
      restoreFocus(focusSel);
    } else {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
    lastRouteKey = key;
    if (name === 'account' && S.user) fillSaved();
  }

  /* ---------- ціна: шматки HTML ---------- */
  function priceInline(s, plan, seats) {
    const p = priceFor(s, { plan: plan, seats: seats || 1, useYearly: false });
    if (plan === 'student' && p.discount) return `<s>${money(p.listMonthly)}</s> <span>${money(p.monthly)}</span>`;
    return money(p.monthly);
  }
  function badgesOf(s) {
    const b = [];
    if (s.free) b.push(`<span class="tag good">${T('Є безкоштовний план')}</span>`);
    if (s.studentDiscount > 0) b.push(`<span class="tag brand">${T('Студентам −{n}%', { n: s.studentDiscount })}</span>`);
    if (s.team && s.team.price != null) b.push(`<span class="tag">${T('Командний план')}</span>`);
    if (s.yearlyPrice != null && s.yearlyPrice < s.price * 12) b.push(`<span class="tag">${T('Річний тариф −{n}%', { n: Math.round((1 - s.yearlyPrice / (s.price * 12)) * 100) })}</span>`);
    return b.join('');
  }
  function planSwitch(extra) {
    return `<div class="seg" role="group" aria-label="${T('Тип плану')}">${PLANS.map((p) =>
      `<button type="button" data-act="plan" data-v="${p}" aria-pressed="${S.set.plan === p}">${planLabel(p)}</button>`).join('')}</div>${extra || ''}`;
  }
  const planUnit = () => (S.set.plan === 'team' ? T('/міс за людину') : T('/міс'));

  /* =====================================================================
     ГОЛОВНА
     ===================================================================== */
  /* Абстрактна 3D-композиція: скляна сфера, кільця орбіт, куби. Чистий CSS, без зображень. */
  function heroArt() {
    const ring = '<div class="ring"></div><div class="ring r2"></div>';
    const cube = (cls) => `<div class="cube ${cls}"><i></i><i></i><i></i><i></i><i></i><i></i></div>`;
    return `<div class="hero-art" aria-hidden="true"><div class="halo"></div>
      <div class="ring-set back">${ring}</div><div class="orb"></div><div class="ring-set front">${ring}</div>
      ${cube('c1')}${cube('c2')}<span class="spark s1"></span><span class="spark s2"></span><span class="spark s3"></span></div>`;
  }

  function pageHome() {
    return `
    <section class="hero" aria-labelledby="h-hero">
      <div class="hero-top">
        <div>
          <p class="eyebrow">${T('Конструктор підписок')}</p>
          <h1 id="h-hero">${T('Підписки для навчання й роботи —')} <span class="grad">${T('одним комплектом')}</span></h1>
          <p class="lead">${T('Оберіть мету й сферу — Subdog запропонує готовий набір сервісів. Приберіть зайве, додайте потрібне й одразу побачите вартість на місяць і на рік, у тому числі для всієї команди.')}</p>
          <div class="row"><a class="btn primary" href="#/catalog">${T('Відкрити каталог')} <span class="arrow" aria-hidden="true">→</span></a><a class="btn ghost" href="#/builder">${T('Мій набір')}${S.set.items.length ? ' (' + S.set.items.length + ')' : ''}</a></div>
          <ul class="facts">
            <li><span class="n">01</span><span>${T('{n} сервісів у {c} категоріях', { n: S.data.services.length, c: S.data.categories.length })}</span></li>
            <li><span class="n">02</span><span>${T('Індивідуальний, студентський і командний плани')}</span></li>
            <li><span class="n">03</span><span>${T('Сума на місяць і на рік перераховується одразу')}</span></li>
          </ul>
        </div>
        <div class="hero-side">${heroArt()}<div class="card wizard" id="wizard">${wizardHtml()}</div></div>
      </div>
    </section>

    <section class="section" aria-labelledby="h-presets">
      <div class="section-head"><div><p class="eyebrow">${T('01 — Готові набори')}</p><h2 id="h-presets">${T('Почніть із готового')}</h2></div><span class="muted small">${T('Ціни рахуються за планом набору')}</span></div>
      <div class="grid auto">${S.data.presets.map(presetCard).join('')}</div>
    </section>

    <section class="section" aria-labelledby="h-biz">
      <div class="biz">
        <div>
          <p class="eyebrow">${T('02 — Для бізнесу')}</p>
          <h2 id="h-biz">${T('Замовляєте на всю команду? Рахуйте одразу на всіх')}</h2>
          <p>${T('Оберіть командний план і вкажіть кількість людей — калькулятор покаже суму за всіх і ціну на одну людину. Річні тарифи зазвичай дешевші.')}</p>
          <button class="btn primary" data-act="apply-preset" data-v="own-business">${T('Набір для бізнесу')} <span class="arrow" aria-hidden="true">→</span></button>
        </div>
        <ul>
          <li><span class="n">01</span><span>${T('Ціна за людину × кількість людей')}</span></li>
          <li><span class="n">02</span><span>${T('Швидкий вибір: 5, 10, 25 або 50 місць')}</span></li>
          <li><span class="n">03</span><span>${T('Видно економію від річних тарифів')}</span></li>
        </ul>
      </div>
    </section>

    <section class="section" aria-labelledby="h-how">
      <p class="eyebrow">${T('03 — Як це працює')}</p>
      <h2 id="h-how" style="margin-bottom:32px">${T('Три кроки до готового набору')}</h2>
      <div class="steps-3">
        <div><p class="eyebrow">01</p><h3>${T('Дайте три відповіді')}</h3><p class="muted">${T('Навчання, робота чи обидва; хто ви; у якій сфері.')}</p></div>
        <div><p class="eyebrow">02</p><h3>${T('Відредагуйте набір')}</h3><p class="muted">${T('Додайте або приберіть сервіси, увімкніть безкоштовні плани, перемкніть Індивідуальний / Студентський / Командний.')}</p></div>
        <div><p class="eyebrow">03</p><h3>${T('Перегляньте суму й збережіть')}</h3><p class="muted">${T('Підсумок перераховується одразу. Набір лишається в браузері, а в акаунті — назавжди.')}</p></div>
      </div>
    </section>

    <section class="section" aria-labelledby="h-cats">
      <p class="eyebrow">${T('04 — Каталог')}</p>
      <h2 id="h-cats" style="margin-bottom:32px">${T('Категорії')}</h2>
      <div class="cat-list">${S.data.categories.map((c) => {
        const list = S.data.services.filter((s) => s.category === c.id);
        return `<a href="#/catalog" data-act="goto-cat" data-v="${c.id}"><h3>${esc(L(c, 'name'))}</h3><span class="muted small">${list.map((s) => esc(s.name)).join(', ')}</span></a>`;
      }).join('')}</div>
    </section>`;
  }

  function wizardHtml() {
    const w = S.data.wizard;
    const st = S.wiz;
    const dots = `<div class="steps" aria-hidden="true">${[1, 2, 3].map((i) => `<span class="${st.step >= i ? 'done' : ''}"></span>`).join('')}</div>`;
    const modeT = w.modes.find((m) => m.id === st.mode);
    const roleT = w.roles.find((r) => r.id === st.role);
    const picked = [modeT && L(modeT, 'title'), roleT && L(roleT, 'title')].filter(Boolean).map((x) => `<span class="tag brand">${esc(x)}</span>`).join('');
    let body = '';
    if (st.step === 1) {
      body = `<h2>${T('Для чого потрібен набір?')}</h2><div class="choices">${w.modes.map((m) =>
        `<button class="choice" data-act="wiz-mode" data-v="${m.id}" aria-pressed="${st.mode === m.id}"><span class="ico" aria-hidden="true">${m.icon}</span><span><b>${esc(L(m, 'title'))}</b><small>${esc(L(m, 'text'))}</small></span></button>`).join('')}</div>`;
    } else if (st.step === 2) {
      body = `<h2>${T('Хто ви?')}</h2><div class="picked">${picked}</div><div class="choices">${w.roles.filter((r) => r.mode === st.mode).map((r) =>
        `<button class="choice" data-act="wiz-role" data-v="${r.id}" aria-pressed="${st.role === r.id}"><span><b>${esc(L(r, 'title'))}</b><small>${esc(L(r, 'text'))}</small></span></button>`).join('')}</div>
        <p style="margin-top:12px"><button class="btn ghost sm" data-act="wiz-back">${T('← Назад')}</button></p>`;
    } else {
      body = `<h2>${T('Яка ваша сфера?')}</h2><div class="picked">${picked}</div><div class="choices">${w.spheres.map((x) =>
        `<button class="choice" data-act="wiz-sphere" data-v="${x.id}" aria-pressed="${st.sphere === x.id}"><span class="ico" aria-hidden="true">${x.icon}</span><span><b>${esc(L(x, 'title'))}</b></span></button>`).join('')}</div>
        <div class="row" style="margin-top:12px"><button class="btn ghost sm" data-act="wiz-back">${T('← Назад')}</button>
        <button class="btn primary" data-act="wiz-go" ${st.sphere ? '' : 'disabled'}>${T('Зібрати набір')}</button></div>`;
    }
    return dots + body;
  }

  function presetCard(p) {
    const items = p.items.filter((i) => svc(i.id));
    const opts = { plan: p.plan, seats: p.seats || 3, useYearly: true };
    const t = setTotals(items, S.byId, opts);
    return `<article class="card preset"><div class="row between"><h3 style="margin:0">${esc(L(p, 'name'))}</h3><span class="tag">${planLabel(p.plan)}${p.plan === 'team' ? ', ' + T('{n} ос.', { n: p.seats || 3 }) : ''}</span></div>
      <p class="muted small" style="margin:0">${esc(L(p, 'tagline'))}</p>
      <div><span class="price num">${money(t.monthly)}</span> <span class="muted">${T('/міс')}</span><div class="muted small num">${T('{y} на рік · {n} {w}', { y: money(t.yearly), n: t.count, w: serviceWord(t.count) })}</div></div>
      <button class="btn primary" data-act="apply-preset" data-v="${p.id}">${T('Взяти цей набір')}</button></article>`;
  }

  /* =====================================================================
     КАТАЛОГ
     ===================================================================== */
  function maxSlider() {
    const opts = { plan: S.set.plan, seats: 1, useYearly: false };
    const m = Math.max(...S.data.services.map((s) => priceFor(s, opts).monthly), 10);
    return Math.ceil(m / 5) * 5;
  }

  function pageCatalog() {
    const f = S.filters;
    const max = maxSlider();
    return `
    <div class="page-title"><p class="eyebrow">${T('Каталог')}</p><h1>${T('Усі підписки')}</h1></div>
    <div class="catalog">
      <aside class="filters card" aria-label="${T('Фільтри')}">
        <div class="field"><label for="f-q">${T('Пошук')}</label><input id="f-q" type="search" data-bind="f-q" value="${esc(f.q)}" placeholder="${T('Назва або опис')}"></div>
        <div class="field"><label>${T('План')}</label>${planSwitch()}</div>
        <div class="field"><label>${T('Категорія')}</label><div class="chips">
          <button class="chip" data-act="f-cat" data-v="all" aria-pressed="${f.cat === 'all'}">${T('Усі')}</button>
          ${S.data.categories.map((c) => `<button class="chip" data-act="f-cat" data-v="${c.id}" aria-pressed="${f.cat === c.id}">${esc(L(c, 'name'))}</button>`).join('')}</div></div>
        <div class="field"><label for="f-max">${T('Ціна до:')} <span id="f-max-v" class="num">${f.max == null ? T('без обмеження') : money(f.max)}</span></label>
          <input id="f-max" type="range" min="0" max="${max}" step="1" value="${f.max == null ? max : Math.min(f.max, max)}" data-bind="f-max"></div>
        <label class="check"><input type="checkbox" data-bind="f-free" ${f.free ? 'checked' : ''}> ${T('Є безкоштовний план')}</label>
        <label class="check" style="margin-top:8px"><input type="checkbox" data-bind="f-student" ${f.student ? 'checked' : ''}> ${T('Є студентська знижка')}</label>
        <label class="check" style="margin:8px 0 12px"><input type="checkbox" data-bind="f-team" ${f.team ? 'checked' : ''}> ${T('Є командний план')}</label>
        <div class="field"><label for="f-sort">${T('Сортування')}</label><select id="f-sort" data-bind="f-sort">
          ${[['name', T('За назвою')], ['price-asc', T('Спочатку дешевші')], ['price-desc', T('Спочатку дорожчі')], ['discount', T('Більша студентська знижка')]].map(([v, l]) => `<option value="${v}" ${f.sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <button class="btn ghost sm" data-act="f-reset">${T('Скинути фільтри')}</button>
      </aside>
      <section id="results">${resultsHtml()}</section>
    </div>`;
  }

  function filteredServices() {
    const f = S.filters;
    const opts = { plan: S.set.plan, seats: 1, useYearly: false };
    const q = f.q.trim().toLowerCase();
    const list = S.data.services.filter((s) => {
      if (f.cat !== 'all' && s.category !== f.cat) return false;
      if (q && !(s.name + ' ' + L(s, 'desc')).toLowerCase().includes(q)) return false;
      if (f.free && !s.free) return false;
      if (f.student && !(s.studentDiscount > 0)) return false;
      if (f.team && !(s.team && s.team.price != null)) return false;
      if (f.max != null && priceFor(s, opts).monthly > f.max) return false;
      return true;
    });
    const pm = (s) => priceFor(s, opts).monthly;
    const sorters = {
      name: (a, b) => a.name.localeCompare(b.name, I18n.lang()),
      'price-asc': (a, b) => pm(a) - pm(b),
      'price-desc': (a, b) => pm(b) - pm(a),
      discount: (a, b) => (b.studentDiscount || 0) - (a.studentDiscount || 0),
    };
    return list.sort(sorters[f.sort] || sorters.name);
  }

  function resultsHtml() {
    const list = filteredServices();
    const head = `<p class="muted" style="margin-top:0" role="status" aria-live="polite">${T('Знайдено: {n} з {total}', { n: '<b>' + list.length + '</b>', total: S.data.services.length })}</p>`;
    if (!list.length) return head + `<div class="card empty"><div class="big">🐾</div><h3>${T('Нічого не знайшлося')}</h3><p>${T('Спробуйте послабити фільтри.')}</p><button class="btn" data-act="f-reset">${T('Скинути фільтри')}</button></div>`;
    return head + `<div class="grid auto">${list.map(svcCard).join('')}</div>`;
  }

  function svcCard(s) {
    const added = inSet(s.id);
    const cmp = S.compare.includes(s.id);
    return `<article class="card svc">
      <div class="head">${mono(s)}<div><h3><a href="#/service/${encodeURIComponent(s.id)}">${esc(s.name)}</a></h3><span class="muted small">${esc(catName(s.category))}</span></div></div>
      <div class="badges">${badgesOf(s)}</div>
      <p>${esc(L(s, 'desc'))}</p>
      <div class="price num">${priceInline(s, S.set.plan, 1)} <small>${planUnit()}</small></div>
      <div class="actions">
        <button class="btn sm ${added ? 'on' : 'primary'}" data-act="toggle-set" data-v="${s.id}" aria-pressed="${added}">${added ? T('✓ У наборі') : T('+ До набору')}</button>
        <button class="btn sm ghost ${cmp ? 'on' : ''}" data-act="toggle-cmp" data-v="${s.id}" aria-pressed="${cmp}">${cmp ? T('✓ Порівнюю') : T('Порівняти')}</button>
      </div></article>`;
  }

  /* =====================================================================
     КАРТКА ПІДПИСКИ
     ===================================================================== */
  const SOURCES = {
    official: ['good', 'Звірено з офіційною сторінкою'],
    partial: ['', 'Частково звірено з офіційною сторінкою'],
    unverified: ['warn', 'За сторонніми джерелами, звірте на сайті'],
    manual: ['', 'Введено адміністратором'],
  };
  function sourceBlock(s) {
    const [cls, label] = SOURCES[s.priceSource] || SOURCES.unverified;
    const note = L(s, 'priceNote');
    return `<div class="stack"><p style="margin:0"><span class="tag ${cls}">${T(label)}</span> <span class="muted small">${fmtDate(s.priceDate)}</span></p>
      ${note ? `<p class="muted small" style="margin:0">${esc(note)}</p>` : ''}
      <p class="muted small" style="margin:0">${T('Ціни в доларах США, без податків. Актуальні умови — на офіційному сайті.')}</p></div>`;
  }

  function pageService(id) {
    const s = svc(id);
    if (!s) return `<div class="card empty"><div class="big">🐾</div><h1>${T('Підписку не знайдено')}</h1><p><a href="#/catalog">${T('Повернутися до каталогу')}</a></p></div>`;
    const ind = priceFor(s, { plan: 'individual', useYearly: true });
    const stu = priceFor(s, { plan: 'student', useYearly: true });
    const tm = priceFor(s, { plan: 'team', seats: 1, useYearly: true });
    const added = inSet(s.id);
    const cmp = S.compare.includes(s.id);
    const same = S.data.services.filter((x) => x.category === s.category && x.id !== s.id);
    const hasTeam = s.team && s.team.price != null;
    return `
    <p><a href="#/catalog">${T('← До каталогу')}</a></p>
    <div class="card stack">
      <div class="row">${mono(s, 'lg')}<div><h1 style="margin:0">${esc(s.name)}</h1><span class="muted">${esc(catName(s.category))}</span></div></div>
      <div class="badges">${badgesOf(s)}</div>
      <p>${esc(L(s, 'desc'))}</p>
      <div class="table-wrap"><table class="price-table">
        <thead><tr><th>${T('План')}</th><th>${T('На місяць')}</th><th>${T('На рік')}</th><th>${T('Примітка')}</th></tr></thead>
        <tbody>
          ${s.free ? `<tr><td>${T('Безкоштовний')}</td><td class="num">${money(0)}</td><td class="num">${money(0)}</td><td>${esc(L(s, 'freeNote') || '')}</td></tr>` : ''}
          <tr><td>${planLabel('individual')}</td><td class="num">${money(ind.monthly)}</td><td class="num">${money(ind.yearly)}</td><td>${ind.annualTariff ? T('річний тариф дешевший на {x}', { x: money(ind.saveByAnnual) }) : T('річного тарифу немає — 12 × місяць')}</td></tr>
          <tr><td>${planLabel('student')}</td><td class="num">${money(stu.monthly)}</td><td class="num">${money(stu.yearly)}</td><td>${stu.discount ? T('знижка {n}% (потрібне підтвердження статусу)', { n: stu.discount }) : T('студентської знижки немає')}</td></tr>
          <tr><td>${planLabel('team')}</td><td class="num">${hasTeam ? money(tm.monthly) : '—'}</td><td class="num">${hasTeam ? money(tm.yearly) : '—'}</td><td>${hasTeam ? T('ціна за одну людину') : T('командного плану немає')}</td></tr>
        </tbody></table></div>
      ${sourceBlock(s)}
      <div class="row">
        <button class="btn primary" data-act="toggle-set" data-v="${s.id}">${added ? T('Прибрати з набору') : T('+ До набору')}</button>
        <button class="btn ghost" data-act="toggle-cmp" data-v="${s.id}">${cmp ? T('Прибрати з порівняння') : T('Порівняти')}</button>
        <a class="btn ghost" href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener noreferrer">${T('Сайт сервісу ↗')}</a>
      </div>
    </div>
    ${same.length ? `<section class="section"><h2>${T('Схожі в категорії «{c}»', { c: esc(catName(s.category)) })}</h2><div class="grid auto">${same.map(svcCard).join('')}</div></section>` : ''}`;
  }

  /* =====================================================================
     КОНСТРУКТОР
     ===================================================================== */
  function pageBuilder() {
    return `
    <div class="page-title"><p class="eyebrow">${T('Конструктор')}</p><h1>${T('Ваш набір')}</h1></div>
    <div class="builder">
      <div class="stack">
        <section class="card" aria-labelledby="h-set"><div class="row between"><h2 id="h-set" style="margin:0">${T('Мій набір')}</h2>
          <button class="btn ghost sm" data-act="clear-set" ${S.set.items.length ? '' : 'disabled'}>${T('Очистити')}</button></div>
          <div id="setList">${setListHtml()}</div></section>
        <section class="card" aria-labelledby="h-add"><h2 id="h-add">${T('Додати сервіс')}</h2>
          <div class="row"><div style="flex:1;min-width:180px"><input id="ad-q" type="search" aria-label="${T('Пошук сервісу')}" placeholder="${T('Пошук сервісу')}" data-bind="ad-q" value="${esc(S.adder.q)}"></div></div>
          <div class="chips" style="margin-top:10px">
            <button class="chip" data-act="ad-cat" data-v="all" aria-pressed="${S.adder.cat === 'all'}">${T('Усі')}</button>
            ${S.data.categories.map((c) => `<button class="chip" data-act="ad-cat" data-v="${c.id}" aria-pressed="${S.adder.cat === c.id}">${esc(L(c, 'name'))}</button>`).join('')}</div>
          <div class="adder-list" id="adderList">${adderHtml()}</div></section>
      </div>
      <aside class="card calc" id="calcPanel" aria-label="${T('Калькулятор')}">${calcHtml()}</aside>
    </div>`;
  }

  function setListHtml() {
    const t = totals();
    if (!S.set.items.length) {
      return `<div class="empty"><div class="big">🐕</div><h3>${T('Набір порожній')}</h3><p>${T('Дайте відповіді на питання майстра або додайте сервіси вручну.')}</p>
        <div class="row" style="justify-content:center"><a class="btn primary" href="#/">${T('Зібрати за питаннями')}</a><a class="btn ghost" href="#/catalog">${T('Відкрити каталог')}</a></div></div>`;
    }
    const dupGroups = new Set(duplicates(S.set.items, S.byId).map((d) => d.group));
    return t.rows.map((r) => itemRow(r, dupGroups)).join('');
  }

  const groupName = (g) => {
    const dict = I18n.lang() === 'en' ? (S.data.groups_en || {}) : {};
    return dict[g] || (S.data.groups && S.data.groups[g]) || catName(g);
  };

  function itemRow(r, dupGroups) {
    const s = r.service, p = r.price, free = r.item.free;
    const teamMode = S.set.plan === 'team' && !free;
    const tags = [];
    if (dupGroups.has(Calc.groupOf(s))) tags.push(`<span class="tag warn" title="${esc(T('У наборі кілька сервісів з однаковою роллю («{g}»). Це лише підказка: переконайтеся, що вони вам обидва потрібні.', { g: groupName(Calc.groupOf(s)) }))}">${T('⚠ дублюється')}</span>`);
    if (!free) {
      if (p.discount) tags.push(`<span class="tag good">${T('−{n}% студентська знижка', { n: p.discount })}</span>`);
      if (p.noStudent) tags.push(`<span class="tag">${T('без студентської знижки')}</span>`);
      if (p.noTeam) tags.push(`<span class="tag">${T('командного плану немає, окремі акаунти')}</span>`);
      if (p.minApplied) tags.push(`<span class="tag">${T('мінімум {n} місць', { n: p.minApplied })}</span>`);
      if (p.seats > 1 && !teamMode) tags.push(`<span class="tag">${T('{n} ос.', { n: p.seats })}</span>`);
      if (p.annualTariff) tags.push(`<span class="tag good">${T('річний тариф −{x}', { x: money(p.saveByAnnual) })}</span>`);
    } else {
      tags.push(`<span class="tag good" title="${esc(L(s, 'freeNote') || '')}">${T('безкоштовний план')}</span>`);
    }
    return `<div class="item">
      ${mono(s)}
      <div><div class="nm"><a href="#/service/${encodeURIComponent(s.id)}" style="color:inherit">${esc(s.name)}</a> <span class="muted small">${esc(catName(s.category))}</span></div>
        <div class="meta">${tags.join('')}</div>
        <div class="ctrl">${teamMode ? `<span class="lic" role="group" aria-label="${esc(T('Ліцензій для {name}', { name: s.name }))}"><button class="btn sm" data-act="qty-dec" data-v="${s.id}" aria-label="${T('Менше ліцензій')}">−</button><span class="lic-n num" aria-live="polite">${p.seats}</span><button class="btn sm" data-act="qty-inc" data-v="${s.id}" aria-label="${T('Більше ліцензій')}">+</button><span class="muted small">${T('ліцензій')}</span></span>` : ''}
        ${s.free ? `<label class="check small"><input type="checkbox" data-act-change="free" data-v="${s.id}" ${free ? 'checked' : ''}> ${T('Безкоштовний план')}</label>` : ''}
        <button class="btn sm danger" data-act="remove" data-v="${s.id}" aria-label="${esc(T('Прибрати {name} з набору', { name: s.name }))}">${T('Прибрати')}</button></div></div>
      <div class="cost num">${money(p.monthly)}<small>${T('/міс')} · ${money(p.yearly)}${T('/рік')}</small></div></div>`;
  }

  function calcHtml() {
    const t = totals();
    const dups = duplicates(S.set.items, S.byId);
    const ind = totals({ plan: 'individual', seats: 1, useYearly: S.set.yearly });
    const discSaved = S.set.plan === 'student' ? r2(ind.monthly - t.monthly) : 0;
    const team = S.set.plan === 'team';
    return `
      <h2>${T('Калькулятор')}</h2>
      <div class="field"><label>${T('План')}</label>${planSwitch()}</div>
      <label class="check" style="margin-bottom:16px"><input type="checkbox" data-act-change="student" ${S.set.plan === 'student' ? 'checked' : ''}> ${T('Студентська знижка')}</label>
      ${team ? `<div class="field"><label for="seats">${T('Кількість людей у команді')}</label><div class="stepper">
        <button class="btn sm" data-act="seats-dec" aria-label="${T('Менше людей')}">−</button>
        <input id="seats" type="number" min="1" max="500" value="${S.set.seats}" data-act-change="seats">
        <button class="btn sm" data-act="seats-inc" aria-label="${T('Більше людей')}">+</button></div>
        <div class="seat-presets" role="group" aria-label="${T('Швидкий вибір кількості людей')}">${[3, 5, 10, 25, 50].map((n) => `<button class="chip" data-act="seats-set" data-v="${n}" aria-pressed="${S.set.seats === n}">${n}</button>`).join('')}</div>
        <span class="hint">${T('Сервіси без командного плану рахуються як 1 акаунт.')}</span></div>` : ''}
      <label class="check" style="margin-bottom:16px"><input type="checkbox" data-act-change="yearly" ${S.set.yearly ? 'checked' : ''}> ${T('Річні тарифи (де вони є)')}</label>
      <div class="total"><span>${T('На місяць')}</span><span class="v num" id="tot-m">${money(t.monthly)}</span></div>
      <div class="total year"><span>${T('На рік')}</span><span class="v num" id="tot-y">${money(t.yearly)}</span></div>
      ${team && t.count ? `<p class="small num" style="margin:0 0 8px">${T('На одну людину: {x} на місяць', { x: '<b>' + money(r2(t.monthly / S.set.seats)) + '</b>' })}</p>` : ''}
      <p class="muted small num">${T('{n} {w} у наборі', { n: t.count, w: serviceWord(t.count) })}</p>
      ${discSaved > 0 ? `<p class="notice good">${T('Студентська знижка економить {x} на місяць.', { x: money(discSaved) })}</p>` : ''}
      ${t.saveByAnnual > 0 ? `<p class="notice good">${T('Річні тарифи економлять {x} на рік.', { x: money(t.saveByAnnual) })}</p>` : ''}
      ${dups.length ? `<p class="notice">${T('⚠ Дублюється:')} ${dups.map((d) => `${esc(groupName(d.group))} (${d.ids.map((i) => esc(svc(i).name)).join(', ')})`).join('; ')}</p>` : ''}
      <div class="stack" style="margin-top:12px">
        <button class="btn primary" style="width:100%" data-act="save-set" ${t.count ? '' : 'disabled'}>${S.user ? T('Зберегти набір в акаунті') : T('Увійти й зберегти набір')}</button>
        <p class="muted small" style="margin:0">${T('Поточний набір автоматично зберігається в цьому браузері.')}</p>
      </div>`;
  }

  function adderHtml() {
    const q = S.adder.q.trim().toLowerCase();
    const list = S.data.services.filter((s) => !inSet(s.id) && (S.adder.cat === 'all' || s.category === S.adder.cat) && (!q || s.name.toLowerCase().includes(q)));
    if (!list.length) return `<p class="muted">${T('Нічого додавати — або все вже в наборі, або пошук нічого не знайшов.')}</p>`;
    return list.map((s) => `<button class="adder" data-act="toggle-set" data-v="${s.id}">${mono(s, 'sm')}<span><b>${esc(s.name)}</b><small class="num">${priceInline(s, S.set.plan, 1)}${S.set.plan === 'team' ? ' ' + T('/ особа') : ''}</small></span><span class="plus" aria-hidden="true">+</span></button>`).join('');
  }

  function refreshBuilder() {
    const set = $('#setList'), calc = $('#calcPanel'), add = $('#adderList');
    if (!set) return render();
    const focusSel = focusSelector();
    set.innerHTML = setListHtml();
    calc.innerHTML = calcHtml();
    add.innerHTML = adderHtml();
    const clr = $('[data-act="clear-set"]');
    if (clr) clr.disabled = !S.set.items.length;
    restoreFocus(focusSel);
  }

  /* =====================================================================
     ПОРІВНЯННЯ
     ===================================================================== */
  function pageCompare() {
    const [a, b] = [svc(S.compare[0]), svc(S.compare[1])];
    const options = (sel) => `<option value="">${T('— оберіть сервіс —')}</option>` + S.data.services.slice().sort((x, y) => x.name.localeCompare(y.name, I18n.lang())).map((s) => `<option value="${s.id}" ${sel === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
    const head = `<div class="page-title"><p class="eyebrow">${T('Порівняння')}</p><h1>${T('Порівняйте дві підписки')}</h1></div>
      <div class="card"><div class="form-grid">
        <div class="field"><label for="cmp0">${T('Перший сервіс')}</label><select id="cmp0" data-act-change="cmp-sel" data-v="0">${options(S.compare[0])}</select></div>
        <div class="field"><label for="cmp1">${T('Другий сервіс')}</label><select id="cmp1" data-act-change="cmp-sel" data-v="1">${options(S.compare[1])}</select></div></div>
        <p class="muted small" style="margin:0">${T('Підказка: у каталозі натисніть «Порівняти» на картках.')}</p></div>`;
    if (!a || !b) return head + `<div class="card empty" style="margin-top:16px"><div class="big">⚖️</div><h3>${T('Оберіть два сервіси')}</h3><p>${T("Тоді з'явиться таблиця з цінами й перевагами.")}</p></div>`;
    const P = (s, plan) => priceFor(s, { plan: plan, seats: 1, useYearly: true });
    const rows = [];
    const addRow = (label, va, vb, kind) => rows.push({ label, va, vb, kind });
    const hasTeam = (s) => s.team && s.team.price != null;
    const freeText = (s) => (s.free ? T('Так') + (L(s, 'freeNote') ? ' — ' + L(s, 'freeNote') : '') : T('Ні'));
    addRow(T('Категорія'), catName(a.category), catName(b.category));
    addRow(T('Безкоштовний план'), freeText(a), freeText(b));
    addRow(T('Індивідуальний, на місяць'), P(a, 'individual').monthly, P(b, 'individual').monthly, 'min');
    addRow(T('Індивідуальний, на рік'), P(a, 'individual').yearly, P(b, 'individual').yearly, 'min');
    addRow(T('Студентський, на місяць'), P(a, 'student').monthly, P(b, 'student').monthly, 'min');
    addRow(T('Студентська знижка'), a.studentDiscount > 0 ? a.studentDiscount + '%' : T('немає'), b.studentDiscount > 0 ? b.studentDiscount + '%' : T('немає'), 'max%');
    addRow(T('Командний, за людину / міс'), hasTeam(a) ? P(a, 'team').monthly : null, hasTeam(b) ? P(b, 'team').monthly : null, 'min');
    addRow(T('Економія з річним тарифом'), P(a, 'individual').saveByAnnual, P(b, 'individual').saveByAnnual, 'max');
    const fmtRow = (r, v) => (typeof v === 'number' ? (r.kind === 'max%' ? v + '%' : money(v)) : v == null ? `<span class="muted">${T('немає плану')}</span>` : esc(v));
    const body = rows.map((r) => {
      let ca = '', cb = '';
      if (r.kind && typeof r.va === 'number' && typeof r.vb === 'number' && r.va !== r.vb) {
        const aWins = r.kind === 'min' ? r.va < r.vb : r.va > r.vb;
        if (aWins) ca = 'best'; else cb = 'best';
      } else if (r.kind === 'min' && typeof r.va === 'number' && r.vb == null) ca = 'best';
      else if (r.kind === 'min' && typeof r.vb === 'number' && r.va == null) cb = 'best';
      if (r.kind === 'max%') {
        const na = a.studentDiscount || 0, nb = b.studentDiscount || 0;
        if (na !== nb) { if (na > nb) ca = 'best'; else cb = 'best'; }
      }
      return `<tr><th scope="row">${r.label}</th><td class="${ca} num">${fmtRow(r, r.va)}</td><td class="${cb} num">${fmtRow(r, r.vb)}</td></tr>`;
    }).join('');
    const ya = P(a, S.set.plan).yearly, yb = P(b, S.set.plan).yearly;
    const verdict = ya === yb ? T('За поточним планом на рік вони коштують однаково.') :
      T('За планом «{plan}» на рік дешевше {name} — на {diff}.', { plan: planLabel(S.set.plan), name: '<b>' + esc((ya < yb ? a : b).name) + '</b>', diff: money(Math.abs(ya - yb)) });
    return head + `<div class="card table-wrap" style="margin-top:16px"><table class="cmp">
      <thead><tr><th></th><th scope="col"><div class="row">${mono(a, 'sm')}<a href="#/service/${a.id}">${esc(a.name)}</a></div></th><th scope="col"><div class="row">${mono(b, 'sm')}<a href="#/service/${b.id}">${esc(b.name)}</a></div></th></tr></thead>
      <tbody>${body}
      <tr><th scope="row">${T('Дії')}</th>${[a, b].map((s) => `<td><div class="row"><button class="btn sm ${inSet(s.id) ? 'on' : 'primary'}" data-act="toggle-set" data-v="${s.id}">${inSet(s.id) ? T('✓ У наборі') : T('+ До набору')}</button><a class="btn sm ghost" href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener noreferrer">${T('Сайт ↗')}</a></div></td>`).join('')}</tr>
      </tbody></table>
      <p class="notice good" style="margin-top:16px">${verdict}</p>
      <p class="muted small" style="margin:8px 0 0">${T('Зелений колір — вигідніше значення в рядку. «Річний» враховує річний тариф, якщо він є.')}</p></div>`;
  }

  /* =====================================================================
     АКАУНТ
     ===================================================================== */
  function pageAccount() {
    if (!S.user) {
      const reg = S.accTab === 'register';
      const adminHint = Api.mode() === 'server'
        ? T('Акаунти й набори зберігаються на сервері.') + (isLocalHost() ? ' ' + T('Адмін: {mail}, пароль із запуску сервера (за замовчуванням {pw}).', { mail: '<span class="kbd">admin@subdog.local</span>', pw: '<span class="kbd">admin123</span>' }) : '')
        : T('Сервер не підключено: дані лежать лише в цьому браузері.') + (isLocalHost() ? ' ' + T('Тестовий адмін: {mail} / {pw}', { mail: '<span class="kbd">admin@subdog.local</span>', pw: '<span class="kbd">admin123</span>' }) : '');
      return `<div class="page-title"><p class="eyebrow">${T('Акаунт')}</p><h1>${T('Вхід')}</h1></div>
      <div class="card" style="max-width:460px">
        <div class="tabs"><button class="chip" data-act="acc-tab" data-v="login" aria-pressed="${!reg}">${T('Вхід')}</button><button class="chip" data-act="acc-tab" data-v="register" aria-pressed="${reg}">${T('Реєстрація')}</button></div>
        <form data-form="${reg ? 'register' : 'login'}" novalidate>
          ${reg ? `<div class="field"><label for="a-name">${T("Ім'я")}</label><input id="a-name" name="name" type="text" autocomplete="name" required></div>` : ''}
          <div class="field"><label for="a-email">${T('Пошта')}</label><input id="a-email" name="email" type="email" autocomplete="email" required></div>
          <div class="field"><label for="a-pass">${T('Пароль')}</label><input id="a-pass" name="password" type="password" autocomplete="${reg ? 'new-password' : 'current-password'}" required><span class="hint">${reg ? T('Щонайменше 6 символів') : ''}</span></div>
          <p class="form-error" role="alert" hidden></p>
          <button class="btn primary" style="width:100%">${reg ? T('Створити акаунт') : T('Увійти')}</button>
        </form>
        <p class="muted small" style="margin:14px 0 0">${adminHint}</p>
      </div>`;
    }
    return `<div class="page-title"><p class="eyebrow">${T('Акаунт')}</p><div class="row between"><h1>${T('Мої набори')}</h1><div class="row"><span class="muted">${esc(S.user.name)} · ${esc(S.user.email)}${isAdmin() ? ' · ' + T('адмін') : ''}</span><button class="btn ghost sm" data-act="logout">${T('Вийти')}</button></div></div>
      <div id="savedSets" style="margin-top:20px"><p class="muted">${T('Завантаження…')}</p></div>`;
  }

  async function fillSaved() {
    const box = $('#savedSets');
    if (!box) return;
    const sets = await Api.listSets();
    if (!box.isConnected) return;
    if (!sets.length) { box.innerHTML = `<div class="card empty"><div class="big">📂</div><h3>${T('Збережених наборів ще немає')}</h3><p>${T('Зберіть набір у конструкторі й натисніть «Зберегти набір в акаунті».')}</p><a class="btn primary" href="#/builder">${T('До конструктора')}</a></div>`; return; }
    box.innerHTML = `<div class="grid auto">${sets.map((r) => {
      const st = sanitizeSet(r.state);
      const t = setTotals(st.items, S.byId, { plan: st.plan, seats: st.seats, useYearly: st.yearly });
      return `<article class="card preset"><div class="row between"><h3 style="margin:0">${esc(r.name)}</h3><span class="tag">${planLabel(st.plan)}</span></div>
        <div><span class="price num">${money(t.monthly)}</span> <span class="muted">${T('/міс')}</span><div class="muted small num">${T('{y} на рік · {n} {w}', { y: money(t.yearly), n: t.count, w: serviceWord(t.count) })}</div></div>
        <div class="muted small">${T('Збережено {d}', { d: new Date(r.createdAt).toLocaleDateString(I18n.locale()) })}</div>
        <div class="row"><button class="btn primary sm" data-act="load-saved" data-v="${r.id}">${T('Відкрити')}</button><button class="btn danger sm" data-act="del-saved" data-v="${r.id}">${T('Видалити')}</button></div></article>`;
    }).join('')}</div>`;
  }

  /* =====================================================================
     АДМІН-ПАНЕЛЬ
     ===================================================================== */
  function pageAdmin() {
    if (!isAdmin()) return `<div class="card empty"><div class="big">🔒</div><h1>${T('Тільки для адміністратора')}</h1><p>${T('Увійдіть як адміністратор, щоб керувати каталогом.')}</p><a class="btn primary" href="#/account">${T('Увійти')}</a></div>`;
    const list = S.data.services.slice().sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name, I18n.lang()));
    return `<div class="page-title"><p class="eyebrow">${T('Адміністратор')}</p><h1>${T('Каталог')}</h1></div><div class="row between">
      <div class="row"><button class="btn primary" data-act="admin-add">${T('+ Додати сервіс')}</button><button class="btn ghost" data-act="admin-export">${T('Експорт JSON')}</button><button class="btn ghost" data-act="admin-reset" ${S.data.customized ? '' : 'disabled'}>${T('Скинути до початкового')}</button></div></div>
      <p class="muted">${T('Каталог: {n} сервісів.', { n: '<b>' + list.length + '</b>' })} ${S.data.customized ? T('Показано змінену версію (зберігається в цьому браузері).') : T('Показано початкову версію з catalog.json.')}</p>
      <div class="card table-wrap"><table><thead><tr><th>${T('Сервіс')}</th><th>${T('Категорія')}</th><th>${T('Ціна/міс')}</th><th>${T('Річний')}</th><th>${T('Студ.')}</th><th>${T('Команда')}</th><th>Free</th><th>${T('Ціни від')}</th><th></th></tr></thead><tbody>
      ${list.map((s) => `<tr><td><b>${esc(s.name)}</b></td><td>${esc(catName(s.category))}</td><td class="num">${money(s.price)}</td><td class="num">${s.yearlyPrice != null ? money(s.yearlyPrice) : '—'}</td><td>${s.studentDiscount ? s.studentDiscount + '%' : '—'}</td><td class="num">${s.team && s.team.price != null ? money(s.team.price) : '—'}</td><td>${s.free ? T('так') : '—'}</td><td>${fmtDate(s.priceDate)}</td>
      <td><div class="row" style="flex-wrap:nowrap"><button class="btn sm" data-act="admin-edit" data-v="${s.id}">${T('Змінити')}</button><button class="btn sm danger" data-act="admin-del" data-v="${s.id}" aria-label="${esc(T('Видалити {name}', { name: s.name }))}">${T('Видалити')}</button></div></td></tr>`).join('')}
      </tbody></table></div>`;
  }

  function serviceForm(s) {
    const v = s || { name: '', category: S.data.categories[0].id, desc: '', url: 'https://', price: '', yearlyPrice: '', studentDiscount: 0, free: false, freeNote: '', team: null };
    const tp = v.team && v.team.price != null ? v.team.price : '';
    const ty = v.team && v.team.yearlyPrice != null ? v.team.yearlyPrice : '';
    return `
      <div class="field"><label for="s-name">${T('Назва')}</label><input id="s-name" name="name" type="text" value="${esc(v.name)}"></div>
      <div class="form-grid">
        <div class="field"><label for="s-cat">${T('Категорія')}</label><select id="s-cat" name="category">${S.data.categories.map((c) => `<option value="${c.id}" ${v.category === c.id ? 'selected' : ''}>${esc(L(c, 'name'))}</option>`).join('')}</select></div>
        <div class="field"><label for="s-url">${T('Посилання')}</label><input id="s-url" name="url" type="url" value="${esc(v.url)}"></div></div>
      <div class="field"><label for="s-desc">${T('Опис')}</label><textarea id="s-desc" name="desc">${esc(v.desc)}</textarea></div>
      <div class="field"><label for="s-desc-en">${T('Опис (англійською)')}</label><textarea id="s-desc-en" name="desc_en">${esc(v.desc_en || '')}</textarea><span class="hint">${T('Порожньо — буде показано український опис')}</span></div>
      <div class="form-grid">
        <div class="field"><label for="s-price">${T('Ціна, $/міс')}</label><input id="s-price" name="price" type="number" min="0" step="any" value="${esc(v.price)}"></div>
        <div class="field"><label for="s-year">${T('Річний тариф, $/рік')}</label><input id="s-year" name="yearlyPrice" type="number" min="0" step="any" value="${esc(v.yearlyPrice == null ? '' : v.yearlyPrice)}"><span class="hint">${T('Порожньо — немає')}</span></div>
        <div class="field"><label for="s-disc">${T('Студентська знижка, %')}</label><input id="s-disc" name="studentDiscount" type="number" min="0" max="100" step="any" value="${esc(v.studentDiscount || 0)}"></div>
        <div class="field"><label for="s-team">${T('Командний, $/міс за людину')}</label><input id="s-team" name="teamPrice" type="number" min="0" step="any" value="${esc(tp)}"><span class="hint">${T('Порожньо — немає командного плану')}</span></div>
        <div class="field"><label for="s-teamy">${T('Командний, $/рік за людину')}</label><input id="s-teamy" name="teamYearly" type="number" min="0" step="any" value="${esc(ty)}"></div></div>
      <div class="form-grid">
        <div class="field"><label for="s-min">${T('Мінімум місць у командному плані')}</label><input id="s-min" name="minSeats" type="number" min="1" step="1" value="${esc(v.team && v.team.minSeats ? v.team.minSeats : '')}"><span class="hint">${T('Порожньо — без мінімуму')}</span></div>
        <div class="field"><label for="s-group">${T('Група для підказки «дублюється»')}</label><select id="s-group" name="group"><option value="">${T('За категорією')}</option>${Object.keys(S.data.groups || {}).map((g) => `<option value="${esc(g)}" ${v.group === g ? 'selected' : ''}>${esc(groupName(g))}</option>`).join('')}</select></div></div>
      <label class="check"><input type="checkbox" name="free" ${v.free ? 'checked' : ''}> ${T('Є безкоштовний план')}</label>
      <div class="field" style="margin-top:8px"><label for="s-fn">${T('Що входить у безкоштовний план')}</label><input id="s-fn" name="freeNote" type="text" value="${esc(v.freeNote || '')}"></div>
      <div class="field"><label for="s-src">${T('Джерело ціни')}</label><select id="s-src" name="priceSource">${Object.keys(SOURCES).map((k) => `<option value="${k}" ${(v.priceSource || 'manual') === k ? 'selected' : ''}>${esc(T(SOURCES[k][1]))}</option>`).join('')}</select></div>
      <div class="field"><label for="s-note">${T('Примітка до ціни')}</label><textarea id="s-note" name="priceNote">${esc(v.priceNote || '')}</textarea><span class="hint">${T('Що саме перевірено: умови, акції, обмеження')}</span></div>
      <div class="field"><label for="s-note-en">${T('Примітка до ціни (англійською)')}</label><textarea id="s-note-en" name="priceNote_en">${esc(v.priceNote_en || '')}</textarea></div>`;
  }

  function validateService(fd) {
    if (!String(fd.name || '').trim()) return T('Вкажіть назву.');
    if (!/^https?:\/\//i.test(fd.url || '')) return T('Посилання має починатися з http:// або https://');
    if (fd.price === '' || !(Number(fd.price) >= 0)) return T('Вкажіть ціну (число від 0).');
    const d = Number(fd.studentDiscount || 0);
    if (!(d >= 0 && d <= 100)) return T('Знижка має бути від 0 до 100%.');
    if (fd.yearlyPrice !== '' && !(Number(fd.yearlyPrice) >= 0)) return T('Річний тариф має бути числом від 0.');
    if (fd.teamPrice !== '' && !(Number(fd.teamPrice) >= 0)) return T('Командна ціна має бути числом від 0.');
    if (fd.minSeats !== '' && !(Number(fd.minSeats) >= 1)) return T('Мінімум місць має бути числом від 1.');
    if (fd.yearlyPrice !== '' && Number(fd.yearlyPrice) > Number(fd.price) * 12 + 0.005) return T('Річний тариф не може бути дорожчим за 12 місяців.');
    return '';
  }

  function slug(name) {
    const map = { а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ie', ж: 'zh', з: 'z', и: 'y', і: 'i', ї: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ь: '', ю: 'iu', я: 'ia' };
    const s = name.toLowerCase().split('').map((c) => (map[c] !== undefined ? map[c] : c)).join('').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return s || 'svc';
  }

  function formToService(fd, old) {
    const n = (x) => (x === '' || x == null ? null : Number(x));
    let id = old ? old.id : slug(fd.name);
    if (!old) { let base = id, i = 2; while (S.byId[id]) id = base + '-' + i++; }
    const svcOut = {
      id: id, name: fd.name.trim(), category: fd.category, desc: (fd.desc || '').trim(), url: fd.url.trim(),
      price: Number(fd.price), yearlyPrice: n(fd.yearlyPrice), studentDiscount: Number(fd.studentDiscount || 0),
      free: !!fd.free, freeNote: (fd.freeNote || '').trim(),
      team: fd.teamPrice === '' ? null : { price: Number(fd.teamPrice), yearlyPrice: n(fd.teamYearly) },
      priceDate: new Date().toISOString().slice(0, 10),
      priceSource: SOURCES[fd.priceSource] ? fd.priceSource : 'manual',
      priceNote: (fd.priceNote || '').trim(),
    };
    // англійські тексти: з форми, а те, чого в формі немає (freeNote_en), лишаємо як було
    if ((fd.desc_en || '').trim()) svcOut.desc_en = fd.desc_en.trim();
    if ((fd.priceNote_en || '').trim()) svcOut.priceNote_en = fd.priceNote_en.trim();
    if (old && old.freeNote_en && svcOut.freeNote === old.freeNote) svcOut.freeNote_en = old.freeNote_en;
    if (svcOut.team && fd.minSeats !== '') svcOut.team.minSeats = Math.floor(Number(fd.minSeats));
    if (fd.group) svcOut.group = fd.group;
    // Змінили ціни, але не торкнулись джерела — це вже не «звірено», а введено вручну
    const norm = (x) => (x === '' || x == null ? '' : String(Number(x)));
    if (old && fd.priceSource === old.priceSource && ['price', 'yearlyPrice', 'studentDiscount'].some((k) => norm(old[k]) !== norm(fd[k]))) {
      svcOut.priceSource = 'manual';
    }
    return svcOut;
  }

  /* Зміна каталогу адміном: помилки сервера (немає прав, сесія закінчилась) показуємо повідомленням */
  async function adminOp(fn, okMsg) {
    try { await fn(); await reloadCatalog(); render(); toast(okMsg); }
    catch (e) { toast(e.message || T('Не вдалося зберегти')); }
  }

  async function reloadCatalog() {
    S.data = await Api.getCatalog();
    indexCatalog();
    S.set = sanitizeSet(S.set);
    S.compare = S.compare.filter((id) => S.byId[id]).slice(0, 2);
    persist();
  }

  /* =====================================================================
     ДІЇ
     ===================================================================== */
  function toggleInSet(id) {
    if (inSet(id)) { S.set.items = S.set.items.filter((i) => i.id !== id); toast(T('Прибрано з набору')); }
    else { S.set.items.push({ id: id, free: false }); toast(T('Додано до набору')); }
    persist();
  }
  function rerenderLight() {
    const { name } = currentRoute();
    if (name === 'builder') refreshBuilder();
    else if (name === 'catalog') { const r = $('#results'); if (r) { const sel = focusSelector(); r.innerHTML = resultsHtml(); restoreFocus(sel); } }
    else render();
  }
  async function replaceSet(newSet, label) {
    if (S.set.items.length && !(await confirmDialog(T('Замінити поточний набір?'), T('У вас уже є набір із {n} {w}. Він буде замінений на «{label}».', { n: S.set.items.length, w: serviceWord(S.set.items.length), label: label }), T('Замінити')))) return false;
    S.set = sanitizeSet(newSet);
    persist();
    location.hash = '#/builder';
    toast(T('Набір «{label}» готовий', { label: label }));
    return true;
  }

  /* Загальна кількість людей у команді. Індивідуальні ліцензії сервісів із командним планом скидаємо,
     щоб вони йшли за загальною кількістю; для сервісів без командного плану вибір користувача лишається. */
  function setSeats(n) {
    S.set.seats = Math.min(500, Math.max(1, Math.floor(n) || 1));
    S.set.items.forEach((it) => { const s = svc(it.id); if (s && s.team && s.team.price != null) delete it.qty; });
    persist();
    refreshBuilder();
  }
  /* Ліцензії для окремого сервісу (±1 від того, що зараз показано) */
  function setQty(id, delta) {
    const row = totals().rows.find((r) => r.item.id === id);
    if (!row) return;
    row.item.qty = Math.min(500, Math.max(1, row.price.seats + delta));
    persist();
    refreshBuilder();
  }

  const clicks = {
    lang: () => { I18n.setLang(I18n.lang() === 'uk' ? 'en' : 'uk'); applyStatic(); render(); },
    'toggle-set': (el) => { toggleInSet(el.dataset.v); rerenderLight(); },
    remove: (el) => { S.set.items = S.set.items.filter((i) => i.id !== el.dataset.v); persist(); refreshBuilder(); },
    plan: (el) => { S.set.plan = el.dataset.v; persist(); const { name } = currentRoute(); if (name === 'catalog') render(); else rerenderLight(); },
    'clear-set': async () => { if (await confirmDialog(T('Очистити набір?'), T('Усі сервіси буде прибрано з набору.'), T('Очистити'), true)) { S.set.items = []; persist(); refreshBuilder(); } },
    'seats-inc': () => setSeats(S.set.seats + 1),
    'seats-set': (el) => setSeats(Number(el.dataset.v)),
    'seats-dec': () => setSeats(S.set.seats - 1),
    'qty-inc': (el) => setQty(el.dataset.v, +1),
    'qty-dec': (el) => setQty(el.dataset.v, -1),
    'toggle-cmp': (el) => {
      const id = el.dataset.v;
      if (S.compare.includes(id)) S.compare = S.compare.filter((x) => x !== id);
      else { S.compare.push(id); if (S.compare.length > 2) S.compare.shift(); if (S.compare.length === 2) toast(T('Готово — відкрийте «Порівняння»')); }
      persist();
      const { name } = currentRoute();
      if (name === 'service' || name === 'compare') render(); else rerenderLight();
    },
    'ad-cat': (el) => { S.adder.cat = el.dataset.v; render(); },
    'f-cat': (el) => { S.filters.cat = el.dataset.v; render(); },
    'goto-cat': (el) => { S.filters = { q: '', cat: el.dataset.v, max: null, free: false, student: false, team: false, sort: 'name' }; },
    'f-reset': () => { S.filters = { q: '', cat: 'all', max: null, free: false, student: false, team: false, sort: 'name' }; render(); },
    'wiz-mode': (el) => { S.wiz = { step: 2, mode: el.dataset.v, role: null, sphere: null }; $('#wizard').innerHTML = wizardHtml(); },
    'wiz-role': (el) => { S.wiz.role = el.dataset.v; S.wiz.step = 3; $('#wizard').innerHTML = wizardHtml(); },
    'wiz-sphere': (el) => { S.wiz.sphere = el.dataset.v; $('#wizard').innerHTML = wizardHtml(); },
    'wiz-back': () => { S.wiz.step = Math.max(1, S.wiz.step - 1); $('#wizard').innerHTML = wizardHtml(); },
    'wiz-go': () => {
      const rec = recommend(S.data.wizard, S.data.services, S.wiz);
      replaceSet({ items: rec.items, plan: rec.plan, seats: rec.seats, yearly: true }, T('За вашими відповідями'));
    },
    'apply-preset': (el) => {
      const p = S.data.presets.find((x) => x.id === el.dataset.v);
      replaceSet({ items: p.items.map((i) => ({ id: i.id, free: !!i.free })), plan: p.plan, seats: p.seats || 3, yearly: true }, L(p, 'name'));
    },
    'save-set': async () => {
      if (!S.user) { toast(T('Спочатку увійдіть в акаунт')); S.accTab = 'login'; location.hash = '#/account'; return; }
      const fd = await formDialog({ title: T('Зберегти набір'), ok: T('Зберегти'),
        body: `<div class="field"><label for="n-name">${T('Назва набору')}</label><input id="n-name" name="name" type="text" maxlength="60" value="${esc(T('Мій набір'))}"></div>`,
        validate: (d) => (String(d.name || '').trim() ? '' : T('Вкажіть назву набору.')) });
      if (!fd) return;
      try { await Api.saveUserSet(fd.name.trim(), S.set); toast(T('Набір збережено в акаунті')); } catch (e) { toast(e.message); }
    },
    'load-saved': async (el) => {
      const rec = (await Api.listSets()).find((r) => r.id === el.dataset.v);
      if (rec) await replaceSet(rec.state, rec.name);
    },
    'del-saved': async (el) => {
      if (!(await confirmDialog(T('Видалити набір?'), T('Цю дію не можна скасувати.'), T('Видалити'), true))) return;
      await Api.deleteUserSet(el.dataset.v); toast(T('Набір видалено')); fillSaved();
    },
    'acc-tab': (el) => { S.accTab = el.dataset.v; render(); },
    logout: async () => { await Api.logout(); S.user = null; toast(T('Ви вийшли з акаунта')); render(); },
    'admin-add': async () => {
      const fd = await formDialog({ title: T('Новий сервіс'), body: serviceForm(null), validate: validateService });
      if (!fd) return;
      adminOp(() => Api.saveServices(S.data.services.concat([formToService(fd, null)])), T('Сервіс додано'));
    },
    'admin-edit': async (el) => {
      const old = svc(el.dataset.v);
      const fd = await formDialog({ title: T('Змінити: {name}', { name: old.name }), body: serviceForm(old), validate: validateService });
      if (!fd) return;
      const upd = formToService(fd, old);
      adminOp(() => Api.saveServices(S.data.services.map((s) => (s.id === old.id ? upd : s))), T('Зміни збережено'));
    },
    'admin-del': async (el) => {
      const s = svc(el.dataset.v);
      if (!(await confirmDialog(T('Видалити сервіс?'), T('«{name}» зникне з каталогу та з усіх наборів. Це можна скасувати лише кнопкою «Скинути до початкового».', { name: s.name }), T('Видалити'), true))) return;
      adminOp(() => Api.saveServices(S.data.services.filter((x) => x.id !== s.id)), T('Сервіс видалено'));
    },
    'admin-reset': async () => {
      if (!(await confirmDialog(T('Скинути каталог?'), Api.mode() === 'server' ? T('Усі правки каталогу на сервері буде втрачено для всіх користувачів.') : T('Усі зміни каталогу в цьому браузері буде втрачено.'), T('Скинути'), true))) return;
      adminOp(() => Api.resetCatalog(), T('Каталог скинуто'));
    },
    'admin-export': () => {
      const blob = new Blob([JSON.stringify({ services: S.data.services }, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'subdog-services.json'; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    },
  };

  const changes = {
    free: (el) => { const it = S.set.items.find((i) => i.id === el.dataset.v); if (it) it.free = el.checked; persist(); refreshBuilder(); },
    student: (el) => { S.set.plan = el.checked ? 'student' : 'individual'; persist(); refreshBuilder(); },
    yearly: (el) => { S.set.yearly = el.checked; persist(); refreshBuilder(); },
    seats: (el) => setSeats(Number(el.value) || 1),
    'cmp-sel': (el) => {
      const i = Number(el.dataset.v);
      const arr = [S.compare[0] || '', S.compare[1] || ''];
      arr[i] = el.value;
      if (arr[0] && arr[0] === arr[1]) { toast(T('Оберіть два різні сервіси')); arr[i] = ''; }
      S.compare = arr.filter(Boolean);
      persist(); render();
    },
  };

  const binds = {
    'f-q': (el) => { S.filters.q = el.value; $('#results').innerHTML = resultsHtml(); },
    'f-max': (el) => { const max = maxSlider(); S.filters.max = Number(el.value) >= max ? null : Number(el.value); $('#f-max-v').textContent = S.filters.max == null ? T('без обмеження') : money(S.filters.max); $('#results').innerHTML = resultsHtml(); },
    'f-free': (el) => { S.filters.free = el.checked; $('#results').innerHTML = resultsHtml(); },
    'f-student': (el) => { S.filters.student = el.checked; $('#results').innerHTML = resultsHtml(); },
    'f-team': (el) => { S.filters.team = el.checked; $('#results').innerHTML = resultsHtml(); },
    'f-sort': (el) => { S.filters.sort = el.value; $('#results').innerHTML = resultsHtml(); },
    'ad-q': (el) => { S.adder.q = el.value; $('#adderList').innerHTML = adderHtml(); },
  };

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (el && clicks[el.dataset.act]) clicks[el.dataset.act](el, e);
  });
  document.addEventListener('change', (e) => {
    const el = e.target.closest('[data-act-change]');
    if (el && changes[el.dataset.actChange]) return changes[el.dataset.actChange](el);
    const b = e.target.closest('[data-bind]');
    if (b && b.type !== 'search' && b.type !== 'range' && binds[b.dataset.bind]) binds[b.dataset.bind](b);
  });
  document.addEventListener('input', (e) => {
    const b = e.target.closest('[data-bind]');
    if (b && (b.type === 'search' || b.type === 'range') && binds[b.dataset.bind]) binds[b.dataset.bind](b);
  });
  document.addEventListener('submit', async (e) => {
    const form = e.target.closest('[data-form]');
    if (!form) return;
    e.preventDefault();
    const fd = {};
    new FormData(form).forEach((v, k) => { fd[k] = v; });
    try {
      S.user = await (form.dataset.form === 'register' ? Api.register(fd) : Api.login(fd));
      toast(T('Вітаємо, {name}!', { name: S.user.name }));
      render();
    } catch (err) {
      const p = $('.form-error', form); p.textContent = err.message; p.hidden = false;
    }
  });

  window.addEventListener('hashchange', () => { setMenu(false); render(); });

  /* Мобільне меню */
  function setMenuLabel() {
    const open = $('#menuBtn').getAttribute('aria-expanded') === 'true';
    $('#menuBtn').textContent = open ? T('Закрити') : T('Меню');
  }
  function setMenu(open) {
    $('#siteHeader').classList.toggle('open', open);
    $('#menuBtn').setAttribute('aria-expanded', String(open));
    setMenuLabel();
  }
  $('#menuBtn').addEventListener('click', () => setMenu($('#menuBtn').getAttribute('aria-expanded') !== 'true'));
  $('#langBtn').addEventListener('click', () => clicks.lang());
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });

  /* «Прожектор» за курсором на скляних картках: передаємо позицію в CSS-змінні */
  document.addEventListener('pointermove', (e) => {
    const card = e.target.closest && e.target.closest('.card');
    if (!card) return;
    const r = card.getBoundingClientRect();
    card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
    card.style.setProperty('--my', (e.clientY - r.top) + 'px');
  }, { passive: true });

  /* ---------- старт ---------- */
  async function init() {
    applyStatic();
    try {
      S.data = await Api.getCatalog();
    } catch (err) {
      $('#app').innerHTML = `<div class="wrap"><div class="card empty"><div class="big">🐾</div><h1>${T('Не вдалося завантажити каталог')}</h1><p>${esc(err.message)}</p></div></div>`;
      return;
    }
    indexCatalog();
    S.set = sanitizeSet(Api.loadSet());
    S.compare = (Api.loadCompare() || []).filter((id) => S.byId[id]).slice(0, 2);
    S.user = await Api.me();
    render();
  }
  // Експортуємо для налагодження й тестів інтерфейсу
  window.SubdogApp = { state: S, render: render };
  init();
})();

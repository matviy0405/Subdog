/* Автотести Subdog. Відкрийте tests.html у браузері (краще через serve.ps1, тоді працюють і тести fetch). */
(async function () {
  'use strict';
  const { priceFor, setTotals, duplicates, recommend } = Calc;
  const queue = [];
  const test = (name, fn) => queue.push({ name, fn });
  function eq(actual, expected, what) {
    if (actual !== expected) throw new Error((what || 'значення') + ': очікували ' + expected + ', отримали ' + actual);
  }
  const rejects = async (p, textPart) => {
    try { await p; } catch (e) { if (!textPart || String(e.message).includes(textPart)) return; throw new Error('помилка не та: ' + e.message); }
    throw new Error('очікували помилку «' + (textPart || '') + '»');
  };

  // Демо із завдання: сервіс А 200/міс, сервіс Б 300/міс зі студентською знижкою 50% (одиниця виміру тут не важлива).
  const A = { id: 'a', name: 'Сервіс А', category: 'x', price: 200, studentDiscount: 0 };
  const B = { id: 'b', name: 'Сервіс Б', category: 'y', price: 300, studentDiscount: 50 };
  const byId = { a: A, b: B };
  const both = [{ id: 'a' }, { id: 'b' }];
  const ON = { plan: 'student', seats: 1, useYearly: true };
  const OFF = { plan: 'individual', seats: 1, useYearly: true };

  /* ===== Сценарії тестувальника ===== */
  test('Демо: знижка ввімкнена → 350 грн/міс і 4200 грн/рік', () => {
    const t = setTotals(both, byId, ON);
    eq(t.monthly, 350, 'місяць'); eq(t.yearly, 4200, 'рік');
  });
  test('Демо: знижку вимкнули → 500 і 6000', () => {
    const t = setTotals(both, byId, OFF);
    eq(t.monthly, 500, 'місяць'); eq(t.yearly, 6000, 'рік');
  });
  test('Демо: знову ввімкнули й прибрали А → 150 грн/міс', () => {
    const t = setTotals([{ id: 'b' }], byId, ON);
    eq(t.monthly, 150, 'місяць'); eq(t.yearly, 1800, 'рік');
  });
  test('Порожній набір дає 0 і 0', () => {
    const t = setTotals([], byId, ON);
    eq(t.monthly, 0, 'місяць'); eq(t.yearly, 0, 'рік'); eq(t.count, 0, 'кількість');
  });
  test('Знижка не застосовується до сервісу, у якого її немає', () => {
    const p = priceFor(A, ON);
    eq(p.monthly, 200, 'ціна А'); eq(p.discount, 0, 'знижка'); eq(p.noStudent, true, 'прапорець noStudent');
  });
  test('Річна сума = 12 × місячна, якщо немає річного тарифу', () => {
    eq(priceFor(A, OFF).yearly, 2400, 'рік'); eq(priceFor(A, OFF).annualTariff, false, 'annualTariff');
  });
  test('Річний тариф дешевший за 12 місяців — використовується', () => {
    const C = { id: 'c', name: 'С', category: 'z', price: 100, yearlyPrice: 1000, studentDiscount: 0 };
    const p = priceFor(C, OFF);
    eq(p.yearly, 1000, 'рік'); eq(p.saveByAnnual, 200, 'економія'); eq(p.annualTariff, true, 'прапорець');
    eq(priceFor(C, { plan: 'individual', useYearly: false }).yearly, 1200, 'рік без річних тарифів');
  });
  test('Студентська знижка діє й на річний тариф', () => {
    const C = { id: 'c', name: 'С', category: 'z', price: 100, yearlyPrice: 1000, studentDiscount: 50 };
    eq(priceFor(C, ON).monthly, 50, 'місяць'); eq(priceFor(C, ON).yearly, 500, 'рік');
  });
  test('Безкоштовний план дає 0, лише якщо сервіс його має', () => {
    const F = { id: 'f', name: 'F', category: 'z', price: 100, free: true };
    eq(priceFor(F, { plan: 'individual', free: true }).monthly, 0, 'з free');
    eq(priceFor(A, { plan: 'individual', free: true }).monthly, 200, 'без free-плану');
  });

  /* ===== Командний план ===== */
  test('Командний план: ціна за людину × кількість; без плану — 1 акаунт', () => {
    const T = { id: 't', name: 'T', category: 'z', price: 100, team: { price: 80 } };
    eq(priceFor(T, { plan: 'team', seats: 5 }).monthly, 400, 'з командним');
    const p = priceFor(A, { plan: 'team', seats: 5 });
    eq(p.monthly, 200, 'без командного'); eq(p.noTeam, true, 'noTeam');
  });
  test('Ліцензії на сервіс (qty): без командного плану кожен платить за себе', () => {
    const p = priceFor(A, { plan: 'team', seats: 25, qty: 4 });
    eq(p.monthly, 800, 'сума'); eq(p.seats, 4, 'акаунтів'); eq(p.noTeam, true, 'noTeam');
    const T = { id: 't', name: 'T', category: 'z', price: 100, team: { price: 80 } };
    eq(priceFor(T, { plan: 'team', seats: 25, qty: 3 }).monthly, 240, 'qty перекриває загальну кількість');
  });
  test('Мінімум місць у командному плані (minSeats)', () => {
    const T = { id: 't', name: 'T', category: 'z', price: 100, team: { price: 80, minSeats: 2 } };
    const p = priceFor(T, { plan: 'team', seats: 1 });
    eq(p.monthly, 160, 'сума'); eq(p.minApplied, 2, 'minApplied'); eq(p.seats, 2, 'місць');
    eq(priceFor(T, { plan: 'team', seats: 5 }).minApplied, undefined, 'мінімум не потрібен');
  });
  test('qty переходить у підсумок набору', () => {
    const t = setTotals([{ id: 'a', qty: 3 }, { id: 'b' }], byId, { plan: 'team', seats: 10 });
    eq(t.monthly, 3 * 200 + 300, 'сума');
  });

  /* ===== Дублі ===== */
  test('Дві підписки однієї категорії без груп → «дублюється»', () => {
    const dup = duplicates([{ id: 'a' }, { id: 'a2' }, { id: 'b' }], { a: A, a2: { id: 'a2', category: 'x', price: 1 }, b: B });
    eq(dup.length, 1, 'груп'); eq(dup[0].group, 'x', 'група'); eq(dup[0].ids.length, 2, 'сервісів');
    eq(duplicates(both, byId).length, 0, 'без дублів');
  });
  test('Група уточнює дублі: GitHub + JetBrains не дублі, Notion + Obsidian — дублі', () => {
    const real = {}; window.SUBDOG_DATA.services.forEach((s) => { real[s.id] = s; });
    eq(duplicates([{ id: 'github' }, { id: 'jetbrains' }], real).length, 0, 'GitHub + JetBrains');
    eq(duplicates([{ id: 'notion' }, { id: 'obsidian' }], real).length, 1, 'Notion + Obsidian');
    eq(duplicates([{ id: 'claude' }, { id: 'chatgpt' }], real).length, 1, 'Claude + ChatGPT');
  });
  test('Видалений із каталогу сервіс у наборі ігнорується', () => {
    eq(setTotals([{ id: 'a' }, { id: 'ghost' }], byId, OFF).monthly, 200, 'сума');
  });

  /* ===== Каталог і готові набори ===== */
  const data = window.SUBDOG_DATA;
  const cats = new Set(data.categories.map((c) => c.id));
  const real = {}; data.services.forEach((s) => { real[s.id] = s; });

  test('Каталог: id унікальні, категорії та групи існують', () => {
    const ids = data.services.map((s) => s.id);
    eq(new Set(ids).size, ids.length, 'унікальність id');
    data.services.forEach((s) => {
      if (!cats.has(s.category)) throw new Error(s.name + ': невідома категорія ' + s.category);
      if (s.group && !(data.groups && data.groups[s.group])) throw new Error(s.name + ': невідома група ' + s.group);
    });
  });
  test('Каталог: ціни ≥ 0, знижки 0–100, посилання http(s)', () => {
    data.services.forEach((s) => {
      if (!(s.price >= 0)) throw new Error(s.name + ': ціна');
      if (!(s.studentDiscount >= 0 && s.studentDiscount <= 100)) throw new Error(s.name + ': знижка');
      if (!/^https?:\/\//.test(s.url)) throw new Error(s.name + ': посилання');
      if (!s.desc) throw new Error(s.name + ': опис');
      if (!s.priceDate) throw new Error(s.name + ': немає дати цін');
    });
  });
  test('Каталог: у кожного сервісу позначено, наскільки підтверджено ціну', () => {
    data.services.forEach((s) => {
      if (!['official', 'partial', 'unverified'].includes(s.priceSource)) throw new Error(s.name + ': priceSource');
      if (!s.priceNote) throw new Error(s.name + ': немає примітки до ціни');
    });
    if (!data.rates || !(data.rates.USD > 0)) throw new Error('немає курсу валют');
  });
  test('Каталог: річний тариф має сенс (не дорожчий за 12 місяців)', () => {
    data.services.forEach((s) => {
      if (s.yearlyPrice != null && s.yearlyPrice > s.price * 12 + 0.005) throw new Error(s.name + ': річний дорожчий');
      if (s.team && s.team.yearlyPrice != null && s.team.yearlyPrice > s.team.price * 12 + 0.005) throw new Error(s.name + ': командний річний дорожчий');
    });
  });
  test('Готові набори посилаються на існуючі сервіси', () => {
    data.presets.forEach((p) => p.items.forEach((i) => { if (!real[i.id]) throw new Error(p.name + ': немає ' + i.id); }));
  });
  test('Майстер: усі комбінації дають непорожній набір без дублів', () => {
    const w = data.wizard; let n = 0;
    w.roles.forEach((r) => w.spheres.forEach((sp) => {
      const rec = recommend(w, data.services, { mode: r.mode, role: r.id, sphere: sp.id });
      if (!rec.items.length) throw new Error('порожньо: ' + r.id + '/' + sp.id);
      if (duplicates(rec.items, real).length) throw new Error('дубль: ' + r.id + '/' + sp.id);
      rec.items.forEach((i) => { if (!real[i.id]) throw new Error('немає ' + i.id); });
      n++;
    }));
    eq(n, w.roles.length * w.spheres.length, 'комбінацій');
  });
  test('«Мінімальний бюджет» коштує менше за $5/міс', () => {
    const p = data.presets.find((x) => x.id === 'min-budget');
    const t = setTotals(p.items, real, { plan: p.plan, seats: 1, useYearly: true });
    if (!(t.monthly < 5)) throw new Error('сума ' + t.monthly);
  });
  test('catalog.js збігається з catalog.json (запусти sync-catalog.ps1, якщо ні)', async () => {
    let json;
    try { const r = await fetch('data/catalog.json', { cache: 'no-store' }); if (!r.ok) throw new Error(r.status); json = await r.json(); }
    catch (e) { return 'SKIP'; } // відкрито як file:// — fetch заборонений
    if (JSON.stringify(json) !== JSON.stringify(window.SUBDOG_DATA)) throw new Error('файли розійшлися');
  });

  /* ===== Долари й англійська версія ===== */
  test('Каталог у доларах: currency = USD, жодна ціна не схожа на гривневу', () => {
    eq(data.currency, 'USD', 'валюта');
    data.services.forEach((s) => {
      if (s.price > 120) throw new Error(s.name + ': ціна $' + s.price + ' схожа на гривню');
      if (s.team && s.team.price > 120) throw new Error(s.name + ': командна ціна $' + s.team.price + ' схожа на гривню');
    });
  });
  test('Англійська версія каталогу повна: категорії, групи, сервіси, набори, майстер', () => {
    data.categories.forEach((c) => { if (!c.name_en) throw new Error('категорія ' + c.id); });
    Object.keys(data.groups).forEach((g) => { if (!data.groups_en[g]) throw new Error('група ' + g); });
    data.services.forEach((s) => {
      if (!s.desc_en) throw new Error(s.name + ': desc_en');
      if (!s.priceNote_en) throw new Error(s.name + ': priceNote_en');
      if (s.freeNote && !s.freeNote_en) throw new Error(s.name + ': freeNote_en');
    });
    data.presets.forEach((p) => { if (!p.name_en || !p.tagline_en) throw new Error('набір ' + p.id); });
    data.wizard.modes.concat(data.wizard.roles).forEach((x) => { if (!x.title_en || !x.text_en) throw new Error('майстер ' + x.id); });
    data.wizard.spheres.forEach((x) => { if (!x.title_en) throw new Error('сфера ' + x.id); });
    if (!data.pricesNote_en) throw new Error('pricesNote_en');
  });
  test('Англійські тексти каталогу не містять кирилиці', () => {
    const bad = [];
    const check = (label, v) => { if (typeof v === 'string' && /[Ѐ-ӿ]/.test(v)) bad.push(label); };
    data.services.forEach((s) => ['desc_en', 'freeNote_en', 'priceNote_en'].forEach((f) => check(s.id + '.' + f, s[f])));
    data.categories.forEach((c) => check(c.id, c.name_en));
    Object.keys(data.groups_en).forEach((g) => check('group ' + g, data.groups_en[g]));
    data.presets.forEach((p) => { check(p.id, p.name_en); check(p.id, p.tagline_en); });
    check('pricesNote_en', data.pricesNote_en);
    if (bad.length) throw new Error('кирилиця в EN: ' + bad.join(', '));
  });
  test('I18n: переклад, підстановка, множина й запасний варіант', () => {
    const prev = I18n.lang();
    try {
      I18n.force('uk');
      eq(I18n.t('Каталог'), 'Каталог', 'uk');
      eq(I18n.t('Знайдено: {n} з {total}', { n: 3, total: 29 }), 'Знайдено: 3 з 29', 'uk з параметрами');
      eq(I18n.plural(1, ['сервіс', 'сервіси', 'сервісів'], ['service', 'services']), 'сервіс', 'uk 1');
      eq(I18n.plural(3, ['сервіс', 'сервіси', 'сервісів'], ['service', 'services']), 'сервіси', 'uk 3');
      eq(I18n.plural(5, ['сервіс', 'сервіси', 'сервісів'], ['service', 'services']), 'сервісів', 'uk 5');
      eq(I18n.plural(11, ['сервіс', 'сервіси', 'сервісів'], ['service', 'services']), 'сервісів', 'uk 11');
      eq(I18n.plural(22, ['сервіс', 'сервіси', 'сервісів'], ['service', 'services']), 'сервіси', 'uk 22');
      I18n.force('en');
      eq(I18n.t('Каталог'), 'Catalog', 'en');
      eq(I18n.t('Знайдено: {n} з {total}', { n: 3, total: 29 }), 'Found: 3 of 29', 'en з параметрами');
      eq(I18n.plural(1, ['сервіс', 'сервіси', 'сервісів'], ['service', 'services']), 'service', 'en 1');
      eq(I18n.plural(2, ['сервіс', 'сервіси', 'сервісів'], ['service', 'services']), 'services', 'en 2');
      eq(I18n.L({ desc: 'укр', desc_en: 'eng' }, 'desc'), 'eng', 'L en');
      eq(I18n.L({ desc: 'укр' }, 'desc'), 'укр', 'L запасний варіант');
      eq(I18n.t('нема такого ключа'), 'нема такого ключа', 'невідомий ключ');
      eq(I18n.missing().indexOf('нема такого ключа') >= 0, true, 'невідомий ключ потрапив у список');
    } finally { I18n.force(prev); }
  });
  test('Старі правки адміна без валюти (гривня) ігноруються', async () => {
    const base = await Api.getCatalog();
    localStorage.setItem(Api.namespaceKeys()[5], JSON.stringify({ v: 2, upserts: { notion: Object.assign({}, base.services[0], { price: 9999 }) }, deleted: [], savedAt: 1 }));
    const after = await Api.getCatalog();
    eq(after.customized, false, 'правки відкинуто');
    eq(after.services.find((s) => s.id === 'notion').price, data.services.find((s) => s.id === 'notion').price, 'ціна з бази');
    eq(localStorage.getItem(Api.namespaceKeys()[5]), null, 'старий запис видалено');
  });
  /* ===== «Бекенд»: окремий простір ключів, щоб не псувати справжні дані ===== */
  test('Набір не губиться після перезавантаження (збереження й читання)', () => {
    const state = { items: [{ id: 'notion', free: false }, { id: 'github', free: true, qty: 2 }], plan: 'student', seats: 4, yearly: false };
    Api.saveSet(state);
    eq(JSON.stringify(Api.loadSet()), JSON.stringify(state), 'збережений набір');
  });
  test('Акаунти: реєстрація, дубль пошти, невірний пароль, вхід, вихід', async () => {
    const u = await Api.register({ name: 'Тест', email: 'T@Example.com', password: 'secret1' });
    eq(u.email, 't@example.com', 'пошта в нижньому регістрі'); eq(u.role, 'user', 'роль');
    eq((await Api.me()).id, u.id, 'me()');
    await rejects(Api.register({ name: 'Ще', email: 't@example.com', password: 'secret2' }), 'вже існує');
    await rejects(Api.register({ name: 'Т', email: 'bad', password: 'secret2' }), 'пошту');
    await rejects(Api.register({ name: 'Тест', email: 'x@y.com', password: '123' }), '6 символів');
    await Api.logout(); eq(await Api.me(), null, 'після виходу');
    await rejects(Api.login({ email: 't@example.com', password: 'wrong' }), 'Невірна');
    eq((await Api.login({ email: 't@example.com', password: 'secret1' })).id, u.id, 'вхід');
  });
  test('Паролі: не зберігаються відкритим текстом, хеш PBKDF2 (де є Web Crypto)', async () => {
    const stored = JSON.parse(localStorage.getItem(Api.namespaceKeys()[2]));
    const rec = stored.find((x) => x.email === 't@example.com');
    if (JSON.stringify(rec).includes('secret1')) throw new Error('пароль у відкритому вигляді');
    if (window.crypto && crypto.subtle && !String(rec.hash).startsWith('p2:')) throw new Error('очікували PBKDF2');
  });
  test('Адмін-акаунт: вхід і підвищення слабкого хеша до PBKDF2', async () => {
    const a = await Api.login({ email: 'admin@subdog.local', password: 'admin123' });
    eq(a.role, 'admin', 'роль');
    if (window.crypto && crypto.subtle) {
      const rec = JSON.parse(localStorage.getItem(Api.namespaceKeys()[2])).find((x) => x.role === 'admin');
      if (!String(rec.hash).startsWith('p2:')) throw new Error('хеш не оновлено');
      eq((await Api.login({ email: 'admin@subdog.local', password: 'admin123' })).role, 'admin', 'повторний вхід');
    }
  });
  test('Збережені набори: зберегти, побачити лише свої, видалити', async () => {
    await Api.login({ email: 't@example.com', password: 'secret1' });
    const rec = await Api.saveUserSet('Мій', { items: [{ id: 'notion' }], plan: 'student', seats: 3, yearly: true });
    eq((await Api.listSets()).length, 1, 'кількість');
    await Api.logout();
    eq((await Api.listSets()).length, 0, 'гість не бачить чужих наборів');
    await rejects(Api.saveUserSet('X', {}), 'Увійдіть');
    await Api.login({ email: 'admin@subdog.local', password: 'admin123' });
    eq((await Api.listSets()).length, 0, 'інший користувач не бачить');
    await Api.login({ email: 't@example.com', password: 'secret1' });
    await Api.deleteUserSet(rec.id);
    eq((await Api.listSets()).length, 0, 'після видалення');
  });

  /* ===== Адмінка: правки зливаються з базою, а не замінюють її ===== */
  test('Адмінка: правка одного сервісу не заморожує решту каталогу', async () => {
    const base = await Api.getCatalog();
    eq(base.customized, false, 'спочатку без правок');
    const edited = base.services.map((s) => (s.id === 'notion' ? Object.assign({}, s, { price: 999 }) : s));
    await Api.saveServices(edited);
    const after = await Api.getCatalog();
    eq(after.customized, true, 'з правками');
    eq(after.services.find((s) => s.id === 'notion').price, 999, 'правка збереглась');
    eq(after.services.find((s) => s.id === 'claude').price, base.services.find((s) => s.id === 'claude').price, 'решта з бази');
    const stored = JSON.parse(localStorage.getItem(Api.namespaceKeys()[5]));
    eq(Object.keys(stored.upserts).join(), 'notion', 'зберігається лише різниця');
  });
  test('Адмінка: додати й видалити сервіс, скинути до початкового', async () => {
    const cur = await Api.getCatalog();
    const added = { id: 'new-one', name: 'Новий', category: 'dev', desc: 'd', url: 'https://example.com', price: 10, studentDiscount: 0 };
    await Api.saveServices(cur.services.filter((s) => s.id !== 'github').concat([added]));
    const after = await Api.getCatalog();
    eq(after.services.some((s) => s.id === 'new-one'), true, 'доданий є');
    eq(after.services.some((s) => s.id === 'github'), false, 'видалений зник');
    await Api.resetCatalog();
    const reset = await Api.getCatalog();
    eq(reset.customized, false, 'після скидання');
    eq(reset.services.length, data.services.length, 'кількість як у базі');
  });
  test('Адмінка: старий формат правок (повний список) мігрує у різницю', async () => {
    const base = await Api.getCatalog();
    const old = base.services.map((s) => (s.id === 'slack' ? Object.assign({}, s, { price: 1 }) : s)).filter((s) => s.id !== 'zoom');
    localStorage.setItem(Api.namespaceKeys()[5], JSON.stringify({ services: old, cur: 'USD', savedAt: 1 }));
    const after = await Api.getCatalog();
    eq(after.services.find((s) => s.id === 'slack').price, 1, 'правка збереглась');
    eq(after.services.some((s) => s.id === 'zoom'), false, 'видалення збереглось');
    eq(JSON.parse(localStorage.getItem(Api.namespaceKeys()[5])).v, 2, 'формат оновлено');
    await Api.resetCatalog();
  });

  /* ---- запуск ---- */
  await Api.ready;
  const serverMode = Api.mode() === 'server';
  const prevLang = I18n.lang();
  I18n.force('uk'); // перевірки повідомлень написано українською
  Api.forceLocal(true); // тести браузерної реалізації; сервер перевіряє test-api.ps1
  Api.setNamespace('subdog.test.' + Date.now() + '.');
  const testKeys = Api.namespaceKeys();
  const results = [];
  for (const t of queue) {
    try {
      const r = await t.fn();
      results.push({ name: t.name, ok: true, skip: r === 'SKIP' });
    } catch (e) { results.push({ name: t.name, ok: false, detail: e.message }); }
  }
  testKeys.forEach((k) => { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } });
  Api.setNamespace('subdog.');
  Api.forceLocal(false);
  I18n.force(prevLang);

  const failed = results.filter((r) => !r.ok).length;
  const skipped = results.filter((r) => r.skip).length;
  document.getElementById('sum').textContent = failed
    ? '❌ Не пройдено: ' + failed + ' з ' + results.length
    : '✅ Усі тести пройдено: ' + results.length + ' з ' + results.length + (skipped ? ' (пропущено ' + skipped + ': відкрийте через serve.ps1)' : '') + (serverMode ? ' · сервер підключено (його перевіряє test-api.ps1)' : '');
  const esc = (s) => String(s).replace(/</g, '&lt;');
  document.getElementById('out').innerHTML = results.map((r) =>
    '<div class="t"><span class="' + (r.ok ? 'ok' : 'fail') + '">' + (r.ok ? '✓' : '✗') + '</span><div>' + esc(r.name) +
    (r.skip ? '<small>пропущено на file://</small>' : '') + (r.ok ? '' : '<small>' + esc(r.detail) + '</small>') + '</div></div>').join('');
  window.__testResults = { total: results.length, failed: failed, skipped: skipped };
})();

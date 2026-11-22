(function (root) {
  'use strict';

  const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  const num = (v) => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return isFinite(n) ? n : null;
  };

  const PLAN_LABELS = {
    individual: 'Індивідуальний',
    student: 'Студентський',
    team: 'Командний',
  };

  function priceFor(service, opts) {
    opts = opts || {};
    const plan = PLAN_LABELS[opts.plan] ? opts.plan : 'individual';
    const seats = Math.max(1, Math.floor(Number(opts.seats) || 1));
    const useYearly = opts.useYearly !== false;

    const base = num(service.price) || 0;
    const baseYear = num(service.yearlyPrice);
    const disc = Math.min(100, Math.max(0, num(service.studentDiscount) || 0));

    const out = {
      plan: plan,
      seats: 1,
      discount: 0,
      noStudent: false,
      noTeam: false,
      free: false,
      annualTariff: false,
      listMonthly: base,
    };

    let m = base;
    let y = baseYear;

    if (plan === 'student') {
      if (disc > 0) {
        m = r2(base * (1 - disc / 100));
        y = baseYear === null ? null : r2(baseYear * (1 - disc / 100));
        out.discount = disc;
      } else {
        out.noStudent = true;
      }
    } else if (plan === 'team') {
      const t = service.team;
      const tp = t ? num(t.price) : null;
      const qty = Math.floor(Number(opts.qty)) >= 1 ? Math.floor(Number(opts.qty)) : 0;
      if (tp !== null) {
        const ty = num(t.yearlyPrice);
        const min = Math.max(1, Math.floor(num(t.minSeats) || 1));
        let n = qty || seats;
        if (n < min) { n = min; out.minApplied = min; }
        out.seats = n;
        m = r2(tp * n);
        y = ty === null ? null : r2(ty * n);
        out.listMonthly = m;
      } else {
        const n = qty || 1;
        out.noTeam = true;
        out.seats = n;
        m = r2(base * n);
        y = baseYear === null ? null : r2(baseYear * n);
        out.listMonthly = m;
      }
    }

    if (opts.free && service.free) {
      out.free = true;
      m = 0;
      y = null;
    }

    let year = r2(12 * m);
    if (useYearly && y !== null && y < year) {
      year = y;
      out.annualTariff = true;
    }

    out.monthly = m;
    out.yearly = year;
    out.saveByAnnual = r2(12 * m - year);
    return out;
  }

  function setTotals(items, byId, opts) {
    const rows = [];
    let monthly = 0;
    let yearly = 0;
    let save = 0;
    (items || []).forEach(function (item) {
      const service = byId[item.id];
      if (!service) return;
      const price = priceFor(service, Object.assign({}, opts, { free: !!item.free, qty: item.qty }));
      rows.push({ item: item, service: service, price: price });
      monthly += price.monthly;
      yearly += price.yearly;
      save += price.saveByAnnual;
    });
    return {
      rows: rows,
      count: rows.length,
      monthly: r2(monthly),
      yearly: r2(yearly),
      saveByAnnual: r2(save),
    };
  }

  const groupOf = function (s) { return s.group || s.category; };

  function duplicates(items, byId) {
    const groups = {};
    (items || []).forEach(function (item) {
      const s = byId[item.id];
      if (!s) return;
      const g = groupOf(s);
      (groups[g] = groups[g] || []).push(s.id);
    });
    return Object.keys(groups)
      .filter(function (g) { return groups[g].length > 1; })
      .map(function (g) { return { group: g, ids: groups[g] }; });
  }

  function recommend(wizard, services, pick) {
    const byId = {};
    services.forEach(function (s) { byId[s.id] = s; });
    const find = function (list, id) { return list.find(function (x) { return x.id === id; }); };
    const mode = find(wizard.modes, pick.mode);
    const role = find(wizard.roles, pick.role);
    const sphere = find(wizard.spheres, pick.sphere);
    const order = [].concat(sphere ? sphere.items : [], role ? role.items : [], mode ? mode.items : []);
    const seenGroup = {};
    const seenId = {};
    const items = [];
    for (let i = 0; i < order.length && items.length < 7; i++) {
      const s = byId[order[i]];
      if (!s || seenId[s.id] || seenGroup[groupOf(s)]) continue;
      seenId[s.id] = true;
      seenGroup[groupOf(s)] = true;
      let free = false;
      if (role && typeof role.freeAbove === 'number' && s.free) {
        const paid = priceFor(s, { plan: role.plan, seats: role.seats || 3, useYearly: true }).monthly;
        free = paid > role.freeAbove;
      }
      items.push({ id: s.id, free: free });
    }
    return {
      items: items,
      plan: role && role.plan ? role.plan : 'individual',
      seats: role && role.seats ? role.seats : 3,
    };
  }

  const api = {
    r2: r2,
    PLAN_LABELS: PLAN_LABELS,
    priceFor: priceFor,
    setTotals: setTotals,
    duplicates: duplicates,
    groupOf: groupOf,
    recommend: recommend,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Calc = api;
})(typeof window !== 'undefined' ? window : globalThis);

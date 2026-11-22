$(function () {
  'use strict';

  var T = I18n.t;
  var L = I18n.L;
  var PLANS = ['individual', 'student', 'team'];
  var SOURCES = {
    official: ['tag_type_good', 'Звірено з офіційною сторінкою'],
    partial: ['', 'Частково звірено з офіційною сторінкою'],
    unverified: ['tag_type_warn', 'За сторонніми джерелами, звірте на сайті'],
    manual: ['', 'Введено адміністратором']
  };

  var state = {
    data: null,
    byId: {},
    user: null,
    set: {items: [], plan: 'individual', seats: 3, yearly: true},
    compare: [],
    filters: newFilters(),
    adder: {q: '', cat: 'all'},
    account: 'login',
    wizard: {step: 1, mode: null, role: null, sphere: null}
  };
  var route = {name: '', arg: ''};
  var pages = {};
  var header;
  var dialog;
  var toastTimer;
  var formats = {};

  function newFilters(cat) {
    return {q: '', cat: cat || 'all', max: null, free: false, student: false, team: false, sort: 'name'};
  }

  function esc(text) {
    return String(text == null ? '' : text).replace(/[&<>"']/g, function (c) {
      return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c];
    });
  }

  function fmt(n) {
    var locale = I18n.locale();
    var whole = n % 1 === 0;
    var key = locale + whole;
    if (!formats[key]) {
      formats[key] = new Intl.NumberFormat(locale, whole ?
        {maximumFractionDigits: 0} :
        {minimumFractionDigits: 2, maximumFractionDigits: 2});
    }
    return formats[key].format(n);
  }

  function money(n) {
    return '$' + fmt(n);
  }

  function formatDate(iso) {
    var date = iso ? new Date(iso + 'T00:00:00Z') : null;
    if (!date || isNaN(date)) {
      return '—';
    }
    return date.toLocaleDateString(I18n.locale(), {year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC'});
  }

  function safeUrl(url) {
    return /^https?:\/\//i.test(url || '') ? url : '#';
  }

  function planLabel(plan) {
    return T(Calc.PLAN_LABELS[plan]);
  }

  function serviceWord(n) {
    return I18n.plural(n, ['сервіс', 'сервіси', 'сервісів'], ['service', 'services']);
  }

  function service(id) {
    return state.byId[id];
  }

  function category(id) {
    var found = null;
    $.each(state.data.categories, function (i, item) {
      if (item.id === id) {
        found = item;
      }
    });
    return found || {id: id, name: id};
  }

  function categoryName(id) {
    return L(category(id), 'name');
  }

  function groupName(group) {
    var english = I18n.lang() === 'en' ? (state.data.groups_en || {}) : {};
    return english[group] || (state.data.groups || {})[group] || categoryName(group);
  }

  function inSet(id) {
    var found = false;
    $.each(state.set.items, function (i, item) {
      if (item.id === id) {
        found = true;
      }
    });
    return found;
  }

  function isAdmin() {
    return !!(state.user && state.user.role === 'admin');
  }

  function isLocalHost() {
    return location.protocol === 'file:' || $.inArray(location.hostname, ['localhost', '127.0.0.1', '[::1]', '']) !== -1;
  }

  function totals(options) {
    return Calc.setTotals(state.set.items, state.byId, options || {
      plan: state.set.plan,
      seats: state.set.seats,
      useYearly: state.set.yearly
    });
  }

  function indexCatalog() {
    state.byId = {};
    $.each(state.data.services, function (i, item) {
      state.byId[item.id] = item;
    });
  }

  function sanitizeSet(raw) {
    var result = {items: [], plan: 'individual', seats: 3, yearly: true};
    var seen = {};
    if (!raw || typeof raw !== 'object') {
      return result;
    }
    $.each($.isArray(raw.items) ? raw.items : [], function (i, item) {
      var qty;
      var clean;
      if (!item || !state.byId[item.id] || seen[item.id]) {
        return;
      }
      seen[item.id] = true;
      clean = {id: item.id, free: !!item.free};
      qty = Math.floor(Number(item.qty));
      if (qty >= 1) {
        clean.qty = Math.min(500, qty);
      }
      result.items.push(clean);
    });
    if ($.inArray(raw.plan, PLANS) !== -1) {
      result.plan = raw.plan;
    }
    result.seats = Math.min(500, Math.max(1, Math.floor(Number(raw.seats) || 3)));
    result.yearly = raw.yearly !== false;
    return result;
  }

  function toast(message) {
    var elem = $('.toast');
    elem.text(message).addClass('toast_visible_yes');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      elem.removeClass('toast_visible_yes');
    }, 2600);
  }

  function keyOf(elem) {
    return (elem.attr('class') || '').split(' ')[0] + '|' + (elem.attr('data-id') || '');
  }

  function keepFocus(action) {
    var active = $(document.activeElement);
    var key = active.is('button, input, select') ? keyOf(active) : '';
    var parts = key.split('|');
    action();
    if (key && parts[1]) {
      $('.' + parts[0] + '[data-id="' + parts[1] + '"]').filter(':visible').first().focus();
    }
  }

  function save() {
    Api.saveSet(state.set);
    Api.saveCompare(state.compare);
    header.render();
  }

  function refresh() {
    keepFocus(function () {
      if (pages[route.name]) {
        pages[route.name].render(route.arg);
      }
      header.render();
    });
  }

  function translateStatic() {
    var lang = I18n.lang();
    document.documentElement.lang = lang;
    $('[data-i18n]').each(function () {
      $(this).text(T($(this).attr('data-i18n')));
    });
    $('[data-i18n-label]').each(function () {
      $(this).attr('aria-label', T($(this).attr('data-i18n-label')));
    });
    $('[data-i18n-placeholder]').each(function () {
      $(this).attr('placeholder', T($(this).attr('data-i18n-placeholder')));
    });
    $('meta[name="description"]').attr('content', T('Оберіть мету й сферу — Subdog збере комплект підписок для навчання й роботи та порахує вартість на місяць і на рік, у тому числі для команди.'));
    $('.footer__note').text((state.data ? L(state.data, 'pricesNote') + ' ' : '') + T("Назви належать їхнім власникам; Subdog з ними не пов'язаний."));
    header.renderLabels();
  }

  function logo(item, big) {
    return '<span class="logo' + (big ? ' logo_size_big' : '') + '" aria-hidden="true">' + esc(item.name.charAt(0)) + '</span>';
  }

  function switchHtml(active) {
    var html = '<div class="switch" role="group" aria-label="' + T('Тип плану') + '">';
    $.each(PLANS, function (i, plan) {
      html += '<button class="switch__item' + (plan === active ? ' switch__item_active_yes' : '') + '" type="button" data-id="' + plan + '" aria-pressed="' + (plan === active) + '">' + planLabel(plan) + '</button>';
    });
    return html + '</div>';
  }

  function priceInline(item, plan, seats) {
    var price = Calc.priceFor(item, {plan: plan, seats: seats || 1, useYearly: false});
    if (plan === 'student' && price.discount) {
      return '<s>' + money(price.listMonthly) + '</s> ' + money(price.monthly);
    }
    return money(price.monthly);
  }

  function badges(item) {
    var html = '';
    if (item.free) {
      html += '<span class="tag tag_type_good">' + T('Є безкоштовний план') + '</span>';
    }
    if (item.studentDiscount > 0) {
      html += '<span class="tag tag_type_accent">' + T('Студентам −{n}%', {n: item.studentDiscount}) + '</span>';
    }
    if (item.team && item.team.price != null) {
      html += '<span class="tag">' + T('Командний план') + '</span>';
    }
    if (item.yearlyPrice != null && item.yearlyPrice < item.price * 12) {
      html += '<span class="tag">' + T('Річний тариф −{n}%', {n: Math.round((1 - item.yearlyPrice / (item.price * 12)) * 100)}) + '</span>';
    }
    return html;
  }

  function serviceCard(item) {
    var added = inSet(item.id);
    var compared = $.inArray(item.id, state.compare) !== -1;
    return '<article class="card service">' +
      '<div class="service__head">' + logo(item) + '<div><h3><a href="#/service/' + encodeURIComponent(item.id) + '">' + esc(item.name) + '</a></h3><span class="muted small">' + esc(categoryName(item.category)) + '</span></div></div>' +
      '<div class="tags">' + badges(item) + '</div>' +
      '<p class="service__desc">' + esc(L(item, 'desc')) + '</p>' +
      '<div class="service__price num">' + priceInline(item, state.set.plan, 1) + ' <small>' + (state.set.plan === 'team' ? T('/міс за людину') : T('/міс')) + '</small></div>' +
      '<div class="service__actions">' +
      '<button class="service__toggle button button_size_small ' + (added ? 'button_active_yes' : 'button_type_primary') + '" type="button" data-id="' + item.id + '" aria-pressed="' + added + '">' + (added ? T('✓ У наборі') : T('+ До набору')) + '</button>' +
      '<button class="service__compare button button_size_small button_type_ghost' + (compared ? ' button_active_yes' : '') + '" type="button" data-id="' + item.id + '" aria-pressed="' + compared + '">' + (compared ? T('✓ Порівнюю') : T('Порівняти')) + '</button>' +
      '</div></article>';
  }

  function toggleInSet(id) {
    if (inSet(id)) {
      state.set.items = $.grep(state.set.items, function (item) {
        return item.id !== id;
      });
      toast(T('Прибрано з набору'));
    } else {
      state.set.items.push({id: id, free: false});
      toast(T('Додано до набору'));
    }
    save();
  }

  function toggleCompare(id) {
    var index = $.inArray(id, state.compare);
    if (index !== -1) {
      state.compare.splice(index, 1);
    } else {
      state.compare.push(id);
      if (state.compare.length > 2) {
        state.compare.shift();
      }
      if (state.compare.length === 2) {
        toast(T('Готово — відкрийте «Порівняння»'));
      }
    }
    save();
  }

  function replaceSet(newSet, label) {
    var count = state.set.items.length;
    var ask = count ? dialog.confirm(T('Замінити поточний набір?'), T('У вас уже є набір із {n} {w}. Він буде замінений на «{label}».', {n: count, w: serviceWord(count), label: label}), T('Замінити')) : Promise.resolve(true);
    return ask.then(function (ok) {
      if (!ok) {
        return false;
      }
      state.set = sanitizeSet(newSet);
      save();
      location.hash = '#/builder';
      toast(T('Набір «{label}» готовий', {label: label}));
      return true;
    });
  }

  function setSeats(count) {
    state.set.seats = Math.min(500, Math.max(1, Math.floor(count) || 1));
    $.each(state.set.items, function (i, item) {
      var item2 = service(item.id);
      if (item2 && item2.team && item2.team.price != null) {
        delete item.qty;
      }
    });
    save();
    refresh();
  }

  function setQty(id, delta) {
    var row = null;
    $.each(totals().rows, function (i, item) {
      if (item.item.id === id) {
        row = item;
      }
    });
    if (row) {
      row.item.qty = Math.min(500, Math.max(1, row.price.seats + delta));
      save();
      refresh();
    }
  }

  function Dialog(elem) {
    this.elem = elem;
  }

  Dialog.prototype.open = function (options) {
    var elem = this.elem;
    return new Promise(function (resolve) {
      var done = false;
      var form;
      function finish(value) {
        if (done) {
          return;
        }
        done = true;
        elem.off('.dialog');
        if (elem[0].open) {
          elem[0].close();
        }
        resolve(value);
      }
      elem.html('<form novalidate><h2>' + esc(options.title) + '</h2>' + (options.body || '') +
        '<p class="error dialog__error" role="alert" hidden></p>' +
        '<div class="dialog__actions"><button class="dialog__cancel button button_type_ghost" type="button">' + esc(options.cancel || T('Скасувати')) + '</button>' +
        '<button class="button ' + (options.danger ? 'button_type_danger' : 'button_type_primary') + '">' + esc(options.ok || T('Зберегти')) + '</button></div></form>');
      form = elem.find('form');
      form.on('submit', function (e) {
        var values = {};
        var message;
        e.preventDefault();
        $.each(form.serializeArray(), function (i, field) {
          values[field.name] = field.value;
        });
        message = options.validate ? options.validate(values) : '';
        if (message) {
          elem.find('.dialog__error').text(message).prop('hidden', false);
          return;
        }
        finish(values);
      });
      elem.find('.dialog__cancel').on('click', function () {
        finish(null);
      });
      elem.on('close.dialog', function () {
        finish(null);
      });
      elem[0].showModal();
      elem.find('input, select, textarea').first().focus();
    });
  };

  Dialog.prototype.confirm = function (title, text, ok, danger) {
    return this.open({title: title, body: '<p>' + esc(text) + '</p>', ok: ok || T('Так'), danger: danger}).then(function (values) {
      return !!values;
    });
  };

  function Header(elem) {
    var that = this;
    this.elem = elem;
    this.eNav = elem.find('.header__nav');
    this.eMenu = elem.find('.header__menu');
    this.eLang = elem.find('.header__lang');
    this.eMenu.on('click', function () {
      that.toggle(!elem.hasClass('header_open_yes'));
    });
    this.eLang.on('click', function () {
      I18n.setLang(I18n.lang() === 'uk' ? 'en' : 'uk');
      translateStatic();
      refresh();
    });
    $(document).on('keydown', function (e) {
      if (e.key === 'Escape') {
        that.toggle(false);
      }
    });
  }

  Header.prototype.toggle = function (open) {
    this.elem.toggleClass('header_open_yes', open);
    this.eMenu.attr('aria-expanded', String(open));
    this.renderLabels();
  };

  Header.prototype.renderLabels = function () {
    var lang = I18n.lang();
    this.eMenu.text(this.elem.hasClass('header_open_yes') ? T('Закрити') : T('Меню'));
    this.eLang
      .text(lang === 'uk' ? 'EN' : 'UA')
      .attr('aria-label', lang === 'uk' ? 'Switch to English' : 'Перемкнути на українську')
      .attr('title', lang === 'uk' ? 'English' : 'Українська');
  };

  Header.prototype.render = function () {
    var links = [
      ['', T('Головна'), ''],
      ['catalog', T('Каталог'), ''],
      ['builder', T('Конструктор'), state.set.items.length || ''],
      ['compare', T('Порівняння'), state.compare.length || ''],
      ['account', state.user ? T('Мої набори') : T('Вхід'), '']
    ];
    var html = '';
    if (isAdmin()) {
      links.push(['admin', T('Адмін'), '']);
    }
    $.each(links, function (i, link) {
      var active = route.name === link[0] || (link[0] === 'catalog' && route.name === 'service');
      html += '<a class="header__link' + (active ? ' header__link_active_yes' : '') + '" href="#/' + link[0] + '"' + (active ? ' aria-current="page"' : '') + '>' +
        link[1] + (link[2] !== '' ? '<span class="header__count">' + link[2] + '</span>' : '') + '</a>';
    });
    this.eNav.html(html);
  };

  function Wizard(elem) {
    var that = this;
    this.elem = elem;
    elem.on('click', '.choice', function () {
      that.choose($(this).attr('data-kind'), $(this).attr('data-id'));
    });
    elem.on('click', '.wizard__back', function () {
      state.wizard.step = Math.max(1, state.wizard.step - 1);
      that.render();
    });
    elem.on('click', '.wizard__go', function () {
      var rec = Calc.recommend(state.data.wizard, state.data.services, state.wizard);
      replaceSet({items: rec.items, plan: rec.plan, seats: rec.seats, yearly: true}, T('За вашими відповідями'));
    });
  }

  Wizard.prototype.choose = function (kind, id) {
    if (kind === 'mode') {
      state.wizard = {step: 2, mode: id, role: null, sphere: null};
    } else if (kind === 'role') {
      state.wizard.role = id;
      state.wizard.step = 3;
    } else {
      state.wizard.sphere = id;
    }
    this.render();
  };

  Wizard.prototype.choice = function (kind, item, selected, icon) {
    return '<button class="choice' + (selected ? ' choice_selected_yes' : '') + '" type="button" data-kind="' + kind + '" data-id="' + item.id + '" aria-pressed="' + selected + '">' +
      (icon ? '<span class="choice__icon" aria-hidden="true">' + icon + '</span>' : '') +
      '<span><span class="choice__title">' + esc(L(item, 'title')) + '</span>' +
      (item.text ? '<span class="choice__text">' + esc(L(item, 'text')) + '</span>' : '') + '</span></button>';
  };

  Wizard.prototype.render = function () {
    var that = this;
    var wizard = state.wizard;
    var data = state.data.wizard;
    var html = '<div class="wizard__steps" aria-hidden="true">';
    var mode = null;
    var role = null;
    var picked = '';
    $.each(data.modes, function (i, item) {
      if (item.id === wizard.mode) {
        mode = item;
      }
    });
    $.each(data.roles, function (i, item) {
      if (item.id === wizard.role) {
        role = item;
      }
    });
    $.each([1, 2, 3], function (i, step) {
      html += '<span class="wizard__step' + (wizard.step >= step ? ' wizard__step_done_yes' : '') + '"></span>';
    });
    html += '</div>';
    if (mode) {
      picked += '<span class="tag tag_type_accent">' + esc(L(mode, 'title')) + '</span>';
    }
    if (role) {
      picked += '<span class="tag tag_type_accent">' + esc(L(role, 'title')) + '</span>';
    }
    if (wizard.step === 1) {
      html += '<h2>' + T('Для чого потрібен набір?') + '</h2>';
      $.each(data.modes, function (i, item) {
        html += that.choice('mode', item, wizard.mode === item.id, item.icon);
      });
    } else if (wizard.step === 2) {
      html += '<h2>' + T('Хто ви?') + '</h2><div class="wizard__picked">' + picked + '</div>';
      $.each(data.roles, function (i, item) {
        if (item.mode === wizard.mode) {
          html += that.choice('role', item, wizard.role === item.id);
        }
      });
      html += '<div class="wizard__actions"><button class="wizard__back button button_size_small button_type_ghost" type="button">' + T('← Назад') + '</button></div>';
    } else {
      html += '<h2>' + T('Яка ваша сфера?') + '</h2><div class="wizard__picked">' + picked + '</div>';
      $.each(data.spheres, function (i, item) {
        html += that.choice('sphere', item, wizard.sphere === item.id, item.icon);
      });
      html += '<div class="wizard__actions"><button class="wizard__back button button_size_small button_type_ghost" type="button">' + T('← Назад') + '</button>' +
        '<button class="wizard__go button button_type_primary" type="button"' + (wizard.sphere ? '' : ' disabled') + '>' + T('Зібрати набір') + '</button></div>';
    }
    this.elem.html(html);
  };

  function Home(elem) {
    this.elem = elem;
    this.eCount = elem.find('.hero__count');
    this.eServices = elem.find('.hero__services');
    this.ePresets = elem.find('.presets');
    this.eCats = elem.find('.cats');
    this.wizard = new Wizard(elem.find('.wizard'));
    elem.find('.business__button').on('click', function () {
      Home.prototype.take('own-business');
    });
    this.ePresets.on('click', '.preset__take', function () {
      Home.prototype.take($(this).attr('data-id'));
    });
    this.eCats.on('click', '.cats__item', function () {
      state.filters = newFilters($(this).attr('data-id'));
    });
  }

  Home.prototype.take = function (id) {
    var found = null;
    $.each(state.data.presets, function (i, item) {
      if (item.id === id) {
        found = item;
      }
    });
    if (found) {
      replaceSet({
        items: $.map(found.items, function (item) {
          return {id: item.id, free: !!item.free};
        }),
        plan: found.plan,
        seats: found.seats || 3,
        yearly: true
      }, L(found, 'name'));
    }
  };

  Home.prototype.render = function () {
    var presets = '';
    var cats = '';
    this.eCount.text(state.set.items.length ? ' (' + state.set.items.length + ')' : '');
    this.eServices.text(T('{n} сервісів у {c} категоріях', {n: state.data.services.length, c: state.data.categories.length}));
    $.each(state.data.presets, function (i, preset) {
      var items = $.grep(preset.items, function (item) {
        return service(item.id);
      });
      var sum = Calc.setTotals(items, state.byId, {plan: preset.plan, seats: preset.seats || 3, useYearly: true});
      presets += '<article class="card preset">' +
        '<div class="preset__top"><h3>' + esc(L(preset, 'name')) + '</h3><span class="tag">' + planLabel(preset.plan) + (preset.plan === 'team' ? ', ' + T('{n} ос.', {n: preset.seats || 3}) : '') + '</span></div>' +
        '<p class="muted small">' + esc(L(preset, 'tagline')) + '</p>' +
        '<div><span class="preset__price num">' + money(sum.monthly) + '</span> <span class="muted">' + T('/міс') + '</span>' +
        '<div class="muted small num">' + T('{y} на рік · {n} {w}', {y: money(sum.yearly), n: sum.count, w: serviceWord(sum.count)}) + '</div></div>' +
        '<button class="preset__take button button_type_primary" type="button" data-id="' + preset.id + '">' + T('Взяти цей набір') + '</button></article>';
    });
    $.each(state.data.categories, function (i, item) {
      var names = $.map($.grep(state.data.services, function (s) {
        return s.category === item.id;
      }), function (s) {
        return esc(s.name);
      });
      cats += '<a class="cats__item" href="#/catalog" data-id="' + item.id + '"><span class="cats__name">' + esc(L(item, 'name')) + '</span><span class="muted small">' + names.join(', ') + '</span></a>';
    });
    this.ePresets.html(presets);
    this.eCats.html(cats);
    this.wizard.render();
  };

  function Catalog(elem) {
    var that = this;
    this.elem = elem;
    this.eSearch = elem.find('.catalog__search');
    this.ePlan = elem.find('.catalog__plan');
    this.eCats = elem.find('.catalog__cats');
    this.eMax = elem.find('.catalog__max');
    this.eMaxValue = elem.find('.catalog__max-value');
    this.eFree = elem.find('.catalog__free');
    this.eStudent = elem.find('.catalog__student');
    this.eTeam = elem.find('.catalog__team');
    this.eSort = elem.find('.catalog__sort');
    this.eCount = elem.find('.results__count');
    this.eList = elem.find('.results__list');
    this.eSearch.on('input', function () {
      state.filters.q = this.value;
      that.renderResults();
    });
    this.eMax.on('input', function () {
      state.filters.max = Number(this.value) >= that.maxPrice() ? null : Number(this.value);
      that.renderMax();
      that.renderResults();
    });
    this.eFree.on('change', function () {
      state.filters.free = this.checked;
      that.renderResults();
    });
    this.eStudent.on('change', function () {
      state.filters.student = this.checked;
      that.renderResults();
    });
    this.eTeam.on('change', function () {
      state.filters.team = this.checked;
      that.renderResults();
    });
    this.eSort.on('change', function () {
      state.filters.sort = this.value;
      that.renderResults();
    });
    this.eCats.on('click', '.chip', function () {
      state.filters.cat = $(this).attr('data-id');
      that.renderCats();
      that.renderResults();
    });
    elem.find('.catalog__reset').on('click', function () {
      state.filters = newFilters();
      that.render();
    });
  }

  Catalog.prototype.maxPrice = function () {
    var max = 10;
    $.each(state.data.services, function (i, item) {
      max = Math.max(max, Calc.priceFor(item, {plan: state.set.plan, seats: 1, useYearly: false}).monthly);
    });
    return Math.ceil(max / 5) * 5;
  };

  Catalog.prototype.renderCats = function () {
    var html = '<button class="chip' + (state.filters.cat === 'all' ? ' chip_active_yes' : '') + '" type="button" data-id="all">' + T('Усі') + '</button>';
    $.each(state.data.categories, function (i, item) {
      html += '<button class="chip' + (state.filters.cat === item.id ? ' chip_active_yes' : '') + '" type="button" data-id="' + item.id + '">' + esc(L(item, 'name')) + '</button>';
    });
    this.eCats.html(html);
  };

  Catalog.prototype.renderMax = function () {
    var max = this.maxPrice();
    var current = state.filters.max;
    this.eMax.attr('max', max).val(current == null ? max : Math.min(current, max));
    this.eMaxValue.text(current == null ? T('без обмеження') : money(current));
  };

  Catalog.prototype.renderSort = function () {
    var html = '';
    $.each([['name', 'За назвою'], ['price-asc', 'Спочатку дешевші'], ['price-desc', 'Спочатку дорожчі'], ['discount', 'Більша студентська знижка']], function (i, option) {
      html += '<option value="' + option[0] + '">' + T(option[1]) + '</option>';
    });
    this.eSort.html(html).val(state.filters.sort);
  };

  Catalog.prototype.filtered = function () {
    var filters = state.filters;
    var q = $.trim(filters.q).toLowerCase();
    var options = {plan: state.set.plan, seats: 1, useYearly: false};
    var list = $.grep(state.data.services, function (item) {
      if (filters.cat !== 'all' && item.category !== filters.cat) {
        return false;
      }
      if (q && (item.name + ' ' + L(item, 'desc')).toLowerCase().indexOf(q) === -1) {
        return false;
      }
      if (filters.free && !item.free) {
        return false;
      }
      if (filters.student && !(item.studentDiscount > 0)) {
        return false;
      }
      if (filters.team && !(item.team && item.team.price != null)) {
        return false;
      }
      return filters.max == null || Calc.priceFor(item, options).monthly <= filters.max;
    });
    function monthly(item) {
      return Calc.priceFor(item, options).monthly;
    }
    list.sort(function (a, b) {
      if (filters.sort === 'price-asc') {
        return monthly(a) - monthly(b);
      }
      if (filters.sort === 'price-desc') {
        return monthly(b) - monthly(a);
      }
      if (filters.sort === 'discount') {
        return (b.studentDiscount || 0) - (a.studentDiscount || 0);
      }
      return a.name.localeCompare(b.name, I18n.lang());
    });
    return list;
  };

  Catalog.prototype.renderResults = function () {
    var list = this.filtered();
    var html = '';
    this.eCount.html(T('Знайдено: {n} з {total}', {n: '<b>' + list.length + '</b>', total: state.data.services.length}));
    if (!list.length) {
      this.eList.html('<div class="card empty"><div class="empty__icon">🐾</div><h3>' + T('Нічого не знайшлося') + '</h3><p>' + T('Спробуйте послабити фільтри.') + '</p></div>');
      return;
    }
    $.each(list, function (i, item) {
      html += serviceCard(item);
    });
    this.eList.html(html);
  };

  Catalog.prototype.render = function () {
    this.eSearch.val(state.filters.q);
    this.ePlan.html(switchHtml(state.set.plan));
    this.eFree.prop('checked', state.filters.free);
    this.eStudent.prop('checked', state.filters.student);
    this.eTeam.prop('checked', state.filters.team);
    this.renderCats();
    this.renderMax();
    this.renderSort();
    this.renderResults();
  };

  function ServicePage(elem) {
    this.elem = elem.find('.service-page');
  }

  ServicePage.prototype.render = function (id) {
    var item = service(id);
    var html;
    var individual;
    var student;
    var team;
    var hasTeam;
    var added;
    var compared;
    var similar = '';
    if (!item) {
      this.elem.html('<div class="card empty"><div class="empty__icon">🐾</div><h1>' + T('Підписку не знайдено') + '</h1><p><a href="#/catalog">' + T('Повернутися до каталогу') + '</a></p></div>');
      return;
    }
    individual = Calc.priceFor(item, {plan: 'individual', useYearly: true});
    student = Calc.priceFor(item, {plan: 'student', useYearly: true});
    team = Calc.priceFor(item, {plan: 'team', seats: 1, useYearly: true});
    hasTeam = item.team && item.team.price != null;
    added = inSet(item.id);
    compared = $.inArray(item.id, state.compare) !== -1;
    $.each(state.data.services, function (i, other) {
      if (other.category === item.category && other.id !== item.id) {
        similar += serviceCard(other);
      }
    });
    html = '<p><a href="#/catalog">' + T('← До каталогу') + '</a></p>' +
      '<div class="card">' +
      '<div class="service__head">' + logo(item, true) + '<div><h1>' + esc(item.name) + '</h1><span class="muted">' + esc(categoryName(item.category)) + '</span></div></div>' +
      '<div class="tags">' + badges(item) + '</div>' +
      '<p>' + esc(L(item, 'desc')) + '</p>' +
      '<div class="table-box"><table class="table"><thead><tr><th>' + T('План') + '</th><th>' + T('На місяць') + '</th><th>' + T('На рік') + '</th><th>' + T('Примітка') + '</th></tr></thead><tbody>' +
      (item.free ? '<tr><td>' + T('Безкоштовний') + '</td><td class="num">' + money(0) + '</td><td class="num">' + money(0) + '</td><td>' + esc(L(item, 'freeNote')) + '</td></tr>' : '') +
      '<tr><td>' + planLabel('individual') + '</td><td class="num">' + money(individual.monthly) + '</td><td class="num">' + money(individual.yearly) + '</td><td>' + (individual.annualTariff ? T('річний тариф дешевший на {x}', {x: money(individual.saveByAnnual)}) : T('річного тарифу немає — 12 × місяць')) + '</td></tr>' +
      '<tr><td>' + planLabel('student') + '</td><td class="num">' + money(student.monthly) + '</td><td class="num">' + money(student.yearly) + '</td><td>' + (student.discount ? T('знижка {n}% (потрібне підтвердження статусу)', {n: student.discount}) : T('студентської знижки немає')) + '</td></tr>' +
      '<tr><td>' + planLabel('team') + '</td><td class="num">' + (hasTeam ? money(team.monthly) : '—') + '</td><td class="num">' + (hasTeam ? money(team.yearly) : '—') + '</td><td>' + (hasTeam ? T('ціна за одну людину') : T('командного плану немає')) + '</td></tr>' +
      '</tbody></table></div>' +
      this.source(item) +
      '<div class="service__actions">' +
      '<button class="service__toggle button button_type_primary" type="button" data-id="' + item.id + '">' + (added ? T('Прибрати з набору') : T('+ До набору')) + '</button>' +
      '<button class="service__compare button button_type_ghost" type="button" data-id="' + item.id + '">' + (compared ? T('Прибрати з порівняння') : T('Порівняти')) + '</button>' +
      '<a class="button button_type_ghost" href="' + esc(safeUrl(item.url)) + '" target="_blank" rel="noopener noreferrer">' + T('Сайт сервісу ↗') + '</a>' +
      '</div></div>' +
      (similar ? '<section class="section"><h2>' + T('Схожі в категорії «{c}»', {c: esc(categoryName(item.category))}) + '</h2><div class="grid">' + similar + '</div></section>' : '');
    this.elem.html(html);
  };

  ServicePage.prototype.source = function (item) {
    var source = SOURCES[item.priceSource] || SOURCES.unverified;
    var note = L(item, 'priceNote');
    return '<p><span class="tag ' + source[0] + '">' + T(source[1]) + '</span> <span class="muted small">' + formatDate(item.priceDate) + '</span></p>' +
      (note ? '<p class="muted small">' + esc(note) + '</p>' : '') +
      '<p class="muted small">' + T('Ціни в доларах США, без податків. Актуальні умови — на офіційному сайті.') + '</p>';
  };

  function Builder(elem) {
    var that = this;
    this.elem = elem;
    this.eSet = elem.find('.set');
    this.eAdder = elem.find('.adder');
    this.eCats = elem.find('.builder__cats');
    this.eSearch = elem.find('.builder__search');
    this.eClear = elem.find('.builder__clear');
    this.eCalc = elem.find('.calc');
    this.eClear.on('click', function () {
      dialog.confirm(T('Очистити набір?'), T('Усі сервіси буде прибрано з набору.'), T('Очистити'), true).then(function (ok) {
        if (ok) {
          state.set.items = [];
          save();
          refresh();
        }
      });
    });
    this.eSearch.on('input', function () {
      state.adder.q = this.value;
      that.renderAdder();
    });
    this.eCats.on('click', '.chip', function () {
      state.adder.cat = $(this).attr('data-id');
      that.renderCats();
      that.renderAdder();
    });
    this.eAdder.on('click', '.adder__item', function () {
      toggleInSet($(this).attr('data-id'));
      refresh();
    });
    this.eSet.on('click', '.item__remove', function () {
      var id = $(this).attr('data-id');
      state.set.items = $.grep(state.set.items, function (item) {
        return item.id !== id;
      });
      save();
      refresh();
    });
    this.eSet.on('change', '.item__free', function () {
      var id = $(this).attr('data-id');
      var checked = this.checked;
      $.each(state.set.items, function (i, item) {
        if (item.id === id) {
          item.free = checked;
        }
      });
      save();
      refresh();
    });
    this.eSet.on('click', '.licenses__minus', function () {
      setQty($(this).attr('data-id'), -1);
    });
    this.eSet.on('click', '.licenses__plus', function () {
      setQty($(this).attr('data-id'), 1);
    });
    this.eCalc.on('change', '.calc__student', function () {
      state.set.plan = this.checked ? 'student' : 'individual';
      save();
      refresh();
    });
    this.eCalc.on('change', '.calc__yearly', function () {
      state.set.yearly = this.checked;
      save();
      refresh();
    });
    this.eCalc.on('change', '.calc__seats', function () {
      setSeats(Number(this.value) || 1);
    });
    this.eCalc.on('click', '.calc__seats-minus', function () {
      setSeats(state.set.seats - 1);
    });
    this.eCalc.on('click', '.calc__seats-plus', function () {
      setSeats(state.set.seats + 1);
    });
    this.eCalc.on('click', '.calc__seats-preset', function () {
      setSeats(Number($(this).attr('data-id')));
    });
    this.eCalc.on('click', '.calc__save', function () {
      that.saveSet();
    });
  }

  Builder.prototype.saveSet = function () {
    if (!state.user) {
      toast(T('Спочатку увійдіть в акаунт'));
      state.account = 'login';
      location.hash = '#/account';
      return;
    }
    dialog.open({
      title: T('Зберегти набір'),
      body: '<div class="field"><label class="field__label" for="set-name">' + T('Назва набору') + '</label><input class="input" id="set-name" name="name" type="text" maxlength="60" value="' + esc(T('Мій набір')) + '"></div>',
      validate: function (values) {
        return $.trim(values.name || '') ? '' : T('Вкажіть назву набору.');
      }
    }).then(function (values) {
      if (!values) {
        return null;
      }
      return Api.saveUserSet($.trim(values.name), state.set).then(function () {
        toast(T('Набір збережено в акаунті'));
      }, function (error) {
        toast(error.message);
      });
    });
  };

  Builder.prototype.renderSet = function () {
    var that = this;
    var sum = totals();
    var duplicate = {};
    var html = '';
    if (!state.set.items.length) {
      this.eSet.html('<div class="empty"><div class="empty__icon">🐕</div><h3>' + T('Набір порожній') + '</h3><p>' + T('Дайте відповіді на питання майстра або додайте сервіси вручну.') + '</p>' +
        '<a class="button button_type_primary" href="#/">' + T('Зібрати за питаннями') + '</a> <a class="button button_type_ghost" href="#/catalog">' + T('Відкрити каталог') + '</a></div>');
      this.eClear.prop('disabled', true);
      return;
    }
    $.each(Calc.duplicates(state.set.items, state.byId), function (i, item) {
      duplicate[item.group] = true;
    });
    $.each(sum.rows, function (i, row) {
      html += that.item(row, duplicate);
    });
    this.eSet.html(html);
    this.eClear.prop('disabled', false);
  };

  Builder.prototype.item = function (row, duplicate) {
    var item = row.service;
    var price = row.price;
    var free = row.item.free;
    var teamMode = state.set.plan === 'team' && !free;
    var tags = '';
    var group = Calc.groupOf(item);
    if (duplicate[group]) {
      tags += '<span class="tag tag_type_warn" title="' + esc(T('У наборі кілька сервісів з однаковою роллю («{g}»). Це лише підказка: переконайтеся, що вони вам обидва потрібні.', {g: groupName(group)})) + '">' + T('⚠ дублюється') + '</span>';
    }
    if (free) {
      tags += '<span class="tag tag_type_good" title="' + esc(L(item, 'freeNote')) + '">' + T('безкоштовний план') + '</span>';
    } else {
      if (price.discount) {
        tags += '<span class="tag tag_type_good">' + T('−{n}% студентська знижка', {n: price.discount}) + '</span>';
      }
      if (price.noStudent) {
        tags += '<span class="tag">' + T('без студентської знижки') + '</span>';
      }
      if (price.noTeam) {
        tags += '<span class="tag">' + T('командного плану немає, окремі акаунти') + '</span>';
      }
      if (price.minApplied) {
        tags += '<span class="tag">' + T('мінімум {n} місць', {n: price.minApplied}) + '</span>';
      }
      if (price.seats > 1 && !teamMode) {
        tags += '<span class="tag">' + T('{n} ос.', {n: price.seats}) + '</span>';
      }
      if (price.annualTariff) {
        tags += '<span class="tag tag_type_good">' + T('річний тариф −{x}', {x: money(price.saveByAnnual)}) + '</span>';
      }
    }
    return '<div class="item">' + logo(item) +
      '<div class="item__body"><a class="item__name" href="#/service/' + encodeURIComponent(item.id) + '">' + esc(item.name) + '</a> <span class="muted small">' + esc(categoryName(item.category)) + '</span>' +
      '<div class="tags">' + tags + '</div>' +
      '<div class="item__controls">' +
      (teamMode ? '<span class="licenses" role="group" aria-label="' + esc(T('Ліцензій для {name}', {name: item.name})) + '">' +
        '<button class="licenses__minus button button_size_small" type="button" data-id="' + item.id + '" aria-label="' + T('Менше ліцензій') + '">−</button>' +
        '<span class="licenses__count num" aria-live="polite">' + price.seats + '</span>' +
        '<button class="licenses__plus button button_size_small" type="button" data-id="' + item.id + '" aria-label="' + T('Більше ліцензій') + '">+</button>' +
        '<span class="muted small">' + T('ліцензій') + '</span></span>' : '') +
      (item.free ? '<label class="check"><input class="item__free" type="checkbox" data-id="' + item.id + '"' + (free ? ' checked' : '') + '> ' + T('Безкоштовний план') + '</label>' : '') +
      '<button class="item__remove button button_size_small button_type_danger" type="button" data-id="' + item.id + '" aria-label="' + esc(T('Прибрати {name} з набору', {name: item.name})) + '">' + T('Прибрати') + '</button>' +
      '</div></div>' +
      '<div class="item__cost num">' + money(price.monthly) + '<small>' + T('/міс') + ' · ' + money(price.yearly) + T('/рік') + '</small></div></div>';
  };

  Builder.prototype.renderCats = function () {
    var html = '<button class="chip' + (state.adder.cat === 'all' ? ' chip_active_yes' : '') + '" type="button" data-id="all">' + T('Усі') + '</button>';
    $.each(state.data.categories, function (i, item) {
      html += '<button class="chip' + (state.adder.cat === item.id ? ' chip_active_yes' : '') + '" type="button" data-id="' + item.id + '">' + esc(L(item, 'name')) + '</button>';
    });
    this.eCats.html(html);
  };

  Builder.prototype.renderAdder = function () {
    var q = $.trim(state.adder.q).toLowerCase();
    var html = '';
    $.each(state.data.services, function (i, item) {
      if (inSet(item.id) || (state.adder.cat !== 'all' && item.category !== state.adder.cat) || (q && item.name.toLowerCase().indexOf(q) === -1)) {
        return;
      }
      html += '<button class="adder__item" type="button" data-id="' + item.id + '">' + logo(item) +
        '<span><b>' + esc(item.name) + '</b><br><span class="muted small num">' + priceInline(item, state.set.plan, 1) + (state.set.plan === 'team' ? ' ' + T('/ особа') : '') + '</span></span></button>';
    });
    this.eAdder.html(html || '<p class="muted">' + T('Нічого додавати — або все вже в наборі, або пошук нічого не знайшов.') + '</p>');
  };

  Builder.prototype.renderCalc = function () {
    var sum = totals();
    var plain = totals({plan: 'individual', seats: 1, useYearly: state.set.yearly});
    var saved = state.set.plan === 'student' ? Calc.r2(plain.monthly - sum.monthly) : 0;
    var team = state.set.plan === 'team';
    var dups = Calc.duplicates(state.set.items, state.byId);
    var html = '<h2>' + T('Калькулятор') + '</h2>' +
      '<div class="field"><span class="field__label">' + T('План') + '</span>' + switchHtml(state.set.plan) + '</div>' +
      '<label class="check"><input class="calc__student" type="checkbox"' + (state.set.plan === 'student' ? ' checked' : '') + '> ' + T('Студентська знижка') + '</label>';
    if (team) {
      html += '<div class="field"><label class="field__label" for="calc-seats">' + T('Кількість людей у команді') + '</label>' +
        '<div class="stepper"><button class="calc__seats-minus button button_size_small" type="button" aria-label="' + T('Менше людей') + '">−</button>' +
        '<input class="calc__seats input" id="calc-seats" type="number" min="1" max="500" value="' + state.set.seats + '">' +
        '<button class="calc__seats-plus button button_size_small" type="button" aria-label="' + T('Більше людей') + '">+</button></div>' +
        '<div class="chips" role="group" aria-label="' + T('Швидкий вибір кількості людей') + '">';
      $.each([3, 5, 10, 25, 50], function (i, count) {
        html += '<button class="calc__seats-preset chip' + (state.set.seats === count ? ' chip_active_yes' : '') + '" type="button" data-id="' + count + '">' + count + '</button>';
      });
      html += '</div><span class="field__hint">' + T('Сервіси без командного плану рахуються як 1 акаунт.') + '</span></div>';
    }
    html += '<label class="check"><input class="calc__yearly" type="checkbox"' + (state.set.yearly ? ' checked' : '') + '> ' + T('Річні тарифи (де вони є)') + '</label>' +
      '<div class="total"><span>' + T('На місяць') + '</span><span class="total__value num">' + money(sum.monthly) + '</span></div>' +
      '<div class="total total_period_year"><span>' + T('На рік') + '</span><span class="total__value num">' + money(sum.yearly) + '</span></div>';
    if (team && sum.count) {
      html += '<p class="num">' + T('На одну людину: {x} на місяць', {x: '<b>' + money(Calc.r2(sum.monthly / state.set.seats)) + '</b>'}) + '</p>';
    }
    html += '<p class="muted small num">' + T('{n} {w} у наборі', {n: sum.count, w: serviceWord(sum.count)}) + '</p>';
    if (saved > 0) {
      html += '<p class="notice notice_type_good">' + T('Студентська знижка економить {x} на місяць.', {x: money(saved)}) + '</p>';
    }
    if (sum.saveByAnnual > 0) {
      html += '<p class="notice notice_type_good">' + T('Річні тарифи економлять {x} на рік.', {x: money(sum.saveByAnnual)}) + '</p>';
    }
    if (dups.length) {
      html += '<p class="notice">' + T('⚠ Дублюється:') + ' ' + $.map(dups, function (item) {
        return esc(groupName(item.group)) + ' (' + $.map(item.ids, function (id) {
          return esc(service(id).name);
        }).join(', ') + ')';
      }).join('; ') + '</p>';
    }
    html += '<button class="calc__save button button_type_primary button_size_wide" type="button"' + (sum.count ? '' : ' disabled') + '>' + (state.user ? T('Зберегти набір в акаунті') : T('Увійти й зберегти набір')) + '</button>' +
      '<p class="muted small">' + T('Поточний набір автоматично зберігається в цьому браузері.') + '</p>';
    this.eCalc.html(html);
  };

  Builder.prototype.render = function () {
    this.eSearch.val(state.adder.q);
    this.renderSet();
    this.renderCats();
    this.renderAdder();
    this.renderCalc();
  };

  function Compare(elem) {
    this.elem = elem;
    this.eFirst = elem.find('.compare__first');
    this.eSecond = elem.find('.compare__second');
    this.eResult = elem.find('.compare__result');
    this.eFirst.on('change', function () {
      Compare.prototype.pick(0, this.value);
    });
    this.eSecond.on('change', function () {
      Compare.prototype.pick(1, this.value);
    });
  }

  Compare.prototype.pick = function (index, id) {
    var list = [state.compare[0] || '', state.compare[1] || ''];
    list[index] = id;
    if (list[0] && list[0] === list[1]) {
      toast(T('Оберіть два різні сервіси'));
      list[index] = '';
    }
    state.compare = $.grep(list, function (item) {
      return item;
    });
    save();
    refresh();
  };

  Compare.prototype.options = function (selected) {
    var html = '<option value="">' + T('— оберіть сервіс —') + '</option>';
    var list = state.data.services.slice().sort(function (a, b) {
      return a.name.localeCompare(b.name, I18n.lang());
    });
    $.each(list, function (i, item) {
      html += '<option value="' + item.id + '"' + (selected === item.id ? ' selected' : '') + '>' + esc(item.name) + '</option>';
    });
    return html;
  };

  Compare.prototype.render = function () {
    var a = service(state.compare[0]);
    var b = service(state.compare[1]);
    var rows = [];
    var body = '';
    var yearA;
    var yearB;
    var verdict;
    this.eFirst.html(this.options(state.compare[0]));
    this.eSecond.html(this.options(state.compare[1]));
    if (!a || !b) {
      this.eResult.html('<div class="card empty"><div class="empty__icon">⚖️</div><h3>' + T('Оберіть два сервіси') + '</h3><p>' + T("Тоді з'явиться таблиця з цінами й перевагами.") + '</p></div>');
      return;
    }
    function price(item, plan) {
      return Calc.priceFor(item, {plan: plan, seats: 1, useYearly: true});
    }
    function hasTeam(item) {
      return item.team && item.team.price != null;
    }
    function freeText(item) {
      return item.free ? T('Так') + (L(item, 'freeNote') ? ' — ' + L(item, 'freeNote') : '') : T('Ні');
    }
    function discountText(item) {
      return item.studentDiscount > 0 ? item.studentDiscount + '%' : T('немає');
    }
    function show(row, value) {
      if (typeof value === 'number') {
        return row.kind === 'percent' ? value + '%' : money(value);
      }
      return value == null ? '<span class="muted">' + T('немає плану') + '</span>' : esc(value);
    }
    rows.push([T('Категорія'), categoryName(a.category), categoryName(b.category), '']);
    rows.push([T('Безкоштовний план'), freeText(a), freeText(b), '']);
    rows.push([T('Індивідуальний, на місяць'), price(a, 'individual').monthly, price(b, 'individual').monthly, 'min']);
    rows.push([T('Індивідуальний, на рік'), price(a, 'individual').yearly, price(b, 'individual').yearly, 'min']);
    rows.push([T('Студентський, на місяць'), price(a, 'student').monthly, price(b, 'student').monthly, 'min']);
    rows.push([T('Студентська знижка'), discountText(a), discountText(b), 'percent']);
    rows.push([T('Командний, за людину / міс'), hasTeam(a) ? price(a, 'team').monthly : null, hasTeam(b) ? price(b, 'team').monthly : null, 'min']);
    rows.push([T('Економія з річним тарифом'), price(a, 'individual').saveByAnnual, price(b, 'individual').saveByAnnual, 'max']);
    $.each(rows, function (i, row) {
      var cellA = '';
      var cellB = '';
      var kind = row[3];
      var valueA = row[1];
      var valueB = row[2];
      var discountA = a.studentDiscount || 0;
      var discountB = b.studentDiscount || 0;
      if (kind === 'percent') {
        cellA = discountA > discountB ? 'table__cell_best_yes' : '';
        cellB = discountB > discountA ? 'table__cell_best_yes' : '';
      } else if (kind && typeof valueA === 'number' && typeof valueB === 'number' && valueA !== valueB) {
        if (kind === 'min' ? valueA < valueB : valueA > valueB) {
          cellA = 'table__cell_best_yes';
        } else {
          cellB = 'table__cell_best_yes';
        }
      } else if (kind === 'min' && typeof valueA === 'number' && valueB == null) {
        cellA = 'table__cell_best_yes';
      } else if (kind === 'min' && typeof valueB === 'number' && valueA == null) {
        cellB = 'table__cell_best_yes';
      }
      body += '<tr><th>' + row[0] + '</th><td class="num ' + cellA + '">' + show({kind: kind}, valueA) + '</td><td class="num ' + cellB + '">' + show({kind: kind}, valueB) + '</td></tr>';
    });
    yearA = price(a, state.set.plan).yearly;
    yearB = price(b, state.set.plan).yearly;
    verdict = yearA === yearB ? T('За поточним планом на рік вони коштують однаково.') :
      T('За планом «{plan}» на рік дешевше {name} — на {diff}.', {plan: planLabel(state.set.plan), name: '<b>' + esc((yearA < yearB ? a : b).name) + '</b>', diff: money(Math.abs(yearA - yearB))});
    function actions(item) {
      var added = inSet(item.id);
      return '<td><button class="service__toggle button button_size_small ' + (added ? 'button_active_yes' : 'button_type_primary') + '" type="button" data-id="' + item.id + '">' + (added ? T('✓ У наборі') : T('+ До набору')) + '</button> ' +
        '<a class="button button_size_small button_type_ghost" href="' + esc(safeUrl(item.url)) + '" target="_blank" rel="noopener noreferrer">' + T('Сайт ↗') + '</a></td>';
    }
    this.eResult.html('<div class="card table-box"><table class="table"><thead><tr><th></th>' +
      '<th><a href="#/service/' + a.id + '">' + esc(a.name) + '</a></th><th><a href="#/service/' + b.id + '">' + esc(b.name) + '</a></th></tr></thead><tbody>' + body +
      '<tr><th>' + T('Дії') + '</th>' + actions(a) + actions(b) + '</tr></tbody></table>' +
      '<p class="notice notice_type_good">' + verdict + '</p>' +
      '<p class="muted small">' + T('Зелений колір — вигідніше значення в рядку. «Річний» враховує річний тариф, якщо він є.') + '</p></div>');
  };

  function Account(elem) {
    var that = this;
    this.elem = elem;
    this.eAuth = elem.find('.auth');
    this.eUser = elem.find('.user');
    this.eTabs = elem.find('.auth__tab');
    this.eForm = elem.find('.auth__form');
    this.eName = elem.find('.auth__name');
    this.eHint = elem.find('.auth__hint');
    this.eError = elem.find('.auth__error');
    this.eSubmit = elem.find('.auth__submit');
    this.eNote = elem.find('.auth__note');
    this.eInfo = elem.find('.user__info');
    this.eSets = elem.find('.user__sets');
    this.eTabs.on('click', function () {
      state.account = $(this).attr('data-tab');
      that.renderForm();
    });
    this.eForm.on('submit', function (e) {
      var values = {};
      e.preventDefault();
      $.each($(this).serializeArray(), function (i, field) {
        values[field.name] = field.value;
      });
      (state.account === 'register' ? Api.register(values) : Api.login(values)).then(function (user) {
        state.user = user;
        toast(T('Вітаємо, {name}!', {name: user.name}));
        that.eForm[0].reset();
        refresh();
      }, function (error) {
        that.eError.text(error.message).prop('hidden', false);
      });
    });
    elem.find('.user__logout').on('click', function () {
      Api.logout().then(function () {
        state.user = null;
        toast(T('Ви вийшли з акаунта'));
        refresh();
      });
    });
    this.eSets.on('click', '.saved__open', function () {
      var id = $(this).attr('data-id');
      Api.listSets().then(function (sets) {
        $.each(sets, function (i, item) {
          if (item.id === id) {
            replaceSet(item.state, item.name);
          }
        });
      });
    });
    this.eSets.on('click', '.saved__delete', function () {
      var id = $(this).attr('data-id');
      dialog.confirm(T('Видалити набір?'), T('Цю дію не можна скасувати.'), T('Видалити'), true).then(function (ok) {
        if (ok) {
          Api.deleteUserSet(id).then(function () {
            toast(T('Набір видалено'));
            that.renderSets();
          });
        }
      });
    });
  }

  Account.prototype.renderForm = function () {
    var register = state.account === 'register';
    var hint = isLocalHost() ? ' ' + (Api.mode() === 'server' ?
      T('Адмін: {mail}, пароль із запуску сервера (за замовчуванням {pw}).', {mail: '<span class="kbd">admin@subdog.local</span>', pw: '<span class="kbd">admin123</span>'}) :
      T('Тестовий адмін: {mail} / {pw}', {mail: '<span class="kbd">admin@subdog.local</span>', pw: '<span class="kbd">admin123</span>'})) : '';
    this.eTabs.each(function () {
      $(this).toggleClass('chip_active_yes', $(this).attr('data-tab') === state.account);
    });
    this.eName.toggle(register);
    this.eHint.toggle(register);
    this.eSubmit.text(register ? T('Створити акаунт') : T('Увійти'));
    this.eError.prop('hidden', true);
    this.eNote.html((Api.mode() === 'server' ? T('Акаунти й набори зберігаються на сервері.') : T('Сервер не підключено: дані лежать лише в цьому браузері.')) + hint);
  };

  Account.prototype.renderSets = function () {
    var that = this;
    this.eSets.html('<p class="muted">' + T('Завантаження…') + '</p>');
    Api.listSets().then(function (sets) {
      var html = '';
      if (!sets.length) {
        that.eSets.html('<div class="card empty"><div class="empty__icon">📂</div><h3>' + T('Збережених наборів ще немає') + '</h3><p>' + T('Зберіть набір у конструкторі й натисніть «Зберегти набір в акаунті».') + '</p><a class="button button_type_primary" href="#/builder">' + T('До конструктора') + '</a></div>');
        return;
      }
      $.each(sets, function (i, item) {
        var set = sanitizeSet(item.state);
        var sum = Calc.setTotals(set.items, state.byId, {plan: set.plan, seats: set.seats, useYearly: set.yearly});
        html += '<article class="card preset"><div class="preset__top"><h3>' + esc(item.name) + '</h3><span class="tag">' + planLabel(set.plan) + '</span></div>' +
          '<div><span class="preset__price num">' + money(sum.monthly) + '</span> <span class="muted">' + T('/міс') + '</span>' +
          '<div class="muted small num">' + T('{y} на рік · {n} {w}', {y: money(sum.yearly), n: sum.count, w: serviceWord(sum.count)}) + '</div></div>' +
          '<div class="muted small">' + T('Збережено {d}', {d: new Date(item.createdAt).toLocaleDateString(I18n.locale())}) + '</div>' +
          '<div><button class="saved__open button button_size_small button_type_primary" type="button" data-id="' + item.id + '">' + T('Відкрити') + '</button> ' +
          '<button class="saved__delete button button_size_small button_type_danger" type="button" data-id="' + item.id + '">' + T('Видалити') + '</button></div></article>';
      });
      that.eSets.html(html);
    });
  };

  Account.prototype.render = function () {
    this.eAuth.toggle(!state.user);
    this.eUser.toggle(!!state.user);
    if (state.user) {
      this.eInfo.text(state.user.name + ' · ' + state.user.email + (isAdmin() ? ' · ' + T('адмін') : ''));
      this.renderSets();
    } else {
      this.renderForm();
    }
  };

  function Admin(elem) {
    var that = this;
    this.elem = elem;
    this.eGuard = elem.find('.admin__guard');
    this.ePanel = elem.find('.admin__panel');
    this.eInfo = elem.find('.admin__info');
    this.eRows = elem.find('.admin__rows');
    this.eReset = elem.find('.admin__reset');
    elem.find('.admin__add').on('click', function () {
      dialog.open({title: T('Новий сервіс'), body: that.form(null), validate: that.validate}).then(function (values) {
        if (values) {
          that.save($.merge($.merge([], state.data.services), [that.build(values, null)]), T('Сервіс додано'));
        }
      });
    });
    elem.find('.admin__export').on('click', function () {
      var blob = new Blob([JSON.stringify({services: state.data.services}, null, 2)], {type: 'application/json'});
      var link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'subdog-services.json';
      link.click();
      setTimeout(function () {
        URL.revokeObjectURL(link.href);
      }, 1000);
    });
    this.eReset.on('click', function () {
      var message = Api.mode() === 'server' ? T('Усі правки каталогу на сервері буде втрачено для всіх користувачів.') : T('Усі зміни каталогу в цьому браузері буде втрачено.');
      dialog.confirm(T('Скинути каталог?'), message, T('Скинути'), true).then(function (ok) {
        if (ok) {
          that.run(Api.resetCatalog(), T('Каталог скинуто'));
        }
      });
    });
    this.eRows.on('click', '.admin__edit', function () {
      var old = service($(this).attr('data-id'));
      dialog.open({title: T('Змінити: {name}', {name: old.name}), body: that.form(old), validate: that.validate}).then(function (values) {
        var updated;
        if (values) {
          updated = that.build(values, old);
          that.save($.map(state.data.services, function (item) {
            return item.id === old.id ? updated : item;
          }), T('Зміни збережено'));
        }
      });
    });
    this.eRows.on('click', '.admin__delete', function () {
      var item = service($(this).attr('data-id'));
      dialog.confirm(T('Видалити сервіс?'), T('«{name}» зникне з каталогу та з усіх наборів. Це можна скасувати лише кнопкою «Скинути до початкового».', {name: item.name}), T('Видалити'), true).then(function (ok) {
        if (ok) {
          that.save($.grep(state.data.services, function (other) {
            return other.id !== item.id;
          }), T('Сервіс видалено'));
        }
      });
    });
  }

  Admin.prototype.save = function (services, message) {
    this.run(Api.saveServices(services), message);
  };

  Admin.prototype.run = function (promise, message) {
    return promise.then(function () {
      return Api.getCatalog();
    }).then(function (data) {
      state.data = data;
      indexCatalog();
      state.set = sanitizeSet(state.set);
      state.compare = $.grep(state.compare, function (id) {
        return state.byId[id];
      }).slice(0, 2);
      save();
      refresh();
      toast(message);
    }, function (error) {
      toast(error.message || T('Не вдалося зберегти'));
    });
  };

  Admin.prototype.field = function (label, input, hint) {
    return '<div class="field"><label class="field__label">' + label + '</label>' + input + (hint ? '<span class="field__hint">' + hint + '</span>' : '') + '</div>';
  };

  Admin.prototype.form = function (item) {
    var v = item || {name: '', category: state.data.categories[0].id, desc: '', url: 'https://', price: '', yearlyPrice: '', studentDiscount: 0, free: false, freeNote: '', team: null};
    var teamPrice = v.team && v.team.price != null ? v.team.price : '';
    var teamYearly = v.team && v.team.yearlyPrice != null ? v.team.yearlyPrice : '';
    var minSeats = v.team && v.team.minSeats ? v.team.minSeats : '';
    var categories = '';
    var groups = '<option value="">' + T('За категорією') + '</option>';
    var sources = '';
    function input(name, type, value, extra) {
      return '<input class="input" name="' + name + '" type="' + type + '" value="' + esc(value) + '" ' + (extra || '') + '>';
    }
    function area(name, value) {
      return '<textarea class="input" name="' + name + '">' + esc(value) + '</textarea>';
    }
    $.each(state.data.categories, function (i, cat) {
      categories += '<option value="' + cat.id + '"' + (v.category === cat.id ? ' selected' : '') + '>' + esc(L(cat, 'name')) + '</option>';
    });
    $.each(state.data.groups || {}, function (key) {
      groups += '<option value="' + esc(key) + '"' + (v.group === key ? ' selected' : '') + '>' + esc(groupName(key)) + '</option>';
    });
    $.each(SOURCES, function (key, source) {
      sources += '<option value="' + key + '"' + ((v.priceSource || 'manual') === key ? ' selected' : '') + '>' + esc(T(source[1])) + '</option>';
    });
    return this.field(T('Назва'), input('name', 'text', v.name)) +
      '<div class="form-grid">' +
      this.field(T('Категорія'), '<select class="input" name="category">' + categories + '</select>') +
      this.field(T('Посилання'), input('url', 'url', v.url)) + '</div>' +
      this.field(T('Опис'), area('desc', v.desc)) +
      this.field(T('Опис (англійською)'), area('desc_en', v.desc_en || ''), T('Порожньо — буде показано український опис')) +
      '<div class="form-grid">' +
      this.field(T('Ціна, $/міс'), input('price', 'number', v.price, 'min="0" step="any"')) +
      this.field(T('Річний тариф, $/рік'), input('yearlyPrice', 'number', v.yearlyPrice == null ? '' : v.yearlyPrice, 'min="0" step="any"'), T('Порожньо — немає')) +
      this.field(T('Студентська знижка, %'), input('studentDiscount', 'number', v.studentDiscount || 0, 'min="0" max="100" step="any"')) +
      this.field(T('Командний, $/міс за людину'), input('teamPrice', 'number', teamPrice, 'min="0" step="any"'), T('Порожньо — немає командного плану')) +
      this.field(T('Командний, $/рік за людину'), input('teamYearly', 'number', teamYearly, 'min="0" step="any"')) + '</div>' +
      '<div class="form-grid">' +
      this.field(T('Мінімум місць у командному плані'), input('minSeats', 'number', minSeats, 'min="1" step="1"'), T('Порожньо — без мінімуму')) +
      this.field(T('Група для підказки «дублюється»'), '<select class="input" name="group">' + groups + '</select>') + '</div>' +
      '<label class="check"><input name="free" type="checkbox"' + (v.free ? ' checked' : '') + '> ' + T('Є безкоштовний план') + '</label>' +
      this.field(T('Що входить у безкоштовний план'), input('freeNote', 'text', v.freeNote || '')) +
      this.field(T('Джерело ціни'), '<select class="input" name="priceSource">' + sources + '</select>') +
      this.field(T('Примітка до ціни'), area('priceNote', v.priceNote || ''), T('Що саме перевірено: умови, акції, обмеження')) +
      this.field(T('Примітка до ціни (англійською)'), area('priceNote_en', v.priceNote_en || ''));
  };

  Admin.prototype.validate = function (values) {
    var discount = Number(values.studentDiscount || 0);
    if (!$.trim(values.name || '')) {
      return T('Вкажіть назву.');
    }
    if (!/^https?:\/\//i.test(values.url || '')) {
      return T('Посилання має починатися з http:// або https://');
    }
    if (values.price === '' || !(Number(values.price) >= 0)) {
      return T('Вкажіть ціну (число від 0).');
    }
    if (!(discount >= 0 && discount <= 100)) {
      return T('Знижка має бути від 0 до 100%.');
    }
    if (values.yearlyPrice !== '' && !(Number(values.yearlyPrice) >= 0)) {
      return T('Річний тариф має бути числом від 0.');
    }
    if (values.teamPrice !== '' && !(Number(values.teamPrice) >= 0)) {
      return T('Командна ціна має бути числом від 0.');
    }
    if (values.minSeats !== '' && !(Number(values.minSeats) >= 1)) {
      return T('Мінімум місць має бути числом від 1.');
    }
    if (values.yearlyPrice !== '' && Number(values.yearlyPrice) > Number(values.price) * 12 + 0.005) {
      return T('Річний тариф не може бути дорожчим за 12 місяців.');
    }
    return '';
  };

  Admin.prototype.slug = function (name) {
    var map = {а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ie', ж: 'zh', з: 'z', и: 'y', і: 'i', ї: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ь: '', ю: 'iu', я: 'ia'};
    var text = $.map(name.toLowerCase().split(''), function (c) {
      return map[c] !== undefined ? map[c] : c;
    }).join('');
    return text.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'svc';
  };

  Admin.prototype.build = function (values, old) {
    var id = old ? old.id : this.slug(values.name);
    var base = id;
    var count = 2;
    var result;
    var changed = false;
    function number(value) {
      return value === '' || value == null ? null : Number(value);
    }
    function normal(value) {
      return value === '' || value == null ? '' : String(Number(value));
    }
    if (!old) {
      while (state.byId[id]) {
        id = base + '-' + count++;
      }
    }
    result = {
      id: id,
      name: $.trim(values.name),
      category: values.category,
      desc: $.trim(values.desc || ''),
      url: $.trim(values.url),
      price: Number(values.price),
      yearlyPrice: number(values.yearlyPrice),
      studentDiscount: Number(values.studentDiscount || 0),
      free: !!values.free,
      freeNote: $.trim(values.freeNote || ''),
      team: values.teamPrice === '' ? null : {price: Number(values.teamPrice), yearlyPrice: number(values.teamYearly)},
      priceDate: new Date().toISOString().slice(0, 10),
      priceSource: SOURCES[values.priceSource] ? values.priceSource : 'manual',
      priceNote: $.trim(values.priceNote || '')
    };
    if ($.trim(values.desc_en || '')) {
      result.desc_en = $.trim(values.desc_en);
    }
    if ($.trim(values.priceNote_en || '')) {
      result.priceNote_en = $.trim(values.priceNote_en);
    }
    if (old && old.freeNote_en && result.freeNote === old.freeNote) {
      result.freeNote_en = old.freeNote_en;
    }
    if (result.team && values.minSeats !== '') {
      result.team.minSeats = Math.floor(Number(values.minSeats));
    }
    if (values.group) {
      result.group = values.group;
    }
    if (old && values.priceSource === old.priceSource) {
      $.each(['price', 'yearlyPrice', 'studentDiscount'], function (i, key) {
        if (normal(old[key]) !== normal(values[key])) {
          changed = true;
        }
      });
      if (changed) {
        result.priceSource = 'manual';
      }
    }
    return result;
  };

  Admin.prototype.render = function () {
    var html = '';
    var list;
    this.eGuard.toggle(!isAdmin());
    this.ePanel.toggle(isAdmin());
    if (!isAdmin()) {
      return;
    }
    list = state.data.services.slice().sort(function (a, b) {
      return a.category.localeCompare(b.category) || a.name.localeCompare(b.name, I18n.lang());
    });
    $.each(list, function (i, item) {
      html += '<tr><td><b>' + esc(item.name) + '</b></td><td>' + esc(categoryName(item.category)) + '</td>' +
        '<td class="num">' + money(item.price) + '</td><td class="num">' + (item.yearlyPrice != null ? money(item.yearlyPrice) : '—') + '</td>' +
        '<td>' + (item.studentDiscount ? item.studentDiscount + '%' : '—') + '</td>' +
        '<td class="num">' + (item.team && item.team.price != null ? money(item.team.price) : '—') + '</td>' +
        '<td>' + (item.free ? T('так') : '—') + '</td><td>' + formatDate(item.priceDate) + '</td>' +
        '<td><button class="admin__edit button button_size_small" type="button" data-id="' + item.id + '">' + T('Змінити') + '</button> ' +
        '<button class="admin__delete button button_size_small button_type_danger" type="button" data-id="' + item.id + '" aria-label="' + esc(T('Видалити {name}', {name: item.name})) + '">' + T('Видалити') + '</button></td></tr>';
    });
    this.eRows.html(html);
    this.eReset.prop('disabled', !state.data.customized);
    this.eInfo.html(T('Каталог: {n} сервісів.', {n: '<b>' + list.length + '</b>'}) + ' ' +
      (state.data.customized ? T('Показано змінену версію (зберігається в цьому браузері).') : T('Показано початкову версію з catalog.json.')));
  };

  function readRoute() {
    var parts = location.hash.replace(/^#\/?/, '').split('/');
    return {name: parts[0] || '', arg: parts[1] ? decodeURIComponent(parts[1]) : ''};
  }

  function pageTitle(name) {
    return {
      catalog: T('Каталог'),
      builder: T('Конструктор набору'),
      compare: T('Порівняння підписок'),
      account: T('Акаунт'),
      admin: T('Адмін-панель'),
      service: T('Картка підписки')
    }[name];
  }

  function show() {
    var next = readRoute();
    var changed = next.name !== route.name || next.arg !== route.arg;
    if (!pages[next.name]) {
      next = {name: '', arg: ''};
    }
    route = next;
    $('.page').hide();
    $('.page_name_' + (route.name || 'home')).show();
    document.title = route.name ? (pageTitle(route.name) || 'Subdog') + ' — Subdog' : T('Subdog — конструктор комплекту підписок');
    header.toggle(false);
    pages[route.name].render(route.arg);
    header.render();
    if (changed) {
      window.scrollTo(0, 0);
    }
  }

  $(document).on('click', '.service__toggle', function () {
    toggleInSet($(this).attr('data-id'));
    refresh();
  });

  $(document).on('click', '.service__compare', function () {
    toggleCompare($(this).attr('data-id'));
    refresh();
  });

  $(document).on('click', '.switch__item', function () {
    state.set.plan = $(this).attr('data-id');
    save();
    refresh();
  });

  $(window).on('hashchange', show);

  dialog = new Dialog($('.dialog'));
  header = new Header($('.header'));

  Api.getCatalog().then(function (data) {
    state.data = data;
    indexCatalog();
    state.set = sanitizeSet(Api.loadSet());
    state.compare = $.grep(Api.loadCompare() || [], function (id) {
      return state.byId[id];
    }).slice(0, 2);
    return Api.me();
  }).then(function (user) {
    state.user = user;
    pages[''] = new Home($('.page_name_home'));
    pages.catalog = new Catalog($('.page_name_catalog'));
    pages.service = new ServicePage($('.page_name_service'));
    pages.builder = new Builder($('.page_name_builder'));
    pages.compare = new Compare($('.page_name_compare'));
    pages.account = new Account($('.page_name_account'));
    pages.admin = new Admin($('.page_name_admin'));
    translateStatic();
    show();
  }, function (error) {
    $('#app').html('<div class="card empty"><div class="empty__icon">🐾</div><h1>' + T('Не вдалося завантажити каталог') + '</h1><p>' + esc(error.message) + '</p></div>');
  });

  window.SubdogApp = {state: state, refresh: refresh};
});

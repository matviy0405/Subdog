/* Subdog — мови (українська за замовчуванням, англійська).
   Український текст є ключем: T('Ключ') повертає його як є, а англійською — значення зі словника EN.
   Тексти каталогу (опис, примітки, назви наборів) лежать у catalog.json з суфіксом _en, їх дістає L(obj, 'поле'). */
(function (root) {
  'use strict';

  const EN = {
    /* --- загальне й навігація --- */
    "Скасувати": "Cancel",
    "Зберегти": "Save",
    "Так": "Yes",
    "Ні": "No",
    "Головна": "Home",
    "Каталог": "Catalog",
    "Конструктор": "Builder",
    "Порівняння": "Compare",
    "Мої набори": "My sets",
    "Вхід": "Sign in",
    "Адмін": "Admin",
    "Меню": "Menu",
    "Закрити": "Close",
    "Перейти до вмісту": "Skip to content",
    "Основна навігація": "Main navigation",
    "Subdog — на головну": "Subdog — home",
    "Навчальний проєкт": "Learning project",
    "Сторінка тестів": "Tests page",
    "Завантаження…": "Loading…",
    "Назви належать їхнім власникам; Subdog з ними не пов'язаний.": "Names belong to their owners; Subdog is not affiliated with them.",
    "Оберіть мету й сферу — Subdog збере комплект підписок для навчання й роботи та порахує вартість на місяць і на рік, у тому числі для команди.": "Choose a goal and a field — Subdog assembles a set of subscriptions for study and work and calculates the cost per month and per year, including for a team.",
    "Конструктор набору": "Set builder",
    "Порівняння підписок": "Compare subscriptions",
    "Акаунт": "Account",
    "Адмін-панель": "Admin panel",
    "Картка підписки": "Subscription card",
    "Subdog — конструктор комплекту підписок": "Subdog — subscription bundle builder",

    /* --- плани й ціни --- */
    "Індивідуальний": "Individual",
    "Студентський": "Student",
    "Командний": "Team",
    "Тип плану": "Plan type",
    "План": "Plan",
    "/міс": "/mo",
    "/рік": "/yr",
    "/міс за людину": "/mo per person",
    "/ особа": "/ person",
    "{n} ос.": "{n} ppl",
    "На місяць": "Per month",
    "На рік": "Per year",
    "Є безкоштовний план": "Free plan available",
    "Студентам −{n}%": "Students −{n}%",
    "Командний план": "Team plan",
    "Річний тариф −{n}%": "Yearly plan −{n}%",
    "Безкоштовний": "Free",
    "Безкоштовний план": "Free plan",
    "безкоштовний план": "free plan",
    "Примітка": "Note",
    "річний тариф дешевший на {x}": "the yearly plan is {x} cheaper",
    "річного тарифу немає — 12 × місяць": "no yearly plan — 12 × monthly",
    "знижка {n}% (потрібне підтвердження статусу)": "{n}% discount (status verification required)",
    "студентської знижки немає": "no student discount",
    "ціна за одну людину": "price per person",
    "командного плану немає": "no team plan",
    "Ціни в доларах США, без податків. Актуальні умови — на офіційному сайті.": "Prices are in US dollars, excluding tax. Current terms are on the official website.",
    "Звірено з офіційною сторінкою": "Verified on the official page",
    "Частково звірено з офіційною сторінкою": "Partly verified on the official page",
    "За сторонніми джерелами, звірте на сайті": "From third-party sources — check on the website",
    "Введено адміністратором": "Entered by an administrator",

    /* --- головна --- */
    "Конструктор підписок": "Subscription builder",
    "Підписки для навчання й роботи —": "Subscriptions for study and work —",
    "одним комплектом": "in one bundle",
    "Оберіть мету й сферу — Subdog запропонує готовий набір сервісів. Приберіть зайве, додайте потрібне й одразу побачите вартість на місяць і на рік, у тому числі для всієї команди.": "Choose a goal and a field — Subdog suggests a ready set of services. Remove what you don't need, add what you do, and see the cost per month and per year at once, including for the whole team.",
    "Відкрити каталог": "Open catalog",
    "Мій набір": "My set",
    "{n} сервісів у {c} категоріях": "{n} services in {c} categories",
    "Індивідуальний, студентський і командний плани": "Individual, student and team plans",
    "Сума на місяць і на рік перераховується одразу": "Monthly and yearly totals update instantly",
    "01 — Готові набори": "01 — Ready-made sets",
    "Почніть із готового": "Start with a ready one",
    "Ціни рахуються за планом набору": "Prices follow the set's plan",
    "02 — Для бізнесу": "02 — For business",
    "Замовляєте на всю команду? Рахуйте одразу на всіх": "Ordering for the whole team? Calculate for everyone at once",
    "Оберіть командний план і вкажіть кількість людей — калькулятор покаже суму за всіх і ціну на одну людину. Річні тарифи зазвичай дешевші.": "Pick the team plan and enter the headcount — the calculator shows the total for everyone and the price per person. Yearly plans are usually cheaper.",
    "Набір для бізнесу": "Business set",
    "Ціна за людину × кількість людей": "Price per person × number of people",
    "Швидкий вибір: 5, 10, 25 або 50 місць": "Quick pick: 5, 10, 25 or 50 seats",
    "Видно економію від річних тарифів": "See the savings from yearly plans",
    "03 — Як це працює": "03 — How it works",
    "Три кроки до готового набору": "Three steps to a ready set",
    "Дайте три відповіді": "Give three answers",
    "Навчання, робота чи обидва; хто ви; у якій сфері.": "Study, work or both; who you are; which field.",
    "Відредагуйте набір": "Edit the set",
    "Додайте або приберіть сервіси, увімкніть безкоштовні плани, перемкніть Індивідуальний / Студентський / Командний.": "Add or remove services, switch on free plans, toggle Individual / Student / Team.",
    "Перегляньте суму й збережіть": "Check the total and save",
    "Підсумок перераховується одразу. Набір лишається в браузері, а в акаунті — назавжди.": "The total updates instantly. The set stays in your browser, and in your account — for good.",
    "04 — Каталог": "04 — Catalog",
    "Категорії": "Categories",
    "Для чого потрібен набір?": "What do you need the set for?",
    "Хто ви?": "Who are you?",
    "← Назад": "← Back",
    "Яка ваша сфера?": "What is your field?",
    "Зібрати набір": "Build the set",
    "{y} на рік · {n} {w}": "{y} per year · {n} {w}",
    "Взяти цей набір": "Take this set",

    /* --- каталог --- */
    "Усі підписки": "All subscriptions",
    "Фільтри": "Filters",
    "Пошук": "Search",
    "Назва або опис": "Name or description",
    "Категорія": "Category",
    "Усі": "All",
    "Ціна до:": "Price up to:",
    "без обмеження": "no limit",
    "Є студентська знижка": "Student discount available",
    "Є командний план": "Team plan available",
    "Сортування": "Sort by",
    "За назвою": "By name",
    "Спочатку дешевші": "Cheapest first",
    "Спочатку дорожчі": "Most expensive first",
    "Більша студентська знижка": "Biggest student discount",
    "Скинути фільтри": "Reset filters",
    "Знайдено: {n} з {total}": "Found: {n} of {total}",
    "Нічого не знайшлося": "Nothing found",
    "Спробуйте послабити фільтри.": "Try relaxing the filters.",
    "✓ У наборі": "✓ In the set",
    "+ До набору": "+ Add to set",
    "✓ Порівнюю": "✓ Comparing",
    "Порівняти": "Compare",

    /* --- картка підписки --- */
    "Підписку не знайдено": "Subscription not found",
    "Повернутися до каталогу": "Back to the catalog",
    "← До каталогу": "← To the catalog",
    "Прибрати з набору": "Remove from the set",
    "Прибрати з порівняння": "Remove from comparison",
    "Сайт сервісу ↗": "Service website ↗",
    "Схожі в категорії «{c}»": "Similar in “{c}”",

    /* --- конструктор --- */
    "Ваш набір": "Your set",
    "Очистити": "Clear",
    "Додати сервіс": "Add a service",
    "Пошук сервісу": "Search for a service",
    "Калькулятор": "Calculator",
    "Набір порожній": "The set is empty",
    "Дайте відповіді на питання майстра або додайте сервіси вручну.": "Answer the wizard's questions or add services manually.",
    "Зібрати за питаннями": "Build from questions",
    "У наборі кілька сервісів з однаковою роллю («{g}»). Це лише підказка: переконайтеся, що вони вам обидва потрібні.": "The set has several services with the same role (“{g}”). This is only a hint: make sure you need both.",
    "⚠ дублюється": "⚠ duplicate",
    "−{n}% студентська знижка": "−{n}% student discount",
    "без студентської знижки": "no student discount",
    "командного плану немає, окремі акаунти": "no team plan, separate accounts",
    "мінімум {n} місць": "minimum {n} seats",
    "річний тариф −{x}": "yearly plan −{x}",
    "Ліцензій для {name}": "Licenses for {name}",
    "Менше ліцензій": "Fewer licenses",
    "Більше ліцензій": "More licenses",
    "ліцензій": "licenses",
    "Прибрати {name} з набору": "Remove {name} from the set",
    "Прибрати": "Remove",
    "Студентська знижка": "Student discount",
    "Кількість людей у команді": "Number of people on the team",
    "Менше людей": "Fewer people",
    "Більше людей": "More people",
    "Швидкий вибір кількості людей": "Quick pick of headcount",
    "Сервіси без командного плану рахуються як 1 акаунт.": "Services without a team plan count as 1 account.",
    "Річні тарифи (де вони є)": "Yearly plans (where available)",
    "На одну людину: {x} на місяць": "Per person: {x} per month",
    "{n} {w} у наборі": "{n} {w} in the set",
    "Студентська знижка економить {x} на місяць.": "The student discount saves {x} per month.",
    "Річні тарифи економлять {x} на рік.": "Yearly plans save {x} per year.",
    "⚠ Дублюється:": "⚠ Duplicates:",
    "Зберегти набір в акаунті": "Save the set to your account",
    "Увійти й зберегти набір": "Sign in and save the set",
    "Поточний набір автоматично зберігається в цьому браузері.": "The current set is saved automatically in this browser.",
    "Нічого додавати — або все вже в наборі, або пошук нічого не знайшов.": "Nothing to add — either everything is already in the set, or the search found nothing.",

    /* --- порівняння --- */
    "— оберіть сервіс —": "— choose a service —",
    "Порівняйте дві підписки": "Compare two subscriptions",
    "Перший сервіс": "First service",
    "Другий сервіс": "Second service",
    "Підказка: у каталозі натисніть «Порівняти» на картках.": "Tip: in the catalog, press “Compare” on the cards.",
    "Оберіть два сервіси": "Choose two services",
    "Тоді з'явиться таблиця з цінами й перевагами.": "Then a table with prices and advantages will appear.",
    "Індивідуальний, на місяць": "Individual, per month",
    "Індивідуальний, на рік": "Individual, per year",
    "Студентський, на місяць": "Student, per month",
    "немає": "none",
    "Командний, за людину / міс": "Team, per person / mo",
    "Економія з річним тарифом": "Savings with a yearly plan",
    "немає плану": "no plan",
    "За поточним планом на рік вони коштують однаково.": "On the current plan they cost the same per year.",
    "За планом «{plan}» на рік дешевше {name} — на {diff}.": "On the “{plan}” plan, {name} is cheaper per year — by {diff}.",
    "Дії": "Actions",
    "Сайт ↗": "Site ↗",
    "Зелений колір — вигідніше значення в рядку. «Річний» враховує річний тариф, якщо він є.": "Green marks the better value in a row. “Yearly” uses the yearly plan where one exists.",
    "Оберіть два різні сервіси": "Choose two different services",
    "Готово — відкрийте «Порівняння»": "Done — open “Compare”",

    /* --- акаунт --- */
    "Акаунти й набори зберігаються на сервері.": "Accounts and sets are stored on the server.",
    "Адмін: {mail}, пароль із запуску сервера (за замовчуванням {pw}).": "Admin: {mail}, password from the server start-up (default {pw}).",
    "Сервер не підключено: дані лежать лише в цьому браузері.": "No server connected: data lives only in this browser.",
    "Тестовий адмін: {mail} / {pw}": "Test admin: {mail} / {pw}",
    "Реєстрація": "Sign up",
    "Ім'я": "Name",
    "Пошта": "Email",
    "Пароль": "Password",
    "Щонайменше 6 символів": "At least 6 characters",
    "Створити акаунт": "Create account",
    "Увійти": "Sign in",
    "адмін": "admin",
    "Вийти": "Sign out",
    "Збережених наборів ще немає": "No saved sets yet",
    "Зберіть набір у конструкторі й натисніть «Зберегти набір в акаунті».": "Build a set in the builder and press “Save the set to your account”.",
    "До конструктора": "To the builder",
    "Збережено {d}": "Saved {d}",
    "Відкрити": "Open",
    "Видалити": "Delete",
    "Вітаємо, {name}!": "Welcome, {name}!",
    "Ви вийшли з акаунта": "You signed out",

    /* --- адмін-панель --- */
    "Тільки для адміністратора": "Administrators only",
    "Увійдіть як адміністратор, щоб керувати каталогом.": "Sign in as an administrator to manage the catalog.",
    "Адміністратор": "Administrator",
    "+ Додати сервіс": "+ Add service",
    "Експорт JSON": "Export JSON",
    "Скинути до початкового": "Reset to original",
    "Каталог: {n} сервісів.": "Catalog: {n} services.",
    "Показано змінену версію (зберігається в цьому браузері).": "Showing the modified version (stored in this browser).",
    "Показано початкову версію з catalog.json.": "Showing the original version from catalog.json.",
    "Сервіс": "Service",
    "Ціна/міс": "Price/mo",
    "Річний": "Yearly",
    "Студ.": "Stud.",
    "Команда": "Team",
    "Ціни від": "Prices from",
    "так": "yes",
    "Змінити": "Edit",
    "Видалити {name}": "Delete {name}",
    "Назва": "Name",
    "Посилання": "Link",
    "Опис": "Description",
    "Опис (англійською)": "Description (English)",
    "Порожньо — буде показано український опис": "Leave empty to show the Ukrainian description",
    "Ціна, $/міс": "Price, $/mo",
    "Річний тариф, $/рік": "Yearly plan, $/yr",
    "Порожньо — немає": "Empty — none",
    "Студентська знижка, %": "Student discount, %",
    "Командний, $/міс за людину": "Team, $/mo per person",
    "Порожньо — немає командного плану": "Empty — no team plan",
    "Командний, $/рік за людину": "Team, $/yr per person",
    "Мінімум місць у командному плані": "Minimum seats on the team plan",
    "Порожньо — без мінімуму": "Empty — no minimum",
    "Група для підказки «дублюється»": "Group for the “duplicate” hint",
    "За категорією": "By category",
    "Що входить у безкоштовний план": "What the free plan includes",
    "Джерело ціни": "Price source",
    "Примітка до ціни": "Price note",
    "Що саме перевірено: умови, акції, обмеження": "What exactly was checked: terms, promotions, limits",
    "Примітка до ціни (англійською)": "Price note (English)",
    "Вкажіть назву.": "Enter a name.",
    "Посилання має починатися з http:// або https://": "The link must start with http:// or https://",
    "Вкажіть ціну (число від 0).": "Enter a price (a number from 0).",
    "Знижка має бути від 0 до 100%.": "The discount must be between 0 and 100%.",
    "Річний тариф має бути числом від 0.": "The yearly plan must be a number from 0.",
    "Командна ціна має бути числом від 0.": "The team price must be a number from 0.",
    "Мінімум місць має бути числом від 1.": "The minimum seats must be a number from 1.",
    "Річний тариф не може бути дорожчим за 12 місяців.": "The yearly plan cannot cost more than 12 months.",
    "Не вдалося зберегти": "Could not save",
    "Новий сервіс": "New service",
    "Сервіс додано": "Service added",
    "Змінити: {name}": "Edit: {name}",
    "Зміни збережено": "Changes saved",
    "Видалити сервіс?": "Delete the service?",
    "«{name}» зникне з каталогу та з усіх наборів. Це можна скасувати лише кнопкою «Скинути до початкового».": "“{name}” will disappear from the catalog and from all sets. Only the “Reset to original” button can undo this.",
    "Сервіс видалено": "Service deleted",
    "Скинути каталог?": "Reset the catalog?",
    "Усі правки каталогу на сервері буде втрачено для всіх користувачів.": "All catalog changes on the server will be lost for all users.",
    "Усі зміни каталогу в цьому браузері буде втрачено.": "All catalog changes in this browser will be lost.",
    "Скинути": "Reset",
    "Каталог скинуто": "Catalog reset",

    /* --- дії --- */
    "Прибрано з набору": "Removed from the set",
    "Додано до набору": "Added to the set",
    "Замінити поточний набір?": "Replace the current set?",
    "У вас уже є набір із {n} {w}. Він буде замінений на «{label}».": "You already have a set of {n} {w}. It will be replaced with “{label}”.",
    "Замінити": "Replace",
    "Набір «{label}» готовий": "The set “{label}” is ready",
    "Очистити набір?": "Clear the set?",
    "Усі сервіси буде прибрано з набору.": "All services will be removed from the set.",
    "За вашими відповідями": "From your answers",
    "Спочатку увійдіть в акаунт": "Sign in to your account first",
    "Зберегти набір": "Save the set",
    "Назва набору": "Set name",
    "Вкажіть назву набору.": "Enter a set name.",
    "Набір збережено в акаунті": "The set is saved to your account",
    "Видалити набір?": "Delete the set?",
    "Цю дію не можна скасувати.": "This cannot be undone.",
    "Набір видалено": "The set is deleted",
    "Не вдалося завантажити каталог": "Could not load the catalog",

    /* --- повідомлення API (api.js) --- */
    "Введіть коректну пошту": "Enter a valid email",
    "Вкажіть ім'я (мінімум 2 символи)": "Enter your name (at least 2 characters)",
    "Пароль має містити щонайменше 6 символів": "Password must be at least 6 characters",
    "Акаунт із такою поштою вже існує": "An account with this email already exists",
    "Невірна пошта або пароль": "Wrong email or password",
    "Увійдіть в акаунт": "Please sign in",
    "Недостатньо прав для цієї дії": "You don't have permission for this action",
    "Забагато невдалих спроб входу. Спробуйте через 10 хвилин": "Too many failed sign-in attempts. Try again in 10 minutes",
    "Набір має неправильний вигляд": "The set is invalid",
    "Правки каталогу мають неправильний вигляд": "The catalog changes are invalid",
    "Не знайдено": "Not found",
    "Забагато даних": "Too much data",
    "Неправильний запит": "Bad request",
    "Помилка сервера": "Server error",
    "Помилка сервера ({status})": "Server error ({status})",
    "Немає зв'язку із сервером": "No connection to the server",
    "Увійдіть в акаунт, щоб зберегти набір": "Sign in to save a set"
  };

  const KEY = 'subdog.lang';
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const CYR = /[Ѐ-ӿ]/;
  const missing = new Set();

  function detect() {
    let saved = null;
    try { saved = root.localStorage.getItem(KEY); } catch (e) { /* приватний режим */ }
    if (saved === 'uk' || saved === 'en') return saved;
    const nav = String((root.navigator && root.navigator.language) || 'uk').toLowerCase();
    return nav.indexOf('uk') === 0 || nav.indexOf('ru') === 0 ? 'uk' : 'en';
  }
  let lang = detect();

  /** Переклад рядка. {назва} у тексті заміняється значеннями з params. */
  function t(key, params) {
    let s = key;
    if (lang === 'en') {
      if (has(EN, key)) s = EN[key];
      else if (CYR.test(key)) missing.add(key); // для тесту повноти перекладу
    }
    if (params) s = s.replace(/\{(\w+)\}/g, (m, k) => (params[k] === undefined ? m : String(params[k])));
    return s;
  }

  /** Поле каталогу з урахуванням мови: obj.desc_en, якщо є, інакше obj.desc */
  function L(obj, field) {
    if (!obj) return '';
    if (lang === 'en' && obj[field + '_en']) return obj[field + '_en'];
    return obj[field] == null ? '' : obj[field];
  }

  /** Форма множини: українська має 3 форми (1, 2–4, 5+), англійська 2. */
  function plural(n, uk3, en2) {
    if (lang === 'en') return n === 1 ? en2[0] : en2[1];
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return uk3[0];
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return uk3[1];
    return uk3[2];
  }

  function setLang(l, persist) {
    lang = l === 'en' ? 'en' : 'uk';
    if (persist !== false) { try { root.localStorage.setItem(KEY, lang); } catch (e) { /* ignore */ } }
    if (root.document) root.document.documentElement.lang = lang;
  }

  root.I18n = {
    t: t,
    L: L,
    plural: plural,
    lang: () => lang,
    locale: () => (lang === 'en' ? 'en-US' : 'uk-UA'),
    setLang: setLang,
    /** Тимчасово примусова мова (тести), без збереження */
    force: (l) => setLang(l, false),
    dictionary: EN,
    missing: () => Array.from(missing),
  };
})(typeof window !== 'undefined' ? window : globalThis);

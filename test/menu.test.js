import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = await readFile(path.join(root, "docs/index.html"), "utf8");
const styles = await readFile(path.join(root, "docs/styles.css"), "utf8");
const menuScript = await readFile(path.join(root, "docs/menu.js"), "utf8");
const menuMigration = await readFile(
  path.join(root, "supabase/migrations/20261007170000_create_menu_items.sql"),
  "utf8",
);

const legacyMenu = [
  ["Toasties", [
    ["Bacon, Egg and Cheese", "R27"],
    ["Ham and Cheese", "R23"],
    ["Ham, Cheese and Tomato", "R25"],
    ["Chicken Mayo", "R25"],
    ["Cheese and Tomato", "R20"],
    ["Bacon and Cheese", "R25"],
    ["Egg Mayonnaise", "R20"],
  ]],
  ["Healthy", [
    ["Chicken salad", "R38"],
    ["Bacon salad", "R38"],
    ["Chicken wrap with salad filling", "R38"],
    ["Tramazinni", "R48"],
    ["Tea or coffee", "R10"],
    ["Cuppachino", "R15"],
  ]],
  ["Lunch", [
    ["Hotdog roll", "R15"],
    ["Chip roll with white sauce", "R25"],
    ["Russian roll with 125g chips", "R30"],
    ["300g chips", "R20"],
    ["Loaded fries", "R38", "Chips, cheese sauce, cheese and bacon"],
    ["Russian and 300g chips", "R30"],
    ["Nuggets and 300g chips", "R36"],
    ["Skambane", "R35", "Russian, chips, cheese and ¼ bread"],
    ["Strips and 300g chips", "R40"],
  ]],
  ["Burgers", [
    ["Dagwood with 300g chips", "R50"],
    ["Beef burger with 125g chips", "R40"],
    ["Crumbed chicken burger with 125g chips", "R40"],
  ]],
  ["Singles", [
    ["Russian", "R12"],
    ["Vienna", "R8"],
    ["6 Nuggets", "R16"],
    ["3 Strips", "R25"],
    ["Fried egg", "R5"],
    ["Rolls", "R5"],
    ["⅓ bread", "R8"],
    ["⅓ bread with butter", "R10"],
    ["Butter", "R4"],
  ]],
  ["Breakfast", [
    ["All day breakfast", "R35", "2 eggs, 125g chips, bread, 2 bacon"],
    ["Starter pack", "R30", "2 eggs, 125g chips, 2 bread, vienna"],
    ["Special breakfast", "R50", "2 eggs, 125g chips, 2 bread, 2 bacon, russian, salad"],
  ]],
];

const menuSeedRows = [...menuMigration.matchAll(
  /\('([0-9a-f-]+)', '([^']+)', '([^']+)', '([^']*)', (\d+), '([^']+)', (\d+), (\d+)\)/g,
)].map(([, id, seedKey, name, description, priceCents, category, categoryOrder, itemOrder]) => ({
  id,
  seedKey,
  name,
  description,
  priceCents: Number(priceCents),
  category,
  categoryOrder: Number(categoryOrder),
  itemOrder: Number(itemOrder),
}));
const apiMenu = [];
for (const row of menuSeedRows) {
  let category = apiMenu.find((entry) => entry.category === row.category);
  if (!category) {
    category = { category: row.category, items: [] };
    apiMenu.push(category);
  }
  category.items.push({
    id: row.id,
    name: row.name,
    description: row.description,
    priceCents: row.priceCents,
  });
}

// ---------------------------------------------------------------------------
// Pinned test dates. All at 12:00 UTC = 14:00 SAST, one hour before the 15:00
// SAST canteen cutoff, unless a test overrides the time-of-day.
//
//  2026-10-07 = Wednesday  (workday today, workday tomorrow)
//  2026-10-09 = Friday     (workday today, Saturday tomorrow)
//  2026-10-10 = Saturday   (non-workday today, non-workday tomorrow)
//  2026-10-11 = Sunday     (non-workday today, Monday tomorrow)
// ---------------------------------------------------------------------------
const TEST_WEDNESDAY = new Date("2026-10-07T12:00:00.000Z");
const TEST_FRIDAY    = new Date("2026-10-09T12:00:00.000Z");
const TEST_SATURDAY  = new Date("2026-10-10T12:00:00.000Z");
const TEST_SUNDAY    = new Date("2026-10-11T12:00:00.000Z");

class Element {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.attributes = {};
    this.dataset = {};
    this.textContent = "";
    this.hidden = false;
    this.parent = null;
    this.className = "";
    this.id = "";
  }

  append(...elements) {
    for (const el of elements) {
      if (el && typeof el === "object") {
        el.parent = this;
      }
    }
    this.children.push(...elements);
  }

  replaceChildren(...elements) {
    for (const el of elements) {
      if (el && typeof el === "object") {
        el.parent = this;
      }
    }
    this.children = elements;
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
  }

  removeAttribute(name) {
    delete this.attributes[name];
  }

  addEventListener(event, callback, options) {
    this.listeners ??= {};
    this.listenerOptions ??= {};
    this.listeners[event] = callback;
    this.listenerOptions[event] = options;
  }

  closest(selector) {
    let node = this;
    while (node) {
      if (matchesSelector(node, selector)) {
        return node;
      }
      node = node.parent;
    }
    return null;
  }
}

function matchesSelector(element, selector) {
  if (selector.startsWith(".")) {
    return String(element.className || "")
      .split(/\s+/)
      .filter(Boolean)
      .includes(selector.slice(1));
  }
  if (selector.startsWith("#")) {
    return element.id === selector.slice(1);
  }
  return element.tagName === selector;
}

function createPage(
  theme = "light",
  fetchImpl = async (url) => url === "/api/menu"
    ? jsonResponse({ categories: apiMenu })
    : jsonResponse({ plate: null, nextPlate: null }),
  now = new Date(),
) {
  // The plate regions live inside .plate-day sections so the script's
  // `todayPlate.closest(".plate-day")` lookup has a real parent to find.
  const todaySection = new Element("section");
  todaySection.className = "plate-day";
  const tomorrowSection = new Element("section");
  tomorrowSection.className = "plate-day plate-day--next";

  const todayPlate = new Element("div");
  todayPlate.id = "today-plate";
  const tomorrowPlate = new Element("div");
  tomorrowPlate.id = "tomorrow-plate";
  const tomorrowCutoff = new Element("p");
  tomorrowCutoff.id = "tomorrow-cutoff";

  todaySection.append(todayPlate);
  tomorrowSection.append(tomorrowPlate, tomorrowCutoff);

  const elements = {
    "#category-nav": new Element("div"),
    "#menu-sections": new Element("div"),
    "#today-plate": todayPlate,
    "#tomorrow-plate": tomorrowPlate,
    "#tomorrow-cutoff": tomorrowCutoff,
    "#today-plate-section": todaySection,
    "#tomorrow-plate-section": tomorrowSection,
    ".theme-toggle": new Element("button"),
    ".theme-toggle__label": new Element("span"),
    'meta[name="theme-color"]': { content: "" },
  };
  elements["#today-plate"].attributes["aria-busy"] = "true";
  elements["#tomorrow-plate"].attributes["aria-busy"] = "true";
  const initialStatus = new Element("p");
  initialStatus.textContent = "Loading today's plate…";
  elements["#today-plate"].append(initialStatus);
  const document = {
    documentElement: { dataset: { theme } },
    querySelector: (selector) => elements[selector],
    createElement: (tagName) => new Element(tagName),
  };
  const storedValues = new Map();
  const localStorage = {
    getItem: (key) => storedValues.get(key) ?? null,
    setItem: (key, value) => storedValues.set(key, value),
  };
  const context = vm.createContext({
    document,
    localStorage,
    fetch: fetchImpl,
    URL,
    getComputedStyle: () => ({
      getPropertyValue: (property) =>
        property === "--color-page"
          ? document.documentElement.dataset.theme === "dark"
            ? "#222222"
            : "#ffffff"
          : "",
    }),
    Date: class extends Date {
      constructor(...args) {
        super(args.length === 0 ? now : args[0]);
      }

      static now() {
        return now.getTime();
      }
    },
    setInterval: (callback) => {
      context.intervalCallback = callback;
      return 1;
    },
    clearInterval: () => {},
  });

  vm.runInContext(menuScript, context, { filename: "docs/menu.js" });
  return {
    document,
    elements,
    localStorage,
    todaySection,
    tomorrowSection,
  };
}

function jsonResponse(body, { status = 200, contentType = "application/json" } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => name.toLowerCase() === "content-type" ? contentType : null },
    json: async () => body,
  };
}

// Defaults to the pinned Wednesday so a "today"-based assertion cannot drift
// with the wall clock (which would break the suite on real weekends).
function currentServiceDate(date = TEST_WEDNESDAY) {
  const parts = new Intl.DateTimeFormat("en-ZA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function validPlate(overrides = {}) {
  return {
    id: "8d2b48f2-7932-4ff0-9e80-7ac5efc438f0",
    serviceDate: currentServiceDate(),
    name: "Cottage burger",
    description: "Beef, cheese and chips",
    priceCents: 12500,
    imageUrl: "https://images.example/plate.jpg",
    ...overrides,
  };
}

function findElement(element, predicate) {
  if (predicate(element)) {
    return element;
  }
  for (const child of element.children ?? []) {
    const match = findElement(child, predicate);
    if (match) {
      return match;
    }
  }
}

function flushPromises() {
  return new Promise((resolve) => setImmediate(resolve));
}

function runInitialThemeScript({ storedTheme = null, prefersDark = false } = {}) {
  const [, script] = html.match(/<script>\s*([\s\S]*?)\s*<\/script>/) ?? [];
  assert.ok(script, "index.html contains its inline theme initialization script");

  const document = { documentElement: { dataset: {} } };
  const context = vm.createContext({
    document,
    localStorage: { getItem: () => storedTheme },
    window: { matchMedia: () => ({ matches: prefersDark }) },
  });
  vm.runInContext(script, context, { filename: "docs/index.html inline theme script" });
  return document.documentElement.dataset.theme;
}

test("migration seed exactly preserves the complete legacy menu content and order", () => {
  assert.equal(menuSeedRows.length, 37);
  assert.deepEqual(
    menuSeedRows.map(({ category, name, description, priceCents, categoryOrder, itemOrder }) => [
      category,
      name,
      `R${priceCents / 100}`,
      ...(description ? [description] : []),
      categoryOrder,
      itemOrder,
    ]),
    legacyMenu.flatMap(([category, items], categoryOrder) =>
      items.map(([name, price, description], itemOrder) => [
        category,
        name,
        price,
        ...(description ? [description] : []),
        categoryOrder,
        itemOrder,
      ])
    ),
  );
  assert.match(menuMigration, /on conflict \(seed_key\) do nothing/);
  assert.match(menuMigration, /create policy menu_items_public_read[\s\S]*?using \(active\)/);
  assert.match(menuMigration, /menu_items_owner_(?:read|insert|update|delete)/);
  assert.doesNotMatch(menuScript, /const menu\s*=/);
});

test("loads and renders every database-backed menu category, item, price, and description", async () => {
  const { elements } = createPage();
  await flushPromises();
  const categories = elements["#menu-sections"].children;
  const navigation = elements["#category-nav"].children;

  assert.deepEqual(
    categories.map((section) => section.children[0].textContent),
    ["Toasties", "Healthy", "Lunch", "Burgers", "Singles", "Breakfast"],
  );
  assert.deepEqual(
    categories.map((section) => section.children[1].children.length),
    [7, 6, 9, 3, 9, 3],
  );
  assert.equal(navigation.length, categories.length);

  let itemCount = 0;
  for (const [index, section] of categories.entries()) {
    const heading = section.children[0];
    const items = section.children[1].children;
    const link = navigation[index];

    assert.equal(section.className, "menu-category");
    assert.equal(section.attributes["aria-labelledby"], heading.id);
    assert.equal(link.textContent, heading.textContent);
    assert.equal(link.href, `#${section.id}`);
    assert.equal(heading.id, `${section.id}-title`);

    for (const item of items) {
      const [details, price] = item.children;
      assert.equal(item.className, "menu-item");
      assert.match(price.textContent, /^R\d+$/);
      assert.ok(details.children[0].textContent.length > 0);
      if (details.children[1]) {
        assert.match(details.children[1].textContent, /^\(.+\)$/);
      }
      itemCount += 1;
    }
  }

  assert.equal(itemCount, 37);
  const lunchItems = categories[2].children[1].children;
  assert.deepEqual(
    lunchItems[4].children[0].children.map((element) => element.textContent),
    ["Loaded fries", "(Chips, cheese sauce, cheese and bacon)"],
  );
  assert.equal(lunchItems[4].children[1].textContent, "R38");
  assert.deepEqual(
    categories[5].children[1].children[2].children[0].children.map(
      (element) => element.textContent,
    ),
    ["Special breakfast", "(2 eggs, 125g chips, 2 bread, 2 bacon, russian, salad)"],
  );
  assert.equal(categories[5].children[1].children[2].children[1].textContent, "R50");
});

test("initializes the theme toggle accessibly from the page theme", () => {
  const { document, elements } = createPage("dark");
  const toggle = elements[".theme-toggle"];

  assert.equal(document.documentElement.dataset.theme, "dark");
  assert.equal(toggle.attributes["aria-pressed"], "true");
  assert.equal(toggle.attributes["aria-label"], "Switch to light theme");
  assert.equal(elements[".theme-toggle__label"].textContent, "Light");
  assert.equal(elements['meta[name="theme-color"]'].content, "#222222");
});

test("switches theme and stores the preference when the toggle is clicked", () => {
  const { document, elements, localStorage } = createPage();
  const toggle = elements[".theme-toggle"];

  toggle.listeners.click();
  assert.equal(document.documentElement.dataset.theme, "dark");
  assert.equal(localStorage.getItem("cottage44-theme"), "dark");
  assert.equal(toggle.attributes["aria-pressed"], "true");
  assert.equal(toggle.attributes["aria-label"], "Switch to light theme");
  assert.equal(elements[".theme-toggle__label"].textContent, "Light");
  assert.equal(elements['meta[name="theme-color"]'].content, "#222222");

  toggle.listeners.click();
  assert.equal(document.documentElement.dataset.theme, "light");
  assert.equal(localStorage.getItem("cottage44-theme"), "light");
  assert.equal(toggle.attributes["aria-pressed"], "false");
  assert.equal(toggle.attributes["aria-label"], "Switch to dark theme");
  assert.equal(elements[".theme-toggle__label"].textContent, "Dark");
  assert.equal(elements['meta[name="theme-color"]'].content, "#ffffff");
});

test("chooses a valid saved theme before the system preference", () => {
  assert.equal(runInitialThemeScript({ storedTheme: "dark" }), "dark");
  assert.equal(runInitialThemeScript({ storedTheme: "light", prefersDark: true }), "light");
  assert.equal(runInitialThemeScript({ storedTheme: "invalid", prefersDark: true }), "dark");
  assert.equal(runInitialThemeScript({ storedTheme: "invalid" }), "light");
});

test("loads and renders today's plate accessibly using the same-origin API", async () => {
  let resolveResponse;
  let requestedUrl;
  let requestOptions;
  const responsePromise = new Promise((resolve) => {
    resolveResponse = resolve;
  });
  const { elements } = createPage("light", (url, options) => {
    if (url === "/api/plates/today") {
      requestedUrl = url;
      requestOptions = options;
    }
    return responsePromise;
  }, TEST_WEDNESDAY);

  assert.equal(elements["#today-plate"].attributes["aria-busy"], "true");
  assert.equal(elements["#today-plate"].children[0].textContent, "Loading today's plate…");
  resolveResponse(jsonResponse({ plate: validPlate(), nextPlate: null }));
  await flushPromises();

  assert.equal(requestedUrl, "/api/plates/today");
  assert.equal(requestOptions.headers.Accept, "application/json");
  assert.equal(elements["#today-plate"].attributes["aria-busy"], "false");
  const article = elements["#today-plate"].children[0];
  const heading = findElement(article, (element) => element.tagName === "h3");
  const description = findElement(article, (element) => element.className === "plate-card__description");
  const date = findElement(article, (element) => element.tagName === "time");
  const price = findElement(article, (element) => element.className === "plate-card__price");
  const image = findElement(article, (element) => element.tagName === "img");

  assert.equal(article.className, "plate-card");
  assert.equal(heading.textContent, "Cottage burger");
  assert.equal(description.textContent, "Beef, cheese and chips");
  assert.equal(date.dateTime, currentServiceDate());
  assert.equal(
    price.textContent,
    new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(125),
  );
  assert.equal(image.alt, "Photo of Cottage burger");
  assert.equal(image.loading, "lazy");
});

test("renders the empty state and optional-photo fallback without errors", async () => {
  const empty = createPage("light", undefined, TEST_WEDNESDAY);
  await flushPromises();
  assert.match(empty.elements["#today-plate"].children[0].textContent, /No plate has been announced/);
  assert.equal(empty.elements["#today-plate"].attributes["aria-busy"], "false");

  const noPhoto = createPage("light", async () => jsonResponse({
    plate: validPlate({ imageUrl: null }),
    nextPlate: null,
  }), TEST_WEDNESDAY);
  await flushPromises();
  const fallback = findElement(
    noPhoto.elements["#today-plate"],
    (element) => element.className === "plate-card__image-fallback",
  );
  assert.equal(fallback.textContent, "Photo coming soon");
  assert.equal(fallback.attributes.role, "img");
  assert.equal(fallback.attributes["aria-label"], "No photo available");
});

test("renders tomorrow's scheduled plate separately from today's empty state", async () => {
  const tomorrow = new Date(`${currentServiceDate()}T00:00:00.000Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const tomorrowDate = tomorrow.toISOString().slice(0, 10);
  const beforeCutoff = new Date(`${currentServiceDate()}T12:00:00.000Z`);
  const { elements } = createPage("light", async () => jsonResponse({
    plate: null,
    nextPlate: validPlate({ serviceDate: tomorrowDate, name: "Tomorrow stew" }),
  }), beforeCutoff);
  await flushPromises();
  assert.match(elements["#today-plate"].children[0].textContent, /No plate/);
  assert.equal(
    findElement(elements["#tomorrow-plate"], (element) => element.tagName === "h3").textContent,
    "Tomorrow stew",
  );
  assert.equal(elements["#tomorrow-plate"].attributes["aria-busy"], "false");
  assert.match(elements["#tomorrow-cutoff"].textContent, /Time remaining before/);
});

test("tomorrow cutoff countdown handles before, exact, and after 15:00 in Johannesburg", async () => {
  const date = currentServiceDate();
  const tomorrow = new Date(`${date}T00:00:00.000Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const tomorrowDate = tomorrow.toISOString().slice(0, 10);
  const nextPlate = validPlate({ serviceDate: tomorrowDate });
  const before = createPage(
    "light",
    async () => jsonResponse({ plate: null, nextPlate }),
    new Date(`${date}T12:59:59.000Z`),
  );
  await flushPromises();
  assert.match(before.elements["#tomorrow-cutoff"].textContent, /0h 0m 1s/);

  const exact = createPage(
    "light",
    async () => jsonResponse({ plate: null, nextPlate }),
    new Date(`${date}T13:00:00.000Z`),
  );
  await flushPromises();
  assert.match(exact.elements["#tomorrow-cutoff"].textContent, /cutoff.*passed/i);

  const after = createPage(
    "light",
    async () => jsonResponse({ plate: null, nextPlate }),
    new Date(`${date}T14:00:00.000Z`),
  );
  await flushPromises();
  assert.match(after.elements["#tomorrow-cutoff"].textContent, /cutoff.*passed/i);
});

test("uses a text fallback when the plate image fails to load", async () => {
  const { elements } = createPage("light", async () =>
    jsonResponse({ plate: validPlate(), nextPlate: null }),
    TEST_WEDNESDAY,
  );
  await flushPromises();
  const image = findElement(elements["#today-plate"], (element) => element.tagName === "img");
  assert.equal(image.listenerOptions.error.once, true);
  image.listeners.error();

  const fallback = findElement(
    elements["#today-plate"],
    (element) => element.className === "plate-card__image-fallback",
  );
  assert.equal(fallback.textContent, "Photo unavailable");
  assert.equal(fallback.attributes.role, "img");
  assert.equal(fallback.attributes["aria-label"], "Photo unavailable");
  assert.equal(findElement(elements["#today-plate"], (element) => element.tagName === "img"), undefined);
});

test("shows only a safe unavailable state for failed or stale API responses", async () => {
  const cases = [
    ["network failure", async () => { throw new Error("private network detail"); }],
    ["HTTP failure", async () => jsonResponse({ secret: "private response" }, { status: 503 })],
    ["HTML fallback", async () => jsonResponse("<html>not the API</html>", { contentType: "text/html" })],
    ["malformed JSON", async () => ({
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => { throw new Error("private parser detail"); },
    })],
    ["stale service date", async () => jsonResponse({
      plate: validPlate({ serviceDate: "2000-01-01" }),
    })],
    ["invalid image URL", async () => jsonResponse({
      plate: validPlate({ imageUrl: "javascript:alert(1)" }),
    })],
    ["malformed payload", async () => jsonResponse({ plate: { name: "Missing fields" } })],
  ];

  for (const [label, fetchImpl] of cases) {
    const { elements } = createPage("light", fetchImpl, TEST_WEDNESDAY);
    await flushPromises();
    const content = elements["#today-plate"];
    assert.match(content.children[0].textContent, /temporarily unavailable/, label);
    assert.doesNotMatch(content.children[0].textContent, /private|secret|parser|network detail/, label);
    assert.equal(content.attributes["aria-busy"], "false", label);
  }
});

// ---------------------------------------------------------------------------
// Workday gating — covers the isWorkdayInSouthAfrica() function and every
// branch added to loadTodayPlate().
// ---------------------------------------------------------------------------

test("Saturday: skips the plates API entirely and hides both sections", async () => {
  const calls = [];
  const { elements, todaySection, tomorrowSection } = createPage("light", async (url) => {
    calls.push(url);
    if (url === "/api/menu") {
      return jsonResponse({ categories: apiMenu });
    }
    return jsonResponse({ plate: null, nextPlate: null });
  }, TEST_SATURDAY);
  await flushPromises();

  // The menu is still fetched — only the plates endpoint is skipped.
  assert.ok(calls.includes("/api/menu"), "menu API is still called on Saturday");
  assert.ok(!calls.includes("/api/plates/today"), "plates API is skipped on Saturday");

  assert.equal(todaySection.hidden, true);
  assert.equal(tomorrowSection.hidden, true);

  // Neither region received a plate or a "no plate" message — they keep the
  // initial loading placeholder untouched.
  assert.equal(findElement(elements["#today-plate"], (el) => el.tagName === "h3"), undefined);
  assert.equal(findElement(elements["#tomorrow-plate"], (el) => el.tagName === "h3"), undefined);
  assert.equal(elements["#tomorrow-cutoff"].textContent, "");
});

test("Sunday: hides today, shows tomorrow, and renders only tomorrow's plate", async () => {
  const mondayDate = "2026-10-12";
  const calls = [];
  const { elements, todaySection, tomorrowSection } = createPage("light", async (url) => {
    calls.push(url);
    if (url === "/api/menu") {
      return jsonResponse({ categories: apiMenu });
    }
    return jsonResponse({
      plate: null,
      nextPlate: validPlate({ serviceDate: mondayDate, name: "Monday stew" }),
    });
  }, TEST_SUNDAY);
  await flushPromises();

  assert.ok(calls.includes("/api/plates/today"), "plates API is called on Sunday");

  assert.equal(todaySection.hidden, true, "today's section is hidden on Sunday");
  assert.equal(tomorrowSection.hidden, false, "tomorrow's section is visible on Sunday");

  // Today's region was left alone — no plate, no "No plate has been announced".
  assert.equal(findElement(elements["#today-plate"], (el) => el.tagName === "h3"), undefined);
  assert.doesNotMatch(elements["#today-plate"].children[0].textContent, /No plate/);

  // Tomorrow's plate rendered normally.
  const tomorrowHeading = findElement(elements["#tomorrow-plate"], (el) => el.tagName === "h3");
  assert.equal(tomorrowHeading.textContent, "Monday stew");
  assert.equal(elements["#tomorrow-plate"].attributes["aria-busy"], "false");

  // Countdown is running because tomorrow is a workday.
  assert.match(elements["#tomorrow-cutoff"].textContent, /Time remaining before/);
});

test("Friday: renders today, hides tomorrow, and starts no countdown", async () => {
  const fridayDate = "2026-10-09";
  const calls = [];
  const { elements, todaySection, tomorrowSection } = createPage("light", async (url) => {
    calls.push(url);
    if (url === "/api/menu") {
      return jsonResponse({ categories: apiMenu });
    }
    return jsonResponse({
      plate: validPlate({ serviceDate: fridayDate, name: "Friday special" }),
      nextPlate: null,
    });
  }, TEST_FRIDAY);
  await flushPromises();

  assert.ok(calls.includes("/api/plates/today"));

  assert.equal(todaySection.hidden, false, "today's section is visible on Friday");
  assert.equal(tomorrowSection.hidden, true, "tomorrow's section is hidden on Friday");

  // Today rendered.
  const todayHeading = findElement(elements["#today-plate"], (el) => el.tagName === "h3");
  assert.equal(todayHeading.textContent, "Friday special");

  // Tomorrow's region was left untouched (never "not announced yet").
  assert.equal(findElement(elements["#tomorrow-plate"], (el) => el.tagName === "h3"), undefined);
  assert.equal(elements["#tomorrow-plate"].children.length, 0);

  // No countdown text and no interval started.
  assert.equal(elements["#tomorrow-cutoff"].textContent, "");
});

test("includes a labelled Plate of the Day live region in the page", () => {
  assert.match(html, /<section class="plate-day" aria-labelledby="plate-day-title">/);
  assert.match(html, /id="today-plate"[\s\S]*aria-live="polite"/);
  assert.match(html, /id="plate-day-title">Plate of the Day<\/h2>/);
  assert.match(
    html,
    /class="plate-day__notice">Today's orders had to be placed through the canteen by 15:00 yesterday\.<\/p>/,
  );
});

test("provides a subtle owner sign-in link in the public site footer", () => {
  assert.match(
    html,
    /<a class="site-footer__admin" href="\/admin\/">Owner sign in<\/a>/,
  );
});

test("uses the exact Cottage 44 red accent in both public light and dark themes", () => {
  assert.match(styles, /--brand-accent:\s*#C12025;/);
  assert.match(styles, /:root\[data-theme="dark"\][\s\S]*?--color-accent:\s*#C12025;/);
});
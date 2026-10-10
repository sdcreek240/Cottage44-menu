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
// Pinned test dates at 12:00 UTC = 14:00 SAST (one hour before the 15:00 cutoff)
//
//  2026-10-05 = Monday    (4 upcoming: Tue–Fri)
//  2026-10-07 = Wednesday (3 upcoming: Thu–Fri)
//  2026-10-09 = Friday    (bridges weekend: next Mon–Fri)
//  2026-10-10 = Saturday  (bridges weekend: next Mon–Fri, no today plate)
//  2026-10-11 = Sunday    (bridges weekend: next Mon–Fri, no today plate)
// ---------------------------------------------------------------------------
const TEST_MONDAY    = new Date("2026-10-05T12:00:00.000Z");
const TEST_WEDNESDAY = new Date("2026-10-07T12:00:00.000Z");
const TEST_FRIDAY    = new Date("2026-10-09T12:00:00.000Z");
const TEST_SATURDAY  = new Date("2026-10-10T12:00:00.000Z");
const TEST_SUNDAY    = new Date("2026-10-11T12:00:00.000Z");

// ---------------------------------------------------------------------------
// Minimal DOM shim
// ---------------------------------------------------------------------------

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
    this.offsetLeft = 0;
    this.scrollLeft = 0;
    this.scrollIntoViewOptions = null;
  }

  append(...elements) {
    for (const el of elements) {
      if (el && typeof el === "object") {
        el.parent = this;
        // Each child gets a distinct offsetLeft so scroll-position tests can
        // pick which slot is "closest" after a simulated scroll.
        el.offsetLeft = this.children.length * 100;
      }
    }
    this.children.push(...elements);
  }

  replaceChildren(...elements) {
    for (let i = 0; i < elements.length; i += 1) {
      const el = elements[i];
      if (el && typeof el === "object") {
        el.parent = this;
        el.offsetLeft = i * 100;
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

  scrollIntoView(options) {
    this.scrollIntoViewOptions = options;
    if (this.parent) {
      this.parent.scrollLeft = this.offsetLeft;
    }
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

// ---------------------------------------------------------------------------
// Test page factory
// ---------------------------------------------------------------------------

function createPage(
  theme = "light",
  fetchImpl = async (url) => url === "/api/menu"
    ? jsonResponse({ categories: apiMenu })
    : jsonResponse({ plate: null, upcoming: [] }),
  now = new Date(),
  options = {},
) {
  // Today section
  const todaySection = new Element("section");
  todaySection.className = "plate-day";
  todaySection.id = "today-plate-section";
  const todayPlate = new Element("div");
  todayPlate.id = "today-plate";
  todaySection.append(todayPlate);

  // Upcoming section (matches HTML structure: notice + title + countdown + arrows + rail + dots)
  const upcomingSection = new Element("section");
  upcomingSection.className = "plate-day plate-day--next";
  upcomingSection.id = "upcoming-plates-section";

  const upcomingNotice = new Element("p");
  upcomingNotice.id = "upcoming-notice";
  const nextPlateTitle = new Element("h2");
  nextPlateTitle.id = "next-plate-title";
  const tomorrowCutoff = new Element("p");
  tomorrowCutoff.id = "tomorrow-cutoff";
  const upcomingPrev = new Element("button");
  upcomingPrev.id = "upcoming-prev";
  upcomingPrev.hidden = true;
  const upcomingRail = new Element("div");
  upcomingRail.id = "tomorrow-plate";
  const upcomingNext = new Element("button");
  upcomingNext.id = "upcoming-next";
  upcomingNext.hidden = true;
  const upcomingDots = new Element("div");
  upcomingDots.id = "upcoming-dots";
  upcomingDots.hidden = true;

  upcomingSection.append(
    upcomingNotice,
    nextPlateTitle,
    tomorrowCutoff,
    upcomingPrev,
    upcomingRail,
    upcomingNext,
    upcomingDots,
  );

  const elements = {
    "#category-nav": new Element("div"),
    "#menu-sections": new Element("div"),
    "#today-plate": todayPlate,
    "#today-plate-section": todaySection,
    "#tomorrow-plate": upcomingRail,
    "#upcoming-plates-section": upcomingSection,
    "#upcoming-dots": upcomingDots,
    "#upcoming-notice": upcomingNotice,
    "#next-plate-title": nextPlateTitle,
    "#upcoming-prev": upcomingPrev,
    "#upcoming-next": upcomingNext,
    "#tomorrow-cutoff": tomorrowCutoff,
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

  const sessionValues = new Map(Object.entries(options.session ?? {}));
  const sessionStorage = options.sessionDisabled
    ? {
        getItem() { throw new Error("Storage is disabled in this browser."); },
        setItem() { throw new Error("Storage is disabled in this browser."); },
        removeItem() { throw new Error("Storage is disabled in this browser."); },
      }
    : {
        getItem: (key) => sessionValues.get(key) ?? null,
        setItem: (key, value) => sessionValues.set(key, value),
        removeItem: (key) => sessionValues.delete(key),
      };

  const context = vm.createContext({
    document,
    localStorage,
    sessionStorage,
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
    requestAnimationFrame: (callback) => { callback(); return 1; },
    window: {
      matchMedia: () => ({ matches: false }),
    },
  });

  vm.runInContext(menuScript, context, { filename: "docs/menu.js" });
  return {
    document,
    elements,
    localStorage,
    sessionStorage,
    sessionValues,
    todaySection,
    tomorrowSection: upcomingSection,
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

function validUpcomingSlot(serviceDate, plate = null) {
  return { serviceDate, plate };
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

// Convenience: build a payload for /api/plates/today.
function platesPayload(plate, upcoming = []) {
  return { plate, upcoming };
}

// ---------------------------------------------------------------------------
// Menu migration & rendering
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Today's plate
// ---------------------------------------------------------------------------

test("loads and renders today's plate accessibly using the same-origin API", async () => {
  let resolveResponse;
  let requestedUrl;
  let requestOptions;
  const responsePromise = new Promise((resolve) => { resolveResponse = resolve; });
  const { elements } = createPage("light", (url, options) => {
    if (url === "/api/plates/today") {
      requestedUrl = url;
      requestOptions = options;
    }
    return responsePromise;
  }, TEST_WEDNESDAY);

  assert.equal(elements["#today-plate"].attributes["aria-busy"], "true");
  assert.equal(elements["#today-plate"].children[0].textContent, "Loading today's plate…");
  resolveResponse(jsonResponse(platesPayload(validPlate())));
  await flushPromises();

  assert.equal(requestedUrl, "/api/plates/today");
  assert.equal(requestOptions.headers.Accept, "application/json");
  assert.equal(elements["#today-plate"].attributes["aria-busy"], "false");
  const article = elements["#today-plate"].children[0];
  const heading = findElement(article, (el) => el.tagName === "h3");
  const description = findElement(article, (el) => el.className === "plate-card__description");
  const date = findElement(article, (el) => el.tagName === "time");
  const price = findElement(article, (el) => el.className === "plate-card__price");
  const image = findElement(article, (el) => el.tagName === "img");

  assert.equal(article.className, "plate-card");
  assert.equal(heading.textContent, "Cottage burger");
  assert.equal(description.textContent, "Beef, cheese and chips");
  assert.equal(date.dateTime, currentServiceDate());
  assert.equal(
    price.textContent,
    new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(125),
  );
  assert.equal(image.alt, "Photo of Cottage burger");
  // Today's plate is the priority image — eager/high.
  assert.equal(image.loading, "eager");
  assert.equal(image.fetchPriority, "high");
});

test("renders the empty state and optional-photo fallback without errors", async () => {
  const empty = createPage("light", undefined, TEST_WEDNESDAY);
  await flushPromises();
  assert.match(empty.elements["#today-plate"].children[0].textContent, /No plate has been announced/);
  assert.equal(empty.elements["#today-plate"].attributes["aria-busy"], "false");

  const noPhoto = createPage("light", async () => jsonResponse(
    platesPayload(validPlate({ imageUrl: null })),
  ), TEST_WEDNESDAY);
  await flushPromises();
  const fallback = findElement(
    noPhoto.elements["#today-plate"],
    (el) => el.className === "plate-card__image-fallback",
  );
  assert.equal(fallback.textContent, "Photo coming soon");
  assert.equal(fallback.attributes.role, "img");
  assert.equal(fallback.attributes["aria-label"], "No photo available");
});

test("uses a text fallback when the plate image fails to load", async () => {
  const { elements } = createPage("light", async () =>
    jsonResponse(platesPayload(validPlate())),
    TEST_WEDNESDAY,
  );
  await flushPromises();
  const image = findElement(elements["#today-plate"], (el) => el.tagName === "img");
  assert.equal(image.listenerOptions.error.once, true);
  image.listeners.error();

  const fallback = findElement(
    elements["#today-plate"],
    (el) => el.className === "plate-card__image-fallback",
  );
  assert.equal(fallback.textContent, "Photo unavailable");
  assert.equal(fallback.attributes.role, "img");
  assert.equal(fallback.attributes["aria-label"], "Photo unavailable");
  assert.equal(findElement(elements["#today-plate"], (el) => el.tagName === "img"), undefined);
});

// ---------------------------------------------------------------------------
// Upcoming rail
// ---------------------------------------------------------------------------

test("renders tomorrow's plate in the upcoming rail with a running countdown", async () => {
  const tomorrow = new Date(`${currentServiceDate()}T00:00:00.000Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const tomorrowDate = tomorrow.toISOString().slice(0, 10);
  const beforeCutoff = new Date(`${currentServiceDate()}T12:00:00.000Z`);
  const { elements } = createPage("light", async (url) => {
    if (url === "/api/menu") return jsonResponse({ categories: apiMenu });
    return jsonResponse(platesPayload(null, [
      validUpcomingSlot(tomorrowDate, validPlate({ serviceDate: tomorrowDate, name: "Tomorrow stew" })),
    ]));
  }, beforeCutoff);
  await flushPromises();

  assert.match(elements["#today-plate"].children[0].textContent, /No plate/);
  const slot = elements["#tomorrow-plate"].children[0];
  assert.equal(slot.className, "plate-rail__slot");
  assert.equal(
    findElement(slot, (el) => el.tagName === "h3").textContent,
    "Tomorrow stew",
  );
  assert.equal(elements["#tomorrow-plate"].attributes["aria-busy"], "false");
  assert.match(elements["#tomorrow-cutoff"].textContent, /Time remaining before/);
});

test("renders multiple upcoming plates with dots and arrows", async () => {
  const { elements } = createPage("light", async (url) => {
    if (url === "/api/menu") return jsonResponse({ categories: apiMenu });
    return jsonResponse(platesPayload(null, [
      validUpcomingSlot("2026-10-12", validPlate({ serviceDate: "2026-10-12", name: "Mon" })),
      validUpcomingSlot("2026-10-13", validPlate({ serviceDate: "2026-10-13", name: "Tue" })),
      validUpcomingSlot("2026-10-14", validPlate({ serviceDate: "2026-10-14", name: "Wed" })),
    ]));
  }, TEST_SATURDAY);
  await flushPromises();

  assert.equal(elements["#tomorrow-plate"].children.length, 3);
  assert.equal(elements["#upcoming-dots"].children.length, 3);
  assert.equal(elements["#upcoming-dots"].hidden, false);
  assert.equal(elements["#upcoming-dots"].children[0].attributes["aria-selected"], "true");
  assert.equal(elements["#upcoming-dots"].children[1].attributes["aria-selected"], "false");
  // At the first slide: prev hidden, next visible.
  assert.equal(elements["#upcoming-prev"].hidden, true);
  assert.equal(elements["#upcoming-next"].hidden, false);
});

test("filters out unplanned slots so a lone Monday plate shows no dots or arrows", async () => {
  const { elements } = createPage("light", async (url) => {
    if (url === "/api/menu") return jsonResponse({ categories: apiMenu });
    return jsonResponse(platesPayload(null, [
      validUpcomingSlot("2026-10-12", validPlate({ serviceDate: "2026-10-12", name: "Mon" })),
      validUpcomingSlot("2026-10-13", null),
      validUpcomingSlot("2026-10-14", null),
      validUpcomingSlot("2026-10-15", null),
      validUpcomingSlot("2026-10-16", null),
    ]));
  }, TEST_SATURDAY);
  await flushPromises();

  assert.equal(elements["#tomorrow-plate"].children.length, 1);
  assert.equal(elements["#upcoming-dots"].hidden, true);
  assert.equal(elements["#upcoming-prev"].hidden, true);
  assert.equal(elements["#upcoming-next"].hidden, true);
  const heading = findElement(elements["#tomorrow-plate"], (el) => el.tagName === "h3");
  assert.equal(heading.textContent, "Mon");
});

test("shows a message in the rail when nothing is planned but the countdown still shows", async () => {
  const { elements } = createPage("light", async (url) => {
    if (url === "/api/menu") return jsonResponse({ categories: apiMenu });
    return jsonResponse(platesPayload(null, [
      validUpcomingSlot("2026-10-12", null),
      validUpcomingSlot("2026-10-13", null),
    ]));
  }, TEST_SUNDAY);
  await flushPromises();

  // Section is visible because countdown is meaningful.
  assert.equal(elements["#upcoming-plates-section"].hidden, false);
  const message = elements["#tomorrow-plate"].children[0];
  assert.match(message.textContent, /No upcoming plates/);
  assert.equal(elements["#upcoming-dots"].hidden, true);
});

test("next arrow advances the slide and dot state", async () => {
  const { elements } = createPage("light", async (url) => {
    if (url === "/api/menu") return jsonResponse({ categories: apiMenu });
    return jsonResponse(platesPayload(null, [
      validUpcomingSlot("2026-10-12", validPlate({ serviceDate: "2026-10-12" })),
      validUpcomingSlot("2026-10-13", validPlate({ serviceDate: "2026-10-13" })),
      validUpcomingSlot("2026-10-14", validPlate({ serviceDate: "2026-10-14" })),
    ]));
  }, TEST_SATURDAY);
  await flushPromises();

  elements["#upcoming-next"].listeners.click();
  assert.equal(elements["#upcoming-dots"].children[1].attributes["aria-selected"], "true");
  assert.equal(elements["#upcoming-prev"].hidden, false);

  elements["#upcoming-next"].listeners.click();
  assert.equal(elements["#upcoming-dots"].children[2].attributes["aria-selected"], "true");
  assert.equal(elements["#upcoming-next"].hidden, true);
  // scrollIntoView received the reduced-motion-agnostic options
  const slot = elements["#tomorrow-plate"].children[2];
  assert.equal(slot.scrollIntoViewOptions.inline, "start");
  assert.equal(slot.scrollIntoViewOptions.block, "nearest");
});

test("prev arrow walks the slide back and dot click jumps directly", async () => {
  const { elements } = createPage("light", async (url) => {
    if (url === "/api/menu") return jsonResponse({ categories: apiMenu });
    return jsonResponse(platesPayload(null, [
      validUpcomingSlot("2026-10-12", validPlate({ serviceDate: "2026-10-12" })),
      validUpcomingSlot("2026-10-13", validPlate({ serviceDate: "2026-10-13" })),
      validUpcomingSlot("2026-10-14", validPlate({ serviceDate: "2026-10-14" })),
    ]));
  }, TEST_SATURDAY);
  await flushPromises();

  elements["#upcoming-next"].listeners.click();
  elements["#upcoming-next"].listeners.click();
  assert.equal(elements["#upcoming-dots"].children[2].attributes["aria-selected"], "true");

  elements["#upcoming-prev"].listeners.click();
  assert.equal(elements["#upcoming-dots"].children[1].attributes["aria-selected"], "true");

  elements["#upcoming-dots"].children[0].listeners.click();
  assert.equal(elements["#upcoming-dots"].children[0].attributes["aria-selected"], "true");
  assert.equal(elements["#upcoming-prev"].hidden, true);
});

test("scrolling the rail re-selects the closest dot", async () => {
  const { elements } = createPage("light", async (url) => {
    if (url === "/api/menu") return jsonResponse({ categories: apiMenu });
    return jsonResponse(platesPayload(null, [
      validUpcomingSlot("2026-10-12", validPlate({ serviceDate: "2026-10-12" })),
      validUpcomingSlot("2026-10-13", validPlate({ serviceDate: "2026-10-13" })),
      validUpcomingSlot("2026-10-14", validPlate({ serviceDate: "2026-10-14" })),
    ]));
  }, TEST_SATURDAY);
  await flushPromises();

  const rail = elements["#tomorrow-plate"];
  rail.scrollLeft = rail.children[1].offsetLeft;
  rail.listeners.scroll();
  assert.equal(elements["#upcoming-dots"].children[1].attributes["aria-selected"], "true");
  assert.equal(elements["#upcoming-dots"].children[0].attributes["aria-selected"], "false");
});

// ---------------------------------------------------------------------------
// Workday gating
// ---------------------------------------------------------------------------

test("Saturday: no today plate, still queries the API, renders next week's rail", async () => {
  const calls = [];
  const { elements, todaySection, tomorrowSection } = createPage("light", async (url) => {
    calls.push(url);
    if (url === "/api/menu") return jsonResponse({ categories: apiMenu });
    return jsonResponse(platesPayload(null, [
      validUpcomingSlot("2026-10-12", validPlate({ serviceDate: "2026-10-12", name: "Next Monday" })),
    ]));
  }, TEST_SATURDAY);
  await flushPromises();

  assert.ok(calls.includes("/api/plates/today"), "plates API is called on Saturday");
  assert.equal(todaySection.hidden, true);
  assert.equal(tomorrowSection.hidden, false);
  assert.equal(elements["#next-plate-title"].textContent, "Next week's plates");
  // No countdown: tomorrow (Sunday) is not a workday.
  assert.equal(elements["#tomorrow-cutoff"].hidden, true);
  assert.equal(elements["#tomorrow-cutoff"].textContent, "");
  // One planned plate renders.
  assert.equal(elements["#tomorrow-plate"].children.length, 1);
});

test("Saturday: hides the section when no upcoming plates are planned and no countdown runs", async () => {
  const { elements, todaySection, tomorrowSection } = createPage("light", async (url) => {
    if (url === "/api/menu") return jsonResponse({ categories: apiMenu });
    return jsonResponse(platesPayload(null, [
      validUpcomingSlot("2026-10-12", null),
    ]));
  }, TEST_SATURDAY);
  await flushPromises();

  assert.equal(todaySection.hidden, true);
  assert.equal(tomorrowSection.hidden, true);
});

test("Sunday: hides today, shows Monday's plate, countdown visible", async () => {
  const calls = [];
  const { elements, todaySection, tomorrowSection } = createPage("light", async (url) => {
    calls.push(url);
    if (url === "/api/menu") return jsonResponse({ categories: apiMenu });
    return jsonResponse(platesPayload(null, [
      validUpcomingSlot("2026-10-12", validPlate({ serviceDate: "2026-10-12", name: "Monday stew" })),
    ]));
  }, TEST_SUNDAY);
  await flushPromises();

  assert.ok(calls.includes("/api/plates/today"));
  assert.equal(todaySection.hidden, true);
  assert.equal(tomorrowSection.hidden, false);
  assert.equal(elements["#next-plate-title"].textContent, "Tomorrow's Plate");
  // Tomorrow (Monday) is a workday → countdown runs.
  assert.equal(elements["#tomorrow-cutoff"].hidden, false);
  assert.match(elements["#tomorrow-cutoff"].textContent, /Time remaining before/);
  const heading = findElement(elements["#tomorrow-plate"], (el) => el.tagName === "h3");
  assert.equal(heading.textContent, "Monday stew");
});

test("Friday: renders today's plate, hides the section when no upcoming plates and no countdown", async () => {
  const { elements, todaySection, tomorrowSection } = createPage("light", async (url) => {
    if (url === "/api/menu") return jsonResponse({ categories: apiMenu });
    return jsonResponse(platesPayload(
      validPlate({ serviceDate: "2026-10-09", name: "Friday special" }),
    ));
  }, TEST_FRIDAY);
  await flushPromises();

  assert.equal(todaySection.hidden, false);
  const heading = findElement(elements["#today-plate"], (el) => el.tagName === "h3");
  assert.equal(heading.textContent, "Friday special");

  // Tomorrow is Saturday → countdown hidden.
  assert.equal(elements["#tomorrow-cutoff"].hidden, true);
  // No plates + no countdown → section hidden.
  assert.equal(tomorrowSection.hidden, true);
});

test("Monday: today's plate plus four upcoming slots with four dots", async () => {
  const { elements } = createPage("light", async (url) => {
    if (url === "/api/menu") return jsonResponse({ categories: apiMenu });
    return jsonResponse(platesPayload(
      validPlate({ serviceDate: "2026-10-05", name: "Monday special" }),
      [
        validUpcomingSlot("2026-10-06", validPlate({ serviceDate: "2026-10-06" })),
        validUpcomingSlot("2026-10-07", validPlate({ serviceDate: "2026-10-07" })),
        validUpcomingSlot("2026-10-08", validPlate({ serviceDate: "2026-10-08" })),
        validUpcomingSlot("2026-10-09", validPlate({ serviceDate: "2026-10-09" })),
      ],
    ));
  }, TEST_MONDAY);
  await flushPromises();

  assert.equal(elements["#upcoming-dots"].children.length, 4);
  assert.equal(elements["#tomorrow-plate"].children.length, 4);
  assert.match(elements["#tomorrow-cutoff"].textContent, /Time remaining before/);
});

// ---------------------------------------------------------------------------
// Countdown boundary
// ---------------------------------------------------------------------------

test("tomorrow cutoff countdown handles before, exact, and after 15:00 in Johannesburg", async () => {
  const date = currentServiceDate();
  const tomorrow = new Date(`${date}T00:00:00.000Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const tomorrowDate = tomorrow.toISOString().slice(0, 10);
  const payload = platesPayload(null, [
    validUpcomingSlot(tomorrowDate, validPlate({ serviceDate: tomorrowDate })),
  ]);

  const before = createPage(
    "light",
    async (url) => url === "/api/menu"
      ? jsonResponse({ categories: apiMenu })
      : jsonResponse(payload),
    new Date(`${date}T12:59:59.000Z`),
  );
  await flushPromises();
  assert.match(before.elements["#tomorrow-cutoff"].textContent, /0h 0m 1s/);

  const exact = createPage(
    "light",
    async (url) => url === "/api/menu"
      ? jsonResponse({ categories: apiMenu })
      : jsonResponse(payload),
    new Date(`${date}T13:00:00.000Z`),
  );
  await flushPromises();
  assert.match(exact.elements["#tomorrow-cutoff"].textContent, /cutoff.*passed/i);

  const after = createPage(
    "light",
    async (url) => url === "/api/menu"
      ? jsonResponse({ categories: apiMenu })
      : jsonResponse(payload),
    new Date(`${date}T14:00:00.000Z`),
  );
  await flushPromises();
  assert.match(after.elements["#tomorrow-cutoff"].textContent, /cutoff.*passed/i);
});

// ---------------------------------------------------------------------------
// Unavailable states
// ---------------------------------------------------------------------------

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
    ["stale today's plate", async () => jsonResponse(platesPayload(
      validPlate({ serviceDate: "2000-01-01" }),
      [],
    ))],
    ["invalid image URL", async () => jsonResponse(platesPayload(
      validPlate({ imageUrl: "javascript:alert(1)" }),
      [],
    ))],
    ["malformed plate payload", async () => jsonResponse(platesPayload(
      { name: "Missing fields" },
      [],
    ))],
    ["invalid upcoming slot", async () => jsonResponse(platesPayload(
      null,
      [{ serviceDate: "not-a-date", plate: null }],
    ))],
    ["upcoming slot with mismatched service date", async () => jsonResponse(platesPayload(
      null,
      [validUpcomingSlot("2026-10-08", validPlate({ serviceDate: "2026-10-10" }))],
    ))],
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
// Plates cache
// ---------------------------------------------------------------------------

const PLATES_CACHE_KEY = "cottage44-plates-cache";

test("renders a cached plates payload synchronously before the API responds", async () => {
  let resolveResponse;
  const pending = new Promise((resolve) => { resolveResponse = resolve; });

  const cached = {
    cachedFor: "2026-10-07",
    plate: validPlate({ serviceDate: "2026-10-07", name: "Cached Wednesday" }),
    upcoming: [
      validUpcomingSlot("2026-10-08", validPlate({ serviceDate: "2026-10-08", name: "Cached Thursday" })),
    ],
  };

  const { elements } = createPage(
    "light",
    () => pending,
    TEST_WEDNESDAY,
    { session: { [PLATES_CACHE_KEY]: JSON.stringify(cached) } },
  );

  // Synchronous render — before the fetch resolves.
  const heading = findElement(elements["#today-plate"], (el) => el.tagName === "h3");
  assert.equal(heading.textContent, "Cached Wednesday");
  assert.equal(elements["#tomorrow-plate"].children.length, 1);

  resolveResponse(jsonResponse(platesPayload(null, [])));
  await flushPromises();
});

test("writes the plates payload to sessionStorage after a successful load", async () => {
  const { sessionStorage } = createPage("light", async (url) => {
    if (url === "/api/menu") return jsonResponse({ categories: apiMenu });
    return jsonResponse(platesPayload(
      validPlate({ serviceDate: "2026-10-07", name: "Fresh Wednesday" }),
      [validUpcomingSlot("2026-10-08", null)],
    ));
  }, TEST_WEDNESDAY);
  await flushPromises();

  const raw = sessionStorage.getItem(PLATES_CACHE_KEY);
  assert.equal(typeof raw, "string");
  const parsed = JSON.parse(raw);
  assert.equal(parsed.cachedFor, "2026-10-07");
  assert.equal(parsed.plate.name, "Fresh Wednesday");
  assert.equal(parsed.upcoming.length, 1);
});

test("ignores a plates cache from a previous day and renders the fresh payload", async () => {
  const stale = {
    cachedFor: "2026-10-01",
    plate: validPlate({ serviceDate: "2026-10-01", name: "Old" }),
    upcoming: [],
  };
  const { elements } = createPage("light", async (url) => {
    if (url === "/api/menu") return jsonResponse({ categories: apiMenu });
    return jsonResponse(platesPayload(
      validPlate({ serviceDate: "2026-10-07", name: "Fresh" }),
      [],
    ));
  }, TEST_WEDNESDAY, { session: { [PLATES_CACHE_KEY]: JSON.stringify(stale) } });

  // Nothing rendered from the stale cache synchronously.
  assert.equal(findElement(elements["#today-plate"], (el) => el.tagName === "h3"), undefined);

  await flushPromises();
  const heading = findElement(elements["#today-plate"], (el) => el.tagName === "h3");
  assert.equal(heading.textContent, "Fresh");
});

test("ignores a plates cache with an invalid shape", async () => {
  const bad = {
    cachedFor: "2026-10-07",
    plate: { broken: true },
    upcoming: [],
  };
  const { elements } = createPage("light", async (url) => {
    if (url === "/api/menu") return jsonResponse({ categories: apiMenu });
    return jsonResponse(platesPayload(
      validPlate({ serviceDate: "2026-10-07", name: "Fresh" }),
      [],
    ));
  }, TEST_WEDNESDAY, { session: { [PLATES_CACHE_KEY]: JSON.stringify(bad) } });

  assert.equal(findElement(elements["#today-plate"], (el) => el.tagName === "h3"), undefined);
  await flushPromises();
  const heading = findElement(elements["#today-plate"], (el) => el.tagName === "h3");
  assert.equal(heading.textContent, "Fresh");
});

test("keeps the cached plates when the refresh fetch fails", async () => {
  const cached = {
    cachedFor: "2026-10-07",
    plate: validPlate({ serviceDate: "2026-10-07", name: "Cached" }),
    upcoming: [],
  };
  const { elements } = createPage(
    "light",
    async (url) => {
      if (url === "/api/menu") return jsonResponse({ categories: apiMenu });
      throw new Error("offline");
    },
    TEST_WEDNESDAY,
    { session: { [PLATES_CACHE_KEY]: JSON.stringify(cached) } },
  );
  await flushPromises();

  const heading = findElement(elements["#today-plate"], (el) => el.tagName === "h3");
  assert.equal(heading.textContent, "Cached");
  assert.doesNotMatch(
    elements["#today-plate"].children[0].textContent,
    /temporarily unavailable/,
  );
});

// ---------------------------------------------------------------------------
// Menu cache (unchanged behaviour)
// ---------------------------------------------------------------------------

const CACHE_KEY = "cottage44-menu-cache";

test("renders a cached menu synchronously before the API responds", async () => {
  let resolveResponse;
  const pending = new Promise((resolve) => { resolveResponse = resolve; });

  const { elements, sessionStorage } = createPage(
    "light",
    () => pending,
    TEST_WEDNESDAY,
    { session: { [CACHE_KEY]: JSON.stringify(apiMenu) } },
  );

  assert.equal(elements["#menu-sections"].children.length, apiMenu.length);
  assert.equal(elements["#category-nav"].children.length, apiMenu.length);
  assert.equal(elements["#menu-sections"].children[0].children[0].textContent, "Toasties");
  assert.equal(sessionStorage.getItem(CACHE_KEY), JSON.stringify(apiMenu));

  resolveResponse(jsonResponse({ categories: apiMenu }));
  await flushPromises();
  assert.equal(elements["#menu-sections"].children.length, apiMenu.length);
});

test("writes the menu to sessionStorage after a successful load", async () => {
  const { sessionStorage } = createPage(
    "light",
    async () => jsonResponse({ categories: apiMenu }),
    TEST_WEDNESDAY,
  );
  await flushPromises();

  const cached = sessionStorage.getItem(CACHE_KEY);
  assert.equal(typeof cached, "string");
  const parsed = JSON.parse(cached);
  assert.deepEqual(
    parsed.map((category) => category.category),
    apiMenu.map((category) => category.category),
  );
  assert.equal(parsed[0].items.length, apiMenu[0].items.length);
});

test("keeps the cached menu when the refresh fetch fails", async () => {
  const { elements, sessionStorage } = createPage(
    "light",
    async () => { throw new Error("offline"); },
    TEST_WEDNESDAY,
    { session: { [CACHE_KEY]: JSON.stringify(apiMenu) } },
  );
  await flushPromises();

  assert.equal(elements["#menu-sections"].children.length, apiMenu.length);
  assert.equal(elements["#menu-sections"].children[0].children[0].textContent, "Toasties");
  const menuText = elements["#menu-sections"].children
    .map((section) => section.children[0].textContent)
    .join(" ");
  assert.doesNotMatch(menuText, /temporarily unavailable/);
  assert.equal(sessionStorage.getItem(CACHE_KEY), JSON.stringify(apiMenu));
});

test("shows the unavailable message when the fetch fails and there is no cache", async () => {
  const { elements } = createPage(
    "light",
    async () => { throw new Error("offline"); },
    TEST_WEDNESDAY,
  );
  await flushPromises();
  assert.match(elements["#menu-sections"].children[0].textContent, /temporarily unavailable/);
});

test("ignores a malformed cached menu and falls back to the API", async () => {
  const calls = [];
  const { elements, sessionStorage } = createPage(
    "light",
    async (url) => {
      calls.push(url);
      return jsonResponse({ categories: apiMenu });
    },
    TEST_WEDNESDAY,
    { session: { [CACHE_KEY]: "{not json" } },
  );
  await flushPromises();

  assert.ok(calls.includes("/api/menu"));
  assert.equal(elements["#menu-sections"].children.length, apiMenu.length);
  assert.equal(sessionStorage.getItem(CACHE_KEY), JSON.stringify(apiMenu));
});

test("ignores a cached menu whose shape fails validation", async () => {
  const calls = [];
  const badShape = [{ category: "", items: [] }];
  const { elements } = createPage(
    "light",
    async (url) => {
      calls.push(url);
      return jsonResponse({ categories: apiMenu });
    },
    TEST_WEDNESDAY,
    { session: { [CACHE_KEY]: JSON.stringify(badShape) } },
  );
  await flushPromises();

  assert.ok(calls.includes("/api/menu"));
  assert.equal(elements["#menu-sections"].children.length, apiMenu.length);
  assert.equal(elements["#menu-sections"].children[0].children[0].textContent, "Toasties");
});

test("survives a disabled sessionStorage and still renders the API menu", async () => {
  const { elements } = createPage(
    "light",
    async () => jsonResponse({ categories: apiMenu }),
    TEST_WEDNESDAY,
    { sessionDisabled: true },
  );
  await flushPromises();
  assert.equal(elements["#menu-sections"].children.length, apiMenu.length);
  assert.equal(elements["#menu-sections"].children[0].children[0].textContent, "Toasties");
});

test("renders the cached menu when storage works but the API never responds", async () => {
  const { elements } = createPage(
    "light",
    () => new Promise(() => {}),
    TEST_WEDNESDAY,
    { session: { [CACHE_KEY]: JSON.stringify(apiMenu) } },
  );
  await flushPromises();

  assert.equal(elements["#menu-sections"].children.length, apiMenu.length);
  assert.equal(elements["#menu-sections"].children[0].children[0].textContent, "Toasties");
  assert.equal(elements["#category-nav"].children.length, apiMenu.length);
  assert.equal(elements["#category-nav"].children[0].textContent, "Toasties");
});

// ---------------------------------------------------------------------------
// HTML structure assertions
// ---------------------------------------------------------------------------

test("includes a labelled Plate of the Day live region in the page", () => {
  assert.match(html, /<section class="plate-day" aria-labelledby="plate-day-title">/);
  assert.match(html, /id="today-plate"[\s\S]*aria-live="polite"/);
  assert.match(html, /id="plate-day-title">Plate of the Day<\/h2>/);
  assert.match(
    html,
    /class="plate-day__notice">Today's orders had to be placed through the canteen by 15:00 yesterday\.<\/p>/,
  );
});

test("upcoming section exposes a labelled rail, arrows, dots, and a rewritable notice", () => {
  assert.match(html, /id="upcoming-plates-section"/);
  assert.match(html, /id="upcoming-notice"/);
  assert.match(html, /id="next-plate-title">Tomorrow's Plate<\/h2>/);
  assert.match(html, /id="tomorrow-cutoff"/);
  assert.match(html, /class="plate-rail"[\s\S]*?id="tomorrow-plate"[\s\S]*?role="region"/);
  assert.match(html, /id="upcoming-prev"[\s\S]*?aria-label="Previous plate"/);
  assert.match(html, /id="upcoming-next"[\s\S]*?aria-label="Next plate"/);
  assert.match(html, /id="upcoming-dots"[\s\S]*?role="tablist"/);
});

test("provides a subtle owner sign-in link in the public site footer", () => {
  assert.match(html, /<a class="site-footer__admin" href="\/admin\/">Owner sign in<\/a>/);
});

test("uses the exact Cottage 44 red accent in both public light and dark themes", () => {
  assert.match(styles, /--brand-accent:\s*#C12025;/);
  assert.match(styles, /:root\[data-theme="dark"\][\s\S]*?--color-accent:\s*#C12025;/);
});
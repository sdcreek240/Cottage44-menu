import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const adminHtml = await readFile(path.join(root, "docs/admin/index.html"), "utf8");
const adminCss = await readFile(path.join(root, "docs/admin/admin.css"), "utf8");
const adminScript = await readFile(path.join(root, "docs/admin/admin.js"), "utf8");

function initialAdminTheme(storedTheme = null) {
  const [, script] = adminHtml.match(/<script>\s*([\s\S]*?)\s*<\/script>/) ?? [];
  assert.ok(script, "admin.html contains its inline theme initialization script");
  const meta = { content: "" };
  const document = {
    documentElement: { dataset: {} },
    querySelector: (selector) =>
      selector === 'meta[name="theme-color"]' ? meta : null,
  };
  const context = vm.createContext({
    document,
    localStorage: { getItem: () => storedTheme },
  });
  vm.runInContext(script, context, { filename: "docs/admin/index.html inline theme script" });
  return { theme: document.documentElement.dataset.theme, themeColor: meta.content };
}

const adminSelectors = [
  "#status",
  "#status-icon",
  "#status-message",
  "#status-close",
  "#sign-in-panel",
  "#sign-in-form",
  "#sign-in-submit",
  "#password",
  "#toggle-password",
  "#recovery-request-panel",
  "#recovery-request-form",
  "#recovery-submit",
  "#password-reset-panel",
  "#password-reset-form",
  "#password-reset-submit",
  "#new-password",
  "#toggle-new-password",
  "#toggle-confirm-password",
  "#forgot-password",
  "#back-to-sign-in",
  "#back-from-password-reset",
  "#recovery-email",
  "#new-password",
  "#confirm-password",
  "#dashboard",
  "#today-plan-view",
  "#plate-library-view",
  "#history-view",
  "#today",
  "#planning",
  "#nav-today-plan",
  "#nav-plate-library",
  "#nav-history",
  "#sign-out",
  "#plate-form",
  "#plate-editor-panel",
  "#plate-id",
  "#plate-name",
  "#plate-description",
  "#plate-price",
  "#plate-image",
  "#plate-camera-image",
  "#image-note",
  "#image-preview",
  "#image-preview-image",
  "#clear-image",
  "#plate-list",
  "#history-state",
  "#history-list",
  "#history-retry",
  "#history-load-more",
  "#history-search",
  "#history-event-filter",
  "#today-select",
  "#today-plate-search",
  "#today-plate-search-wrap",
  "#today-summary",
  "#service-date",
  "#set-today",
  "#clear-today",
  "#average-price",
  "#new-plate",
  "#cancel-edit",
  "#save-plate",
  "#editor-title",
  "#email",
  "#schedule-date",
  "#schedule-select",
  "#plan-plate-search",
  "#plan-plate-search-wrap",
  "#library-plate-search",
  "#library-plate-search-wrap",
  "#library-search-empty",
  "#save-schedule",
  "#schedule-summary",
  "#weekly-plan-list",
];

test("admin theme defaults to dark and respects a saved shared theme", () => {
  assert.match(adminHtml, /<html lang="en-GB" data-theme="dark">/);
  assert.deepEqual(initialAdminTheme(), { theme: "dark", themeColor: "#1c1a1a" });
  assert.deepEqual(initialAdminTheme("light"), { theme: "light", themeColor: "#f7f5ef" });
  assert.deepEqual(initialAdminTheme("dark"), { theme: "dark", themeColor: "#1c1a1a" });
  assert.match(adminHtml, /localStorage\.getItem\("cottage44-theme"\)/);
});

test("uses the exact Cottage 44 red accent in admin light and dark themes", () => {
  assert.match(adminCss, /--accent:\s*#C12025;/);
  assert.match(adminCss, /:root\[data-theme="light"\][\s\S]*?--accent:\s*#C12025;/);
  for (const kind of ["success", "error", "info", "warning"]) {
    assert.match(adminCss, new RegExp(`\\.status\\[data-kind="${kind}"\\]`));
  }
});

test("admin dashboard navigation exposes the three grouped views", () => {
  const ids = [...adminHtml.matchAll(/\bid="([^"]+)"/g)].map(([, id]) => id);
  assert.equal(new Set(ids).size, ids.length, "admin page IDs are unique");
  for (const selector of adminSelectors) {
    assert.ok(ids.includes(selector.slice(1)), `${selector} remains available to admin.js`);
  }

  const navigation = adminHtml.match(
    /<nav class="dashboard-nav" aria-label="([^"]+)">([\s\S]*?)<\/nav>/,
  );
  assert.ok(navigation, "dashboard has an explicitly labelled section navigation");
  assert.equal(navigation[1], "Admin sections");
  const targets = [...navigation[2].matchAll(/href="#([^"]+)"/g)].map(([, id]) => id);
  assert.deepEqual(targets, ["today-plan-view", "plate-library-view", "history-view"]);
  assert.deepEqual(
    [...navigation[2].matchAll(/>([^<]+)<\/a>/g)].map(([, label]) => label),
    ["Today’s Plate / Plan Ahead", "Plate Library / Saved Plates", "History"],
  );
  for (const target of targets) {
    assert.ok(ids.includes(target), `navigation target #${target} exists`);
  }

  assert.match(adminHtml, /<h1>Manage the menu<\/h1>/);
  assert.match(adminHtml, /<h2 id="today-title">Today’s plate/);
  assert.match(adminHtml, /<p class="eyebrow">Day 1 · Today<\/p>/);
  assert.match(adminHtml, /Days 2–6 · Next 5 days/);
  const todayPlan = adminHtml.indexOf('id="today-plan-view"');
  const today = adminHtml.indexOf('id="today"');
  const planning = adminHtml.indexOf('id="planning"');
  const libraryView = adminHtml.indexOf('id="plate-library-view"');
  const library = adminHtml.indexOf('id="plate-library"');
  const historyView = adminHtml.indexOf('id="history-view"');
  const history = adminHtml.indexOf('id="history"');
  assert.ok(todayPlan < today && today < planning && planning < libraryView);
  assert.ok(libraryView < library && library < historyView);
  assert.ok(historyView < history);
  assert.ok(today < adminHtml.indexOf('id="today-select"'));
  assert.ok(planning < adminHtml.indexOf('id="schedule-date"'));
  assert.ok(library < adminHtml.indexOf('id="plate-form"'));
  assert.ok(history < adminHtml.indexOf('id="history-list"'));
  assert.match(adminHtml, /search further back\. Past plate snapshots stay here/);
  assert.match(adminHtml, /id="history-state"[^>]*aria-live="polite"/);
});

test("admin dashboard layout switches from grouped desktop columns to a narrow single column", () => {
  assert.match(adminCss, /main\s*\{[\s\S]*?width:\s*min\(100% - 2rem,\s*1120px\)/);
  assert.match(adminCss, /\.admin-dashboard\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(adminCss, /\.library-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(
    adminCss,
    /@media \(max-width:\s*54rem\)\s*\{[\s\S]*?\.admin-dashboard,\s*\.library-grid,\s*\.today-plan-view\s*\{[\s\S]*?grid-template-columns:\s*1fr/,
  );
  assert.match(adminCss, /\.dashboard-nav\s*\{[\s\S]*?flex-wrap:\s*wrap/);
  assert.match(adminCss, /\.dashboard-view\[hidden\]\s*\{[\s\S]*?display:\s*none/);
  assert.match(adminCss, /\.today-plan-view\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,/);
  assert.match(adminCss, /@media \(max-width:\s*42rem\)[\s\S]*?\.weekly-plan-row,\s*\.price-input-row,\s*\.history-controls\s*\{[\s\S]*?grid-template-columns:\s*1fr/);
  assert.match(adminCss, /@media \(max-width:\s*600px\)[\s\S]*?\.dashboard-nav a\s*\{[\s\S]*?flex:\s*1 1 100%/);
  assert.match(adminCss, /@media \(max-width:\s*600px\)[\s\S]*?\.plate-item__actions \.button\s*\{[\s\S]*?min-height:\s*2\.8rem/);
  assert.match(adminCss, /\.plate-editor-panel\s*\{[\s\S]*?scroll-margin-top:\s*1rem/);
  assert.match(adminCss, /\.plate-editor-panel--editing\s*\{[\s\S]*?border-color:\s*var\(--accent\)/);
});

test("admin dates and photo sources explain locale-safe input and native camera behavior", () => {
  assert.match(adminHtml, /<html lang="en-GB"/);
  assert.match(adminHtml, /Date to plan \(DD\/MM\/YYYY\)/);
  assert.match(adminHtml, /id="schedule-date" type="date"/);
  assert.match(adminHtml, /Your device may display the date picker in its own format/);
  assert.match(adminHtml, /id="plate-image"[^>]*type="file"[^>]*accept="image\/\*[^"]*"/);
  assert.match(adminHtml, /id="plate-camera-image"[^>]*type="file"[^>]*capture="environment"/);
  assert.match(adminHtml, /Choose a photo from your library/);
  assert.match(adminHtml, /Take a new picture/);
  assert.match(adminHtml, /Newest changes first\.[\s\S]*load older entries to search further back/);
  for (const value of ["all", "assignment", "plan", "library"]) {
    assert.match(adminHtml, new RegExp(`<option value="${value}">`));
  }
  assert.match(adminHtml, /id="history-search" type="search"/);
});

class Element {
  constructor() {
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.hidden = false;
    this.value = "";
    this.type = "text";
    this.name = "";
    this.files = [];
    this.listeners = {};
    this.classNames = new Set();
    this.classList = {
      add: (name) => this.classNames.add(name),
      remove: (name) => this.classNames.delete(name),
      contains: (name) => this.classNames.has(name),
    };
  }

  append(...elements) {
    this.children.push(...elements);
  }

  replaceChildren(...elements) {
    this.children = [...elements];
  }

  addEventListener(event, callback) {
    this.listeners[event] = callback;
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  removeAttribute(name) {
    delete this.attributes[name];
  }

  focus(options) {
    this.focusOptions = options;
    this.focusCount = (this.focusCount ?? 0) + 1;
  }

  scrollIntoView(options) {
    this.scrollOptions = options;
  }

  reset() {}
}

test("admin UI remembers by default and completes sign-in, upload, save, and today's assignment", async () => {
  assert.match(adminHtml, /id="remember-me"[^>]*type="checkbox"[^>]*checked/);
  assert.match(adminHtml, /Remember me for 30 days/);
  assert.doesNotMatch(adminScript, /localStorage|sessionStorage/);
  assert.match(adminHtml, /id="forgot-password"/);
  assert.match(adminHtml, /id="password-reset-form"/);
  assert.match(adminHtml, /id="password"[^>]*autocomplete="current-password"/);
  assert.match(adminHtml, /id="new-password"[^>]*autocomplete="new-password"/);
  assert.match(adminHtml, /id="confirm-password"[^>]*autocomplete="new-password"/);
  assert.match(adminHtml, /id="toggle-password"[^>]*aria-label="Show password"/);
  assert.match(adminHtml, /id="toggle-new-password"[^>]*aria-controls="new-password"/);
  assert.match(adminHtml, /id="toggle-confirm-password"[^>]*aria-pressed="false"/);
  assert.match(adminHtml, /View \/ Edit \/ Delete Plates/);

  const elements = Object.fromEntries(
    adminSelectors.map((selector) => [selector, new Element()]),
  );
  elements["#clear-today"].textContent = "Clear today’s plate";
  for (const [toggle, input] of [
    ["#toggle-password", "password"],
    ["#toggle-new-password", "new-password"],
    ["#toggle-confirm-password", "confirm-password"],
  ]) {
    elements[toggle].setAttribute("aria-controls", input);
    elements[`#${input}`].type = "password";
  }
  for (const selector of [
    "#dashboard",
    "#sign-out",
    "#recovery-request-panel",
    "#password-reset-panel",
  ]) {
    elements[selector].hidden = true;
  }
  const calls = [];
  const timers = new Map();
  const scheduledFrequencies = [];
  let audioContextCount = 0;
  let nextTimer = 1;
  let savedPlates = [];
  let todaysPlate = null;
  const scheduledPlates = new Map();
  let historyEvents = [];
  let nextHistoryId = 1;
  let failSignIn = true;
  let failImageUpload = false;
  let failSave = false;
  let failSchedule = false;
  let failDelete = false;
  let failHistory = false;
  let failRecovery = false;
  let failReset = false;
  let failSignOut = false;
  let holdAssignment = false;
  let resolveAssignment;
  let holdTodayClear = false;
  let resolveTodayClear;
  const windowListeners = {};
  const imageUrl =
    "https://cottage44-test.supabase.co/storage/v1/object/public/cottage44-plates/123e4567-e89b-42d3-a456-426614174000.jpg";

  function snapshot(plate) {
    return {
      id: plate.id,
      name: plate.name,
      description: plate.description,
      priceCents: plate.priceCents,
      imageUrl: plate.imageUrl ?? null,
    };
  }

  async function fetchMock(url, options = {}) {
    calls.push({ url, options });
    if (url === "/api/admin/session" && !options.method) {
      return Response.json({ authenticated: false });
    }
    if (url === "/api/admin/session" && options.method === "POST") {
      if (failSignIn) {
        return Response.json({ error: "Email or password is incorrect." }, { status: 401 });
      }
      return Response.json({ authenticated: true, email: "corne.dawson@gmail.com" });
    }
    if (url === "/api/admin/password-recovery" && options.method === "POST") {
      if (failRecovery) {
        return Response.json({ error: "Recovery service unavailable." }, { status: 503 });
      }
      return Response.json({
        message: "If the address belongs to the owner account, a password reset email will arrive shortly.",
      });
    }
    if (url === "/api/admin/password-recovery/update" && options.method === "POST") {
      if (failReset) {
        return Response.json({ error: "Password reset service unavailable." }, { status: 503 });
      }
      return Response.json({ updated: true });
    }
    if (url === "/api/admin/session" && options.method === "DELETE") {
      if (failSignOut) {
        return Response.json({ error: "Sign-out service unavailable." }, { status: 503 });
      }
      return Response.json({ signedOut: true });
    }
    if (url === "/api/admin/plates" && !options.method) {
      return Response.json({ plates: savedPlates });
    }
    if (url === "/api/admin/plates/today" && !options.method) {
      return Response.json({
        serviceDate: "2026-10-07",
        today: todaysPlate,
        upcoming: [...scheduledPlates.entries()].map(([serviceDate, plate]) => ({
          serviceDate,
          plate,
        })),
      });
    }
    if (url.startsWith("/api/admin/history")) {
      if (failHistory) {
        return Response.json({ error: "History service unavailable." }, { status: 503 });
      }
      const before = new URL(url, "https://menu.example").searchParams.get("before");
      const rows = historyEvents
        .filter((item) => before === null || item.id < Number(before))
        .sort((left, right) => right.id - left.id);
      const events = rows.slice(0, 100);
      const hasMore = rows.length > 100;
      return Response.json({
        events,
        hasMore,
        nextBefore: hasMore ? events.at(-1).id : null,
      });
    }
    if (url === "/api/admin/images") {
      if (failImageUpload) {
        return Response.json({ error: "The image could not be uploaded. Please try again." }, { status: 502 });
      }
      return Response.json({ imageUrl });
    }
    if (url === "/api/admin/plates" && options.method === "POST") {
      if (failSave) {
        return Response.json({ error: "Plate save service unavailable." }, { status: 503 });
      }
      const input = JSON.parse(options.body);
      const plate = {
        id: "8d2b48f2-7932-4ff0-9e80-7ac5efc438f0",
        ...input,
      };
      savedPlates = [plate];
      return Response.json({ plate }, { status: 201 });
    }
    if (url.startsWith("/api/admin/plates/") && options.method === "PATCH") {
      const input = JSON.parse(options.body);
      const plate = { ...savedPlates[0], ...input };
      savedPlates = [plate];
      return Response.json({ plate });
    }
    if (url === "/api/admin/plates/today" && options.method === "POST") {
      if (failSchedule) {
        return Response.json({ error: "Planning service unavailable." }, { status: 503 });
      }
      const { plateId, serviceDate = "2026-10-07" } = JSON.parse(options.body);
      if (plateId === null) {
        const previousPlate = scheduledPlates.get(serviceDate);
        scheduledPlates.delete(serviceDate);
        if (serviceDate === "2026-10-07") {
          todaysPlate = null;
        }
        if (previousPlate) {
          historyEvents.push({
            id: nextHistoryId++,
            serviceDate,
            eventType: "cleared",
            previousPlate: snapshot(previousPlate),
            currentPlate: null,
            occurredAt: "2026-10-07T10:00:00.000Z",
          });
        }
        const response = Response.json({ cleared: true, serviceDate });
        if (holdTodayClear && serviceDate === "2026-10-07") {
          return new Promise((resolve) => {
            resolveTodayClear = () => resolve(response);
          });
        }
        return response;
      }
      const plate = savedPlates.find((item) => item.id === plateId);
      const previousPlate = scheduledPlates.get(serviceDate);
      scheduledPlates.set(serviceDate, plate);
      historyEvents.push({
        id: nextHistoryId++,
        serviceDate,
        eventType: previousPlate ? "changed" : "assigned",
        previousPlate: previousPlate ? snapshot(previousPlate) : null,
        currentPlate: snapshot(plate),
        occurredAt: "2026-10-07T10:00:00.000Z",
      });
      if (serviceDate === "2026-10-07") {
        todaysPlate = plate;
      }
      const response = Response.json({
        today: {
          serviceDate,
          plate,
        },
      });
      if (holdAssignment) {
        return new Promise((resolve) => {
          resolveAssignment = () => resolve(response);
        });
      }
      return response;
    }
    if (url.startsWith("/api/admin/plates/") && options.method === "DELETE") {
      if (failDelete) {
        return Response.json({ error: "Delete service unavailable." }, { status: 503 });
      }
      const plateId = url.split("/").at(-1);
      if (
        todaysPlate?.id === plateId ||
        [...scheduledPlates.values()].some((plate) => plate.id === plateId)
      ) {
        return Response.json({
          error: "This plate is assigned for today or a future date. Change that plan before deleting it.",
        }, { status: 409 });
      }
      const plate = savedPlates.find((item) => item.id === plateId);
      const pastAssignment = historyEvents.find((item) =>
        item.currentPlate?.id === plateId || item.previousPlate?.id === plateId);
      if (plate && pastAssignment) {
        historyEvents.push({
          id: nextHistoryId++,
          serviceDate: pastAssignment.serviceDate,
          eventType: "plate_deleted",
          previousPlate: snapshot(plate),
          currentPlate: null,
          occurredAt: "2026-10-07T10:00:00.000Z",
        });
      }
      savedPlates = savedPlates.filter((item) => item.id !== plateId);
      return Response.json({ deleted: true });
    }
    throw new Error(`Unexpected fake API request: ${options.method ?? "GET"} ${url}`);
  }

  class FakeFormData {
    constructor(form) {
      this.form = form;
    }

    get(name) {
      return {
        email: "corne.dawson@gmail.com",
        password: "test-password",
        rememberMe: "on",
        newPassword: "new-owner-password",
        confirmPassword: "new-owner-password",
      }[name] ?? null;
    }
  }

  const document = {
    querySelector: (selector) => {
      if (selector.startsWith('[aria-label="Delete ')) {
        return elements["#plate-list"].children[0]?.children[1]?.children[1] ?? null;
      }
      return elements[selector];
    },
    getElementById: (id) => elements[`#${id}`],
    createElement: () => new Element(),
    addEventListener: (event, callback) => {
      document.listeners ??= {};
      document.listeners[event] = callback;
    },
    removeEventListener: (event, callback) => {
      if (document.listeners?.[event] === callback) {
        delete document.listeners[event];
      }
    },
  };
  class FakeAudioContext {
    constructor() {
      audioContextCount += 1;
      this.state = "suspended";
      this.currentTime = 10;
      this.destination = {};
    }

    async resume() {
      this.state = "running";
    }

    createOscillator() {
      return {
        frequency: {
          setValueAtTime: (frequency) => scheduledFrequencies.push(frequency),
        },
        connect() {},
        start() {},
        stop() {},
      };
    }

    createGain() {
      return {
        gain: {
          setValueAtTime() {},
          linearRampToValueAtTime() {},
        },
        connect() {},
      };
    }
  }
  const context = vm.createContext({
    document,
    fetch: fetchMock,
    FormData: FakeFormData,
    URL: {
      createObjectURL: () => "blob:preview-photo",
      revokeObjectURL: () => {},
    },
    URLSearchParams,
    setTimeout: (callback, delay) => {
      const id = nextTimer++;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
    window: {
      confirm: () => true,
      location: { search: "", pathname: "/admin/", hash: "" },
      history: { replaceState() {} },
      addEventListener: (event, callback) => {
        windowListeners[event] = callback;
      },
      AudioContext: FakeAudioContext,
    },
    console,
  });
  vm.runInContext(adminScript, context, { filename: "docs/admin/admin.js" });
  assert.equal(audioContextCount, 0, "audio stays locked until user interaction");
  await document.listeners.pointerdown();
  assert.equal(audioContextCount, 1);
  assert.equal(document.listeners.pointerdown, undefined, "audio unlock listener is removed after success");
  for (const [toggle, input] of [
    ["#toggle-password", "#password"],
    ["#toggle-new-password", "#new-password"],
    ["#toggle-confirm-password", "#confirm-password"],
  ]) {
    elements[input].name = input === "#password"
      ? "password"
      : input === "#new-password"
        ? "newPassword"
        : "confirmPassword";
    elements[toggle].listeners.click();
    assert.equal(elements[input].type, "text");
    assert.equal(elements[toggle].attributes["aria-pressed"], "true");
    assert.equal(elements[toggle].textContent, "Hide");
    assert.match(elements[toggle].attributes["aria-label"], /^Hide /);
    elements[toggle].listeners.click();
    assert.equal(elements[input].type, "password");
    assert.equal(elements[toggle].attributes["aria-pressed"], "false");
    assert.equal(elements[toggle].textContent, "Show");
  }

  await elements["#sign-in-form"].listeners.submit({ preventDefault() {} });
  assert.equal(elements["#status-message"].textContent, "Email or password is incorrect.");
  assert.equal(elements["#status"].dataset.kind, "error");
  assert.equal(elements["#status-icon"].textContent, "×");
  assert.deepEqual(scheduledFrequencies, [330, 220], "error toast schedules a low descending tone");
  assert.equal(elements["#dashboard"].hidden, true);
  context.setStatus("Information", "info");
  assert.equal(elements["#status-icon"].textContent, "i");
  context.setStatus("Warning", "warning");
  assert.equal(elements["#status"].dataset.kind, "warning");
  assert.equal(elements["#status-icon"].textContent, "!");

  failSignIn = false;
  await elements["#sign-in-form"].listeners.submit({ preventDefault() {} });
  const signInCall = calls.find(
    ({ url, options }) => url === "/api/admin/session" && options.method === "POST",
  );
  assert.equal(JSON.parse(signInCall.options.body).rememberMe, true);
  assert.equal(elements["#dashboard"].hidden, false);
  assert.equal(elements["#service-date"].textContent, "07/10/2026");
  assert.equal(elements["#service-date"].dataset.isoDate, "2026-10-07");
  assert.equal(elements["#today-plan-view"].hidden, false);
  assert.equal(elements["#plate-library-view"].hidden, true);
  assert.equal(elements["#history-view"].hidden, true);
  assert.equal(elements["#nav-today-plan"].getAttribute("aria-current"), "page");
  assert.equal(elements["#average-price"].disabled, true, "average is unavailable before saving a plate");
  assert.equal(elements["#today-plate-search-wrap"].hidden, true);
  assert.equal(elements["#plan-plate-search-wrap"].hidden, true);
  assert.equal(elements["#library-plate-search-wrap"].hidden, true);
  assert.equal(elements["#today-select"].children[0].textContent, "Save a plate first");
  assert.equal(context.formatServiceDate("2026-10-07"), "07/10/2026");
  assert.equal(context.formatServiceDate("2024-02-29"), "29/02/2024");
  assert.equal(context.formatServiceDate("2026-02-30"), "2026-02-30");
  elements["#nav-plate-library"].listeners.click({ preventDefault() {} });
  assert.equal(elements["#today-plan-view"].hidden, true);
  assert.equal(elements["#plate-library-view"].hidden, false);
  assert.equal(elements["#history-view"].hidden, true);
  assert.equal(elements["#nav-plate-library"].getAttribute("aria-current"), "page");
  assert.equal(context.window.location.hash, "#plate-library-view");
  elements["#nav-history"].listeners.click({ preventDefault() {} });
  assert.equal(elements["#plate-library-view"].hidden, true);
  assert.equal(elements["#history-view"].hidden, false);
  assert.equal(elements["#nav-history"].getAttribute("aria-current"), "page");
  context.window.location.hash = "#today-plan-view";
  windowListeners.hashchange();
  assert.equal(elements["#today-plan-view"].hidden, false);
  assert.equal(elements["#planning"].hidden, false);
  assert.equal(elements["#history-view"].hidden, true);
  assert.match(elements["#history-state"].textContent, /No history yet/);
  failHistory = true;
  await elements["#history-retry"].listeners.click();
  assert.equal(elements["#history-state"].textContent, "History service unavailable.");
  assert.equal(elements["#history-retry"].hidden, false);
  failHistory = false;
  await elements["#history-retry"].listeners.click();
  assert.match(elements["#history-state"].textContent, /No history yet/);
  assert.deepEqual(
    scheduledFrequencies,
    [330, 220, 660, 880],
    "success toast schedules a distinct rising tone",
  );

  const historyPlate = {
    id: "2192d100-1951-4504-bd0f-a8393f2d80d4",
    name: "Older Café special",
    description: "Slow-cooked beef",
    priceCents: 18900,
  };
  for (let index = 0; index < 101; index += 1) {
    const eventType = ({
      1: "changed",
      2: "cleared",
      3: "plate_deleted",
      4: "backfilled",
    })[index] ?? "assigned";
    const previousPlate = ["changed", "cleared", "plate_deleted"].includes(eventType)
      ? snapshot({ ...historyPlate, name: "Previous special" })
      : null;
    const currentPlate = ["assigned", "changed", "backfilled"].includes(eventType)
      ? snapshot({ ...historyPlate, name: index === 0 ? "Older Café special" : `Plate ${index}` })
      : null;
    historyEvents.push({
      id: nextHistoryId++,
      serviceDate: index === 0 ? "2024-01-05" : "2025-01-05",
      eventType,
      previousPlate,
      currentPlate,
      occurredAt: `2025-01-05T10:${String(index % 60).padStart(2, "0")}:00.000Z`,
    });
  }
  await context.loadHistory();
  assert.equal(elements["#history-list"].children.length, 100);
  assert.match(elements["#history-state"].textContent, /100 loaded history entries/);
  assert.equal(elements["#history-load-more"].hidden, false);
  elements["#history-search"].value = "cafe";
  elements["#history-search"].listeners.input();
  assert.equal(elements["#history-list"].children.length, 0);
  assert.match(elements["#history-state"].textContent, /load older history to search further back/);
  await elements["#history-load-more"].listeners.click();
  assert.equal(elements["#history-list"].children.length, 1);
  const historyRowText = (row) =>
    row.children[0].children.map((child) => child.textContent).join(" ");
  assert.match(historyRowText(elements["#history-list"].children[0]), /Older Café special/);
  assert.match(historyRowText(elements["#history-list"].children[0]), /Service date · 05\/01\/2024/);
  assert.match(historyRowText(elements["#history-list"].children[0]), /Plate assigned/);
  assert.equal(elements["#history-load-more"].hidden, true);
  assert.match(elements["#history-state"].textContent, /101 loaded history entries/);

  elements["#history-search"].value = "";
  elements["#history-event-filter"].value = "plan";
  elements["#history-event-filter"].listeners.change();
  assert.equal(elements["#history-list"].children.length, 2);
  assert.ok(elements["#history-list"].children.every((row) =>
    /Plan (changed|cleared)/.test(historyRowText(row))));
  elements["#history-event-filter"].value = "library";
  elements["#history-event-filter"].listeners.change();
  assert.equal(elements["#history-list"].children.length, 1);
  assert.match(historyRowText(elements["#history-list"].children[0]), /Plate removed from library/);
  elements["#history-event-filter"].value = "assignment";
  elements["#history-event-filter"].listeners.change();
  assert.equal(elements["#history-list"].children.length, 98);
  assert.ok(elements["#history-list"].children.every((row) =>
    /Plate assigned|Earlier assignment/.test(historyRowText(row))));
  elements["#history-event-filter"].value = "all";
  elements["#history-event-filter"].listeners.change();
  assert.equal(elements["#history-list"].children.length, 101);
  assert.match(historyRowText(elements["#history-list"].children.at(-1)), /Older Café special/);
  assert.match(historyRowText(elements["#history-list"].children[0]), /Service date · 05\/01\/2025/);
  assert.match(historyRowText(elements["#history-list"].children[0]), /Plate 59/);
  historyEvents = [];
  await context.loadHistory();
  assert.match(elements["#history-state"].textContent, /No history yet/);

  elements["#plate-name"].value = "Cottage burger";
  elements["#plate-description"].value = "Beef and chips";
  elements["#plate-price"].value = "125";
  const imageInput = elements["#plate-image"];
  imageInput.type = "file";
  imageInput.files = [{ type: "image/svg+xml", name: "not-a-photo.svg", size: 3 }];
  imageInput.listeners.change();
  assert.match(elements["#status-message"].textContent, /Choose a photo such as JPEG, PNG, WebP, or HEIC/);
  assert.equal(elements["#image-preview"].hidden, true);

  imageInput.files = [{ type: "image/jpeg", name: "large-photo.jpg", size: 5 * 1024 * 1024 + 1 }];
  imageInput.listeners.change();
  assert.match(elements["#image-note"].textContent, /resize and apply/);
  assert.equal(elements["#image-preview"].hidden, false);

  imageInput.files = [{ type: "image/jpeg", name: "burger.jpg", size: 3 * 1024 * 1024 }];
  imageInput.listeners.change();
  assert.equal(elements["#image-preview"].hidden, false);
  assert.equal(elements["#image-preview-image"].src, "blob:preview-photo");
  assert.equal(elements["#image-preview-image"].alt, "Selected photo: burger.jpg");
  assert.match(elements["#image-note"].textContent, /Ready to upload: burger\.jpg/);

  elements["#clear-image"].listeners.click();
  assert.equal(elements["#image-preview"].hidden, true);
  imageInput.files = [];
  assert.equal(imageInput.files.length, 0);
  assert.match(elements["#image-note"].textContent, /saved without a photo/);
  imageInput.files = [{ type: "image/jpeg", name: "burger.jpg", size: 3 }];
  imageInput.listeners.change();

  failImageUpload = true;
  await elements["#plate-form"].listeners.submit({ preventDefault() {} });
  assert.equal(elements["#status-message"].textContent, "The image could not be uploaded. Please try again.");
  assert.equal(calls.some(({ url, options }) => url === "/api/admin/plates" && options.method === "POST"), false);
  failImageUpload = false;
  await elements["#plate-form"].listeners.submit({ preventDefault() {} });

  const uploadCall = calls.find(({ url }) => url === "/api/admin/images");
  const saveCall = calls.find(
    ({ url, options }) => url === "/api/admin/plates" && options.method === "POST",
  );
  assert.ok(uploadCall);
  assert.equal(uploadCall.options.headers["Content-Type"], "image/jpeg");
  assert.deepEqual(JSON.parse(saveCall.options.body), {
    name: "Cottage burger",
    description: "Beef and chips",
    priceCents: 12500,
    imageUrl,
  });
  assert.equal(elements["#average-price"].disabled, false);
  savedPlates.push({
    ...savedPlates[0],
    id: "a4df7fd4-1e8a-46a3-83c6-3c717e0ecf27",
    name: "Soup",
    priceCents: 12600,
  });
  await context.loadDashboard();
  elements["#average-price"].listeners.click();
  assert.equal(elements["#plate-price"].value, "126", "125.50 rounds up to the nearest rand");

  const editButton = elements["#plate-list"].children[0].children[1].children[0];
  const previousScroll = elements["#plate-editor-panel"].scrollOptions;
  editButton.listeners.click();
  assert.equal(elements["#plate-library-view"].hidden, false);
  assert.equal(elements["#plate-editor-panel"].scrollOptions.behavior, "smooth");
  assert.equal(elements["#plate-editor-panel"].scrollOptions.block, "start");
  assert.notEqual(elements["#plate-editor-panel"].scrollOptions, previousScroll);
  assert.equal(elements["#plate-name"].focusOptions.preventScroll, true);
  assert.equal(elements["#plate-editor-panel"].classList.contains("plate-editor-panel--editing"), true);
  assert.equal(elements["#editor-title"].textContent, "Edit Cottage burger");
  assert.equal(elements["#plate-name"].value, "Cottage burger");
  assert.equal(elements["#plate-price"].value, "125.00");
  assert.equal(elements["#image-preview"].hidden, false);
  assert.equal(elements["#image-preview-image"].src, imageUrl);
  assert.match(elements["#image-note"].textContent, /will be kept unless you choose a replacement/);
  elements["#plate-description"].value = "Beef, cheese and chips";
  await elements["#plate-form"].listeners.submit({ preventDefault() {} });
  const updateCall = calls.find(({ url, options }) =>
    url.startsWith("/api/admin/plates/") && options.method === "PATCH");
  assert.ok(updateCall);
  assert.equal(JSON.parse(updateCall.options.body).imageUrl, imageUrl);
  assert.equal(elements["#plate-editor-panel"].classList.contains("plate-editor-panel--editing"), false);
  assert.equal(elements["#editor-title"].textContent, "Create plate");
  savedPlates.push({
    ...savedPlates[0],
    id: "a4df7fd4-1e8a-46a3-83c6-3c717e0ecf27",
    name: "Soup",
    description: "Tomato and basil",
  });
  for (let index = 0; index < 8; index += 1) {
    savedPlates.push({
      ...savedPlates[0],
      id: `a4df7fd4-1e8a-46a3-83c6-3c717e0ecf2${index}`,
      name: `Large list plate ${index}`,
    });
  }
  await context.loadDashboard();
  assert.equal(elements["#today-plate-search-wrap"].hidden, false);
  assert.equal(elements["#plan-plate-search-wrap"].hidden, false);
  assert.equal(elements["#library-plate-search-wrap"].hidden, false);
  elements["#today-select"].value = "";
  elements["#today-plate-search"].value = "soup";
  elements["#today-plate-search"].listeners.input();
  assert.deepEqual(elements["#today-select"].children.map((option) => option.textContent), [
    "Select a saved plate",
    "Soup",
  ]);
  elements["#plan-plate-search"].value = "soup";
  elements["#plan-plate-search"].listeners.input();
  assert.deepEqual(elements["#schedule-select"].children.map((option) => option.textContent), [
    "Not planned",
    "Soup",
  ]);
  assert.deepEqual(
    elements["#weekly-plan-list"].children[0].children[1].children.map((option) => option.textContent),
    ["Not planned", "Soup"],
  );
  elements["#library-plate-search"].value = "soup";
  elements["#library-plate-search"].listeners.input();
  assert.equal(elements["#plate-list"].children.length, 1);
  assert.match(elements["#plate-list"].children[0].children[0].children[0].textContent, /Soup/);
  elements["#library-plate-search"].value = "not on menu";
  elements["#library-plate-search"].listeners.input();
  assert.equal(elements["#plate-list"].children.length, 0);
  assert.equal(elements["#library-search-empty"].hidden, false);
  savedPlates = savedPlates.slice(0, 1);
  elements["#today-plate-search"].value = "";
  elements["#plan-plate-search"].value = "";
  elements["#library-plate-search"].value = "";
  await context.loadDashboard();
  assert.equal(elements["#today-plate-search-wrap"].hidden, true);

  historyEvents.push({
    id: nextHistoryId++,
    serviceDate: "2026-09-07",
    eventType: "backfilled",
    previousPlate: null,
    currentPlate: snapshot(savedPlates[0]),
    occurredAt: "2026-09-07T08:00:00.000Z",
  });

  elements["#today-select"].value = savedPlates[0].id;
  await elements["#set-today"].listeners.click();
  const assignmentCall = calls.find(
    ({ url, options }) => url === "/api/admin/plates/today" && options.method === "POST",
  );
  assert.deepEqual(JSON.parse(assignmentCall.options.body), {
    plateId: savedPlates[0].id,
  });
  assert.match(elements["#today-summary"].textContent, /Cottage burger/);
  assert.equal(elements["#clear-today"].hidden, false);

  failSchedule = true;
  await elements["#clear-today"].listeners.click();
  const failedTodayClear = calls.findLast(({ url, options }) =>
    url === "/api/admin/plates/today" && options.method === "POST");
  assert.deepEqual(JSON.parse(failedTodayClear.options.body), { plateId: null });
  assert.match(elements["#status-message"].textContent, /could not be cleared/);
  assert.equal(elements["#today-summary"].textContent.includes("Cottage burger"), true);
  assert.equal(elements["#clear-today"].hidden, false);
  assert.equal(elements["#clear-today"].disabled, false);
  assert.equal(elements["#clear-today"].textContent, "Clear today’s plate");
  failSchedule = false;
  holdTodayClear = true;
  const pendingTodayClear = elements["#clear-today"].listeners.click();
  await Promise.resolve();
  assert.equal(elements["#clear-today"].disabled, true);
  assert.equal(elements["#clear-today"].textContent, "Clearing…");
  resolveTodayClear();
  await pendingTodayClear;
  holdTodayClear = false;
  assert.equal(elements["#today-summary"].textContent, "No plate has been selected for today.");
  assert.equal(elements["#clear-today"].hidden, true);
  assert.equal(elements["#today-select"].focusCount > 0, true);
  assert.equal(elements["#status-message"].textContent, "Today’s plate has been cleared.");
  assert.equal(elements["#status"].dataset.kind, "success");

  assert.equal(elements["#weekly-plan-list"].children.length, 5);
  const displayedWeekdays = elements["#weekly-plan-list"].children.map(
    (row) => row.dataset.serviceDate,
  );
  assert.deepEqual(displayedWeekdays, [
    "2026-10-08",
    "2026-10-09",
    "2026-10-12",
    "2026-10-13",
    "2026-10-14",
  ]);
  assert.ok(displayedWeekdays.every((date) => date > "2026-10-07"));
  assert.match(
    elements["#weekly-plan-list"].children[0].children[0].textContent,
    /^Day 2 · Thursday · 08\/10\/2026$/,
  );
  assert.match(elements["#weekly-plan-list"].children[4].children[0].textContent, /^Day 6 · /);
  const weeklyRow = elements["#weekly-plan-list"].children[0];
  const weeklySelect = weeklyRow.children[1];
  const weeklyButton = weeklyRow.children[2];
  assert.equal(weeklyRow.dataset.dayNumber, "2");
  assert.equal(weeklySelect.value, "");
  weeklySelect.value = savedPlates[0].id;
  await weeklyButton.listeners.click();
  assert.equal(elements["#weekly-plan-list"].children[0].children[1].value, savedPlates[0].id);
  weeklySelect.value = "";
  await weeklyButton.listeners.click();
  const clearCall = calls.findLast(({ url, options }) =>
    url === "/api/admin/plates/today" && options.method === "POST");
  assert.deepEqual(JSON.parse(clearCall.options.body), {
    serviceDate: "2026-10-08",
    plateId: null,
  });
  assert.equal(elements["#status"].dataset.kind, "success");
  assert.equal(elements["#status-icon"].textContent, "✓");
  assert.equal(elements["#status-message"].textContent, "No plate planned for 08/10/2026.");
  assert.equal(elements["#weekly-plan-list"].children[0].children[1].value, "");
  assert.equal(elements["#today-summary"].textContent, "No plate has been selected for today.");

  const refreshedWeeklyRow = elements["#weekly-plan-list"].children[0];
  const refreshedWeeklySelect = refreshedWeeklyRow.children[1];
  refreshedWeeklySelect.value = savedPlates[0].id;
  await refreshedWeeklyRow.children[2].listeners.click();
  assert.equal(elements["#weekly-plan-list"].children[0].children[1].value, savedPlates[0].id);
  assert.equal(elements["#status"].dataset.kind, "success");
  assert.equal(elements["#status-icon"].textContent, "✓");

  assert.deepEqual(
    Array.from(context.planningWeekdays("2026-10-09")),
    ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"],
    "a Friday start skips the weekend and still shows five future weekdays",
  );

  const assignmentCount = calls.filter(({ url, options }) =>
    url === "/api/admin/plates/today" && options.method === "POST").length;
  elements["#today-select"].value = savedPlates[0].id;
  holdAssignment = true;
  const firstAssignment = elements["#set-today"].listeners.click();
  const duplicateAssignment = elements["#set-today"].listeners.click();
  await Promise.resolve();
  assert.equal(elements["#set-today"].disabled, true);
  assert.equal(
    calls.filter(({ url, options }) =>
      url === "/api/admin/plates/today" && options.method === "POST").length,
    assignmentCount + 1,
  );
  resolveAssignment();
  await Promise.all([firstAssignment, duplicateAssignment]);
  holdAssignment = false;

  await elements["#sign-out"].listeners.click();
  elements["#forgot-password"].listeners.click();
  assert.equal(elements["#recovery-request-panel"].hidden, false);
  await elements["#recovery-request-form"].listeners.submit({ preventDefault() {} });
  assert.match(elements["#status-message"].textContent, /If the address belongs to the owner account/);
  const recoveryCall = calls.find(({ url, options }) =>
    url === "/api/admin/password-recovery" && options.method === "POST");
  assert.deepEqual(JSON.parse(recoveryCall.options.body), {
    email: "corne.dawson@gmail.com",
  });
  assert.match(adminHtml, /id="status-close"[^>]*aria-label="Close notification"/);
  assert.ok([...timers.values()].some(({ delay }) => delay === 5000));
  elements["#status-close"].listeners.click();
  assert.equal(elements["#status"].hidden, true);
  assert.equal(elements["#status-message"].textContent, "");

  elements["#plate-price"].value = "not-a-price";
  await elements["#plate-form"].listeners.submit({ preventDefault() {} });
  assert.ok([...timers.values()].some(({ delay }) => delay === 10000));
  const errorTimer = [...timers.entries()].find(([, timer]) => timer.delay === 10000);
  errorTimer[1].callback();
  assert.equal(elements["#status"].hidden, true);

  // Exercise the duplicate-submit guards and user-visible failure paths for each
  // mutation control without waiting on a real network request.
  elements["#save-schedule"].disabled = true;
  await elements["#save-schedule"].listeners.click();
  elements["#save-schedule"].disabled = false;
  elements["#schedule-date"].value = "";
  elements["#schedule-select"].value = "";
  await elements["#save-schedule"].listeners.click();
  elements["#schedule-date"].value = "2026-10-08";
  elements["#schedule-select"].value = savedPlates[0].id;
  failSchedule = true;
  await elements["#save-schedule"].listeners.click();
  assert.equal(elements["#status"].dataset.kind, "error");
  assert.equal(elements["#status-icon"].textContent, "×");
  assert.match(elements["#status-message"].textContent, /08\/10\/2026/);
  assert.doesNotMatch(elements["#status-message"].textContent, /2026-10-08/);
  failSchedule = false;

  elements["#schedule-date"].listeners.change();
  elements["#schedule-select"].value = savedPlates[0].id;
  await elements["#save-schedule"].listeners.click();
  assert.equal(elements["#schedule-select"].value, savedPlates[0].id);
  assert.match(elements["#status-message"].textContent, /planned for 08\/10\/2026/);
  elements["#schedule-select"].value = "";
  await elements["#save-schedule"].listeners.click();
  assert.deepEqual(JSON.parse(calls.findLast(({ url, options }) =>
    url === "/api/admin/plates/today" &&
    options.method === "POST").options.body), {
    serviceDate: "2026-10-08",
    plateId: null,
  });
  assert.equal(elements["#schedule-select"].value, "");
  assert.match(elements["#status-message"].textContent, /No plate planned for 08\/10\/2026/);

  const latestWeeklyRow = elements["#weekly-plan-list"].children[0];
  const latestWeeklySelect = latestWeeklyRow.children[1];
  const latestWeeklyButton = latestWeeklyRow.children[2];
  latestWeeklyButton.disabled = true;
  await latestWeeklyButton.listeners.click();
  latestWeeklyButton.disabled = false;
  latestWeeklySelect.value = savedPlates[0].id;
  failSchedule = true;
  await latestWeeklyButton.listeners.click();
  failSchedule = false;

  const deleteButton = elements["#plate-list"].children[0].children[1].children[1];
  failDelete = true;
  await deleteButton.listeners.click();
  failDelete = false;
  scheduledPlates.clear();
  todaysPlate = null;
  await deleteButton.listeners.click();
  assert.equal(elements["#plate-list"].children.length, 0);
  const retainedHistory = elements["#history-list"].children.map(
    (item) => item.children[0].children.map((child) => child.textContent).join(" "),
  );
  assert.ok(retainedHistory.some((item) => item.includes("Cottage burger")));
  assert.ok(retainedHistory.some((item) => /deleted from the library; historical record kept/.test(item)));
  deleteButton.disabled = true;
  await deleteButton.listeners.click();
  deleteButton.disabled = false;

  elements["#sign-in-submit"].disabled = true;
  await elements["#sign-in-form"].listeners.submit({ preventDefault() {} });
  elements["#sign-in-submit"].disabled = false;

  failRecovery = true;
  await elements["#recovery-request-form"].listeners.submit({ preventDefault() {} });
  failRecovery = false;
  elements["#recovery-submit"].disabled = true;
  await elements["#recovery-request-form"].listeners.submit({ preventDefault() {} });
  elements["#recovery-submit"].disabled = false;

  failReset = true;
  await elements["#password-reset-form"].listeners.submit({ preventDefault() {} });
  failReset = false;
  elements["#password-reset-submit"].disabled = true;
  await elements["#password-reset-form"].listeners.submit({ preventDefault() {} });
  elements["#password-reset-submit"].disabled = false;

  failSignOut = true;
  await elements["#sign-out"].listeners.click();
  failSignOut = false;
  elements["#sign-out"].disabled = true;
  await elements["#sign-out"].listeners.click();
  elements["#sign-out"].disabled = false;

  elements["#price-input"] = elements["#plate-price"];
  elements["#plate-price"].value = "not-a-price";
  await elements["#plate-form"].listeners.submit({ preventDefault() {} });
  elements["#plate-price"].value = "50";
  elements["#save-plate"].disabled = true;
  await elements["#plate-form"].listeners.submit({ preventDefault() {} });
  elements["#save-plate"].disabled = false;

  elements["#today-select"].value = "";
  await elements["#set-today"].listeners.click();
});

test("admin UI converts HEIC and large camera photos before upload", async () => {
  const elements = Object.fromEntries(
    adminSelectors.map((selector) => [selector, new Element()]),
  );
  elements["#dashboard"].hidden = true;
  elements["#sign-out"].hidden = true;
  elements["#recovery-request-panel"].hidden = true;
  elements["#password-reset-panel"].hidden = true;
  const uploaded = [];
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage() {} }),
    toBlob(callback, type, quality) {
      uploaded.push({ type, quality, width: this.width, height: this.height });
      callback(new Blob(["optimized"], { type }));
    },
  };
  const document = {
    querySelector: (selector) => elements[selector],
    getElementById: (id) => elements[`#${id}`],
    createElement: (tagName) => tagName === "canvas" ? canvas : new Element(),
  };
  const context = vm.createContext({
    document,
    fetch: async (url, options = {}) => {
      if (url === "/api/admin/session") {
        return Response.json({ authenticated: false });
      }
      uploaded.push({ url, options });
      return Response.json({ imageUrl: "https://cottage44-test.supabase.co/storage/v1/object/public/cottage44-plates/123e4567-e89b-42d3-a456-426614174000.jpg" });
    },
    FormData: class {
      get(name) {
        return name === "email" ? "corne.dawson@gmail.com" : null;
      }
    },
    URL: {
      createObjectURL: () => "blob:heic-preview",
      revokeObjectURL: () => {},
    },
    createImageBitmap: async () => ({
      width: 4000,
      height: 3000,
      close() {},
    }),
    URLSearchParams,
    window: {
      location: { search: "", pathname: "/admin/", hash: "" },
      history: { replaceState() {} },
      addEventListener() {},
    },
    console,
  });

  vm.runInContext(adminScript, context, { filename: "docs/admin/admin.js" });
  await new Promise(setImmediate);
  elements["#plate-camera-image"].files = [{
    name: "camera.heic",
    type: "image/heic",
    size: 12 * 1024 * 1024,
  }];
  elements["#plate-camera-image"].listeners.change();
  assert.equal(elements["#image-preview"].hidden, false);

  elements["#plate-name"].value = "Camera plate";
  elements["#plate-price"].value = "50";
  await elements["#plate-form"].listeners.submit({ preventDefault() {} });

  const upload = uploaded.find((entry) => entry.url === "/api/admin/images");
  assert.equal(upload.options.headers["Content-Type"], "image/jpeg");
  assert.equal(upload.options.body.type, "image/jpeg");
  assert.equal(uploaded[0].width, 2000);
  assert.equal(uploaded[0].height, 1500);
});

test("recovery UI displays nested API errors as human-readable messages", async () => {
  const elements = Object.fromEntries(
    adminSelectors.map((selector) => [selector, new Element()]),
  );
  elements["#dashboard"].hidden = true;
  elements["#sign-out"].hidden = true;
  elements["#recovery-request-panel"].hidden = true;
  elements["#password-reset-panel"].hidden = true;
  const requests = [];
  const document = {
    querySelector: (selector) => elements[selector],
    getElementById: (id) => elements[`#${id}`],
    createElement: () => new Element(),
  };
  const context = vm.createContext({
    document,
    fetch: async (url, options = {}) => {
      requests.push({ url, options });
      if (url === "/api/admin/session") {
        return Response.json({ authenticated: false });
      }
      return Response.json(
        {
          error: {
            code: "SERVICE_UNAVAILABLE",
            message: "The service is temporarily unavailable.",
          },
        },
        { status: 503 },
      );
    },
    FormData: class {
      get(name) {
        return name === "email" ? "corne.dawson@gmail.com" : null;
      }
    },
    URLSearchParams,
    window: {
      location: { search: "", pathname: "/admin/", hash: "" },
      history: { replaceState() {} },
      addEventListener() {},
    },
    console,
  });

  vm.runInContext(adminScript, context, { filename: "docs/admin/admin.js" });
  await new Promise(setImmediate);
  elements["#forgot-password"].listeners.click();
  await elements["#recovery-request-form"].listeners.submit({ preventDefault() {} });

  assert.equal(elements["#status-message"].textContent, "The service is temporarily unavailable.");
  assert.doesNotMatch(elements["#status-message"].textContent, /\[object Object\]/);
  assert.equal(
    requests.filter(({ url }) => url === "/api/admin/password-recovery").length,
    1,
  );
});

test("verified recovery links show the password form and submit the confirmed password", async () => {
  const elements = Object.fromEntries(
    adminSelectors.map((selector) => [selector, new Element()]),
  );
  elements["#dashboard"].hidden = true;
  elements["#sign-out"].hidden = true;
  elements["#recovery-request-panel"].hidden = true;
  elements["#password-reset-panel"].hidden = true;
  const requests = [];
  const document = {
    querySelector: (selector) => elements[selector],
    getElementById: (id) => elements[`#${id}`],
    createElement: () => new Element(),
  };
  const context = vm.createContext({
    document,
    fetch: async (url, options = {}) => {
      requests.push({ url, options });
      return Response.json({ updated: true });
    },
    FormData: class {
      get(name) {
        return {
          newPassword: "new-owner-password",
          confirmPassword: "new-owner-password",
        }[name] ?? null;
      }
    },
    URLSearchParams,
    window: {
      location: { search: "?recovery=ready", pathname: "/admin/", hash: "" },
      history: { replaceState() {} },
      addEventListener() {},
    },
    console,
  });

  vm.runInContext(adminScript, context, { filename: "docs/admin/admin.js" });
  assert.equal(elements["#sign-in-panel"].hidden, true);
  assert.equal(elements["#password-reset-panel"].hidden, false);
  assert.match(elements["#status-message"].textContent, /Reset link verified/);

  await elements["#password-reset-form"].listeners.submit({ preventDefault() {} });
  assert.equal(requests[0].url, "/api/admin/password-recovery/update");
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    password: "new-owner-password",
  });
  assert.equal(elements["#password-reset-panel"].hidden, true);
  assert.equal(elements["#sign-in-panel"].hidden, false);
  assert.match(elements["#status-message"].textContent, /password has been updated/i);
});

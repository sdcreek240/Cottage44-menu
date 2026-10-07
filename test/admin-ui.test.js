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
  "#sign-out",
  "#plate-form",
  "#plate-id",
  "#plate-name",
  "#plate-description",
  "#plate-price",
  "#plate-image",
  "#image-note",
  "#image-preview",
  "#image-preview-image",
  "#clear-image",
  "#plate-list",
  "#history-list",
  "#today-select",
  "#today-summary",
  "#service-date",
  "#set-today",
  "#new-plate",
  "#cancel-edit",
  "#save-plate",
  "#editor-title",
  "#email",
  "#schedule-date",
  "#schedule-select",
  "#save-schedule",
  "#schedule-summary",
  "#weekly-plan-list",
];

test("admin theme defaults to dark and respects a saved shared theme", () => {
  assert.match(adminHtml, /<html lang="en" data-theme="dark">/);
  assert.deepEqual(initialAdminTheme(), { theme: "dark", themeColor: "#1c1a1a" });
  assert.deepEqual(initialAdminTheme("light"), { theme: "light", themeColor: "#f7f5ef" });
  assert.deepEqual(initialAdminTheme("dark"), { theme: "dark", themeColor: "#1c1a1a" });
  assert.match(adminHtml, /localStorage\.getItem\("cottage44-theme"\)/);
});

test("uses the exact Cottage 44 red accent in admin light and dark themes", () => {
  assert.match(adminCss, /--accent:\s*#C12025;/);
  assert.match(adminCss, /:root\[data-theme="light"\][\s\S]*?--accent:\s*#C12025;/);
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

  focus() {}

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

  const elements = Object.fromEntries(
    adminSelectors.map((selector) => [selector, new Element()]),
  );
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
  let nextTimer = 1;
  let savedPlates = [];
  let todaysPlate = null;
  let failSignIn = true;
  let failImageUpload = false;
  let failSave = false;
  let failSchedule = false;
  let failDelete = false;
  let failRecovery = false;
  let failReset = false;
  let failSignOut = false;
  let holdAssignment = false;
  let resolveAssignment;
  const imageUrl =
    "https://cottage44-test.supabase.co/storage/v1/object/public/cottage44-plates/123e4567-e89b-42d3-a456-426614174000.jpg";

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
        history: [],
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
      const { plateId } = JSON.parse(options.body);
      todaysPlate = savedPlates.find((plate) => plate.id === plateId);
      const response = Response.json({
        today: {
          serviceDate: "2026-10-07",
          plate: todaysPlate,
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
      savedPlates = [];
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
  };
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
      location: { search: "", pathname: "/admin/" },
      history: { replaceState() {} },
    },
    console,
  });
  vm.runInContext(adminScript, context, { filename: "docs/admin/admin.js" });
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
  assert.equal(elements["#dashboard"].hidden, true);

  failSignIn = false;
  await elements["#sign-in-form"].listeners.submit({ preventDefault() {} });
  const signInCall = calls.find(
    ({ url, options }) => url === "/api/admin/session" && options.method === "POST",
  );
  assert.equal(JSON.parse(signInCall.options.body).rememberMe, true);
  assert.equal(elements["#dashboard"].hidden, false);

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

  const editButton = elements["#plate-list"].children[0].children[1].children[0];
  editButton.listeners.click();
  assert.equal(elements["#image-preview"].hidden, false);
  assert.equal(elements["#image-preview-image"].src, imageUrl);
  assert.match(elements["#image-note"].textContent, /will be kept unless you choose a replacement/);
  elements["#plate-description"].value = "Beef, cheese and chips";
  await elements["#plate-form"].listeners.submit({ preventDefault() {} });
  const updateCall = calls.find(({ url, options }) =>
    url.startsWith("/api/admin/plates/") && options.method === "PATCH");
  assert.ok(updateCall);
  assert.equal(JSON.parse(updateCall.options.body).imageUrl, imageUrl);

  elements["#today-select"].value = savedPlates[0].id;
  await elements["#set-today"].listeners.click();
  const assignmentCall = calls.find(
    ({ url, options }) => url === "/api/admin/plates/today" && options.method === "POST",
  );
  assert.deepEqual(JSON.parse(assignmentCall.options.body), {
    plateId: savedPlates[0].id,
  });
  assert.match(elements["#today-summary"].textContent, /Cottage burger/);

  holdAssignment = true;
  const firstAssignment = elements["#set-today"].listeners.click();
  const duplicateAssignment = elements["#set-today"].listeners.click();
  await Promise.resolve();
  assert.equal(elements["#set-today"].disabled, true);
  assert.equal(
    calls.filter(({ url, options }) =>
      url === "/api/admin/plates/today" && options.method === "POST").length,
    2,
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
  failSchedule = false;

  const weeklyRow = elements["#weekly-plan-list"].children[0];
  const weeklySelect = weeklyRow.children[1];
  const weeklyButton = weeklyRow.children[2];
  weeklyButton.disabled = true;
  await weeklyButton.listeners.click();
  weeklyButton.disabled = false;
  weeklySelect.value = "";
  await weeklyButton.listeners.click();
  weeklySelect.value = savedPlates[0].id;
  failSchedule = true;
  await weeklyButton.listeners.click();
  failSchedule = false;

  const deleteButton = elements["#plate-list"].children[0].children[1].children[1];
  failDelete = true;
  await deleteButton.listeners.click();
  failDelete = false;
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
      location: { search: "", pathname: "/admin/" },
      history: { replaceState() {} },
    },
    console,
  });

  vm.runInContext(adminScript, context, { filename: "docs/admin/admin.js" });
  await new Promise(setImmediate);
  elements["#plate-image"].files = [{
    name: "camera.heic",
    type: "image/heic",
    size: 12 * 1024 * 1024,
  }];
  elements["#plate-image"].listeners.change();
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
      location: { search: "", pathname: "/admin/" },
      history: { replaceState() {} },
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
      location: { search: "?recovery=ready", pathname: "/admin/" },
      history: { replaceState() {} },
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

"use strict";

const statusElement = document.querySelector("#status");
const statusIcon = document.querySelector("#status-icon");
const statusMessage = document.querySelector("#status-message");
const statusCloseButton = document.querySelector("#status-close");
const signInSubmit = document.querySelector("#sign-in-submit");
const signInPanel = document.querySelector("#sign-in-panel");
const signInForm = document.querySelector("#sign-in-form");
const recoveryRequestPanel = document.querySelector("#recovery-request-panel");
const recoveryRequestForm = document.querySelector("#recovery-request-form");
const recoverySubmit = document.querySelector("#recovery-submit");
const passwordResetPanel = document.querySelector("#password-reset-panel");
const passwordResetForm = document.querySelector("#password-reset-form");
const passwordResetSubmit = document.querySelector("#password-reset-submit");
const passwordVisibilityControls = [
  document.querySelector("#toggle-password"),
  document.querySelector("#toggle-new-password"),
  document.querySelector("#toggle-confirm-password"),
];
const forgotPasswordButton = document.querySelector("#forgot-password");
const backToSignInButton = document.querySelector("#back-to-sign-in");
const backFromPasswordResetButton = document.querySelector("#back-from-password-reset");
const dashboard = document.querySelector("#dashboard");
const dashboardViews = {
  "today-plan-view": document.querySelector("#today-plan-view"),
  "plate-library-view": document.querySelector("#plate-library-view"),
  "menu-view": document.querySelector("#menu-view"),
  "history-view": document.querySelector("#history-view"),
};
const dashboardNavigation = {
  "today-plan-view": document.querySelector("#nav-today-plan"),
  "plate-library-view": document.querySelector("#nav-plate-library"),
  "menu-view": document.querySelector("#nav-menu"),
  "history-view": document.querySelector("#nav-history"),
};
const signOutButton = document.querySelector("#sign-out");
const plateForm = document.querySelector("#plate-form");
const plateEditorPanel = document.querySelector("#plate-editor-panel");
const plateEditorTitle = document.querySelector("#editor-title");
const plateIdInput = document.querySelector("#plate-id");
const nameInput = document.querySelector("#plate-name");
const descriptionInput = document.querySelector("#plate-description");
const priceInput = document.querySelector("#plate-price");
const imageInput = document.querySelector("#plate-image");
const cameraImageInput = document.querySelector("#plate-camera-image");
const imageNote = document.querySelector("#image-note");
const imagePreview = document.querySelector("#image-preview");
const imagePreviewImage = document.querySelector("#image-preview-image");
const clearImageButton = document.querySelector("#clear-image");
const plateList = document.querySelector("#plate-list");
const historyList = document.querySelector("#history-list");
const historyState = document.querySelector("#history-state");
const historyRetryButton = document.querySelector("#history-retry");
const historyLoadMoreButton = document.querySelector("#history-load-more");
const historySearchInput = document.querySelector("#history-search");
const historyEventFilter = document.querySelector("#history-event-filter");
const todaySelect = document.querySelector("#today-select");
const todayPlateSearch = document.querySelector("#today-plate-search");
const todayPlateSearchWrap = document.querySelector("#today-plate-search-wrap");
const todaySummary = document.querySelector("#today-summary");
const serviceDate = document.querySelector("#service-date");
const setTodayButton = document.querySelector("#set-today");
const newPlateButton = document.querySelector("#new-plate");
const cancelEditButton = document.querySelector("#cancel-edit");
const scheduleDateInput = document.querySelector("#schedule-date");
const scheduleSelect = document.querySelector("#schedule-select");
const planPlateSearch = document.querySelector("#plan-plate-search");
const planPlateSearchWrap = document.querySelector("#plan-plate-search-wrap");
const libraryPlateSearch = document.querySelector("#library-plate-search");
const libraryPlateSearchWrap = document.querySelector("#library-plate-search-wrap");
const librarySearchEmpty = document.querySelector("#library-search-empty");
const saveScheduleButton = document.querySelector("#save-schedule");
const savePlateButton = document.querySelector("#save-plate");
const averagePriceButton = document.querySelector("#average-price");
const scheduleSummary = document.querySelector("#schedule-summary");
const weeklyPlanList = document.querySelector("#weekly-plan-list");
const clearTodayButton = document.querySelector("#clear-today");
const menuForm = document.querySelector("#menu-form");
const menuItemIdInput = document.querySelector("#menu-item-id");
const menuItemNameInput = document.querySelector("#menu-item-name");
const menuItemDescriptionInput = document.querySelector("#menu-item-description");
const menuItemPriceInput = document.querySelector("#menu-item-price");
const menuItemCategoryInput = document.querySelector("#menu-item-category");
const menuItemOrderInput = document.querySelector("#menu-item-order");
const menuItemActiveInput = document.querySelector("#menu-item-active");
const menuItemsList = document.querySelector("#menu-items-list");
const menuItemsState = document.querySelector("#menu-items-state");
const menuEditorTitle = document.querySelector("#menu-editor-title");
const menuEditorPanel = document.querySelector("#menu-editor-panel");
const saveMenuItemButton = document.querySelector("#save-menu-item");
const cancelMenuEditButton = document.querySelector("#cancel-menu-edit");
const newMenuItemButton = document.querySelector("#new-menu-item");
const menuCategoriesList = document.querySelector("#menu-categories-list");
const menuCategoriesState = document.querySelector("#menu-categories-state");
const menuCategoryForm = document.querySelector("#menu-category-form");
const menuCategoryIdInput = document.querySelector("#menu-category-id");
const menuCategoryNameInput = document.querySelector("#menu-category-name");
const menuCategorySortOrderInput = document.querySelector("#menu-category-sort-order");
const menuCategoryActiveInput = document.querySelector("#menu-category-active");
const menuCategoryEditorTitle = document.querySelector("#menu-category-editor-title");
const saveMenuCategoryButton = document.querySelector("#save-menu-category");
const cancelMenuCategoryEditButton = document.querySelector("#cancel-menu-category-edit");
const newMenuCategoryButton = document.querySelector("#new-menu-category");

let plates = [];
let menuCategories = [];
let menuItems = [];
let upcomingAssignments = [];
let historyEvents = [];
let historyNextBefore = null;
let historyHasMore = false;
let todayPlateId = null;
let selectedImageFile = null;
let savedImageUrl = null;
let previewObjectUrl = null;
let statusTimer = null;
let toastAudioContext = null;
let toastAudioUnlocking = false;
let toastAudioUnlocked = false;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 2000;
const PLATE_SEARCH_THRESHOLD = 8;
const SOURCE_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

function setStatus(message, kind = "info") {
  const text = typeof message === "string"
    ? message
    : "The request could not be completed. Please try again.";
  const statusKind = ["success", "error", "info", "warning"].includes(kind)
    ? kind
    : "info";
  const icons = {
    success: "✓",
    error: "×",
    info: "i",
    warning: "!",
  };
  if (statusTimer !== null) {
    clearTimeout(statusTimer);
    statusTimer = null;
  }
  statusMessage.textContent = text;
  statusIcon.textContent = text ? icons[statusKind] : "";
  statusElement.dataset.kind = text ? statusKind : "";
  statusElement.hidden = !text;
  statusElement.setAttribute(
    "aria-live",
    statusKind === "error" || statusKind === "warning" ? "assertive" : "polite",
  );
  if (text && (statusKind === "success" || statusKind === "error")) {
    playToastTone(statusKind);
  }
  if (text && typeof setTimeout === "function") {
    statusTimer = setTimeout(() => {
      dismissStatus();
    }, kind === "error" ? 10000 : 5000);
  }
}

function unlockToastAudio() {
  const AudioContextConstructor = window.AudioContext;
  if (!AudioContextConstructor || toastAudioUnlocking || toastAudioUnlocked) {
    return Promise.resolve();
  }
  toastAudioUnlocking = true;
  try {
    toastAudioContext ??= new AudioContextConstructor();
    return toastAudioContext.resume().then(() => {
      toastAudioUnlocked = toastAudioContext.state === "running";
      if (
        toastAudioUnlocked &&
        typeof document.removeEventListener === "function"
      ) {
        document.removeEventListener("pointerdown", unlockToastAudio);
        document.removeEventListener("keydown", unlockToastAudio);
      }
    }).catch(() => {
      // Audio is optional; a blocked or unavailable context must not block a toast.
    }).finally(() => {
      toastAudioUnlocking = false;
    });
  } catch {
    toastAudioUnlocking = false;
    return Promise.resolve();
  }
}

function playToastTone(kind) {
  if (
    !toastAudioUnlocked ||
    toastAudioContext?.state !== "running"
  ) {
    return;
  }
  const notes = kind === "success" ? [660, 880] : [330, 220];
  try {
    for (const [index, frequency] of notes.entries()) {
      const start = toastAudioContext.currentTime + index * 0.11;
      const oscillator = toastAudioContext.createOscillator();
      const gain = toastAudioContext.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.025, start + 0.015);
      gain.gain.linearRampToValueAtTime(0, start + 0.14);
      oscillator.connect(gain);
      gain.connect(toastAudioContext.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.15);
    }
  } catch {
    // Audio playback is decorative and must never interrupt status feedback.
  }
}

if (typeof document.addEventListener === "function") {
  document.addEventListener("pointerdown", unlockToastAudio);
  document.addEventListener("keydown", unlockToastAudio);
}

function dismissStatus() {
  if (statusTimer !== null) {
    clearTimeout(statusTimer);
    statusTimer = null;
  }
  statusIcon.textContent = "";
  statusMessage.textContent = "";
  statusElement.hidden = true;
}

statusCloseButton.addEventListener("click", dismissStatus);

function beginBusy(button, label) {
  if (button.disabled) {
    return false;
  }
  button.disabled = true;
  button.dataset.originalLabel = button.textContent;
  button.textContent = label;
  return true;
}

function endBusy(button) {
  button.disabled = false;
  button.textContent = button.dataset.originalLabel || button.textContent;
  delete button.dataset.originalLabel;
}

for (const toggle of passwordVisibilityControls) {
  toggle.addEventListener("click", () => {
    const input = document.getElementById(toggle.getAttribute("aria-controls"));
    const isVisible = input.type === "text";
    input.type = isVisible ? "password" : "text";
    toggle.textContent = isVisible ? "Show" : "Hide";
    toggle.setAttribute("aria-pressed", String(!isVisible));
    const fieldLabel = input.name === "password"
      ? "password"
      : input.name === "confirmPassword"
        ? "new password confirmation"
        : "new password";
    toggle.setAttribute(
      "aria-label",
      `${isVisible ? "Show" : "Hide"} ${fieldLabel}`,
    );
  });
}

function apiErrorMessage(body, fallback) {
  if (!body || typeof body !== "object" || !("error" in body)) {
    return fallback;
  }
  const error = body.error;
  if (typeof error === "string" && error.trim()) {
    return error;
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message.trim()
  ) {
    return error.message;
  }
  return fallback;
}

async function apiRequest(path, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      ...options,
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new Error("The server could not be reached. Check your connection and try again.");
  }

  let body = {};
  try {
    body = await response.json();
  } catch {
    throw new Error("The server returned an unreadable response.");
  }
  if (!response.ok) {
    const method = options.method ?? "GET";
    const requiresSession = path === "/api/admin/session"
      ? method !== "POST" && method !== "DELETE"
      : !path.startsWith("/api/admin/password-recovery");
    if (response.status === 401 && requiresSession) {
      showSignedOut();
      throw new Error("Your session expired. Please sign in again.");
    }
    throw new Error(
      apiErrorMessage(body, "The request could not be completed. Please try again."),
    );
  }
  return body;
}

function showSignedOut() {
  dashboard.hidden = true;
  signOutButton.hidden = true;
  recoveryRequestPanel.hidden = true;
  passwordResetPanel.hidden = true;
  signInPanel.hidden = false;
}

function showDashboardView(viewId) {
  const selectedView = dashboardViews[viewId] ? viewId : "today-plan-view";
  for (const [id, view] of Object.entries(dashboardViews)) {
    view.hidden = id !== selectedView;
    if (id === selectedView) {
      dashboardNavigation[id].setAttribute("aria-current", "page");
    } else {
      dashboardNavigation[id].removeAttribute("aria-current");
    }
  }
}

async function showDashboard() {
  signInPanel.hidden = true;
  dashboard.hidden = false;
  showDashboardView(window.location.hash.slice(1));
  signOutButton.hidden = false;
  await loadDashboard();
  if (window.location.hash === "#menu-view") {
    await loadMenuItems();
  }
}

function formatPrice(priceCents) {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
  }).format(priceCents / 100);
}

function formatServiceDate(isoDate) {
  if (typeof isoDate !== "string") {
    return "";
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) {
    return isoDate;
  }
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day)
  ) {
    return isoDate;
  }
  return `${day}/${month}/${year}`;
}

function formatRecordedAt(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Johannesburg",
  }).format(date);
}

function normalizeSearch(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function isMenuCategory(value) {
  return typeof value === "object" &&
    value !== null &&
    typeof value.id === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.id) &&
    typeof value.name === "string" &&
    value.name.trim().length > 0 &&
    Number.isSafeInteger(value.categoryOrder) &&
    typeof value.active === "boolean";
}

function isMenuItem(value) {
  return typeof value === "object" &&
    value !== null &&
    typeof value.id === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.id) &&
    typeof value.name === "string" &&
    value.name.trim().length > 0 &&
    typeof value.description === "string" &&
    Number.isSafeInteger(value.priceCents) &&
    value.priceCents >= 0 &&
    typeof value.categoryId === "string" &&
    menuCategories.some((category) => category.id === value.categoryId) &&
    Number.isSafeInteger(value.itemOrder) &&
    typeof value.active === "boolean";
}

function renderMenuCategoryOptions(selectedId = menuItemCategoryInput.value) {
  menuItemCategoryInput.replaceChildren();
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = menuCategories.length
    ? "Choose a category"
    : "Create a category first";
  menuItemCategoryInput.append(placeholder);
  for (const category of menuCategories) {
    const option = document.createElement("option");
    option.value = category.id;
    option.textContent = `${category.name}${category.active ? "" : " (Inactive)"}`;
    menuItemCategoryInput.append(option);
  }
  menuItemCategoryInput.value = selectedId;
  menuItemCategoryInput.disabled = menuCategories.length === 0;
  saveMenuItemButton.disabled = menuCategories.length === 0;
}

function renderMenuCategories() {
  menuCategoriesList.replaceChildren();
  menuCategoriesState.textContent = menuCategories.length
    ? `${menuCategories.length} saved ${menuCategories.length === 1 ? "category" : "categories"}.`
    : "No menu categories have been added yet.";
  for (const category of menuCategories) {
    const row = document.createElement("li");
    row.className = "plate-item";
    const details = document.createElement("div");
    details.className = "plate-item__details";
    const name = document.createElement("span");
    name.className = "plate-item__name";
    name.textContent = `${category.name}${category.active ? "" : " (Inactive)"}`;
    const count = menuItems.filter((item) => item.categoryId === category.id).length;
    const summary = document.createElement("span");
    summary.className = "plate-item__description";
    summary.textContent = `Display order ${category.categoryOrder} · ${count} ${count === 1 ? "item" : "items"}`;
    details.append(name, summary);

    const actions = document.createElement("div");
    actions.className = "plate-item__actions";
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "button button--quiet";
    edit.textContent = "Edit";
    edit.setAttribute("aria-label", `Edit ${category.name}`);
    edit.addEventListener("click", () => editMenuCategory(category));
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "button button--quiet";
    toggle.textContent = category.active ? "Deactivate" : "Restore";
    toggle.setAttribute(
      "aria-label",
      `${category.active ? "Deactivate" : "Restore"} ${category.name}`,
    );
    toggle.addEventListener("click", () =>
      setMenuCategoryActive(category, !category.active, toggle)
    );
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "button button--quiet";
    remove.textContent = "Delete";
    remove.setAttribute("aria-label", `Delete ${category.name}`);
    remove.addEventListener("click", () => deleteMenuCategory(category, remove));
    actions.append(edit, toggle, remove);
    row.append(details, actions);
    menuCategoriesList.append(row);
  }
  renderMenuCategoryOptions();
}

function renderMenuItems() {
  menuItemsList.replaceChildren();
  menuItemsState.textContent = menuItems.length
    ? `${menuItems.length} saved menu ${menuItems.length === 1 ? "item" : "items"}.`
    : "No menu items have been added yet.";
  for (const menuItem of menuItems) {
    const row = document.createElement("li");
    row.className = "plate-item";
    const details = document.createElement("div");
    details.className = "plate-item__details";
    const name = document.createElement("span");
    name.className = "plate-item__name";
    const category = menuCategories.find((entry) => entry.id === menuItem.categoryId);
    name.textContent = `${menuItem.name}${menuItem.active ? "" : " (Inactive)"}`;
    const description = document.createElement("span");
    description.className = "plate-item__description";
    description.textContent = [
      category?.name ?? "Unknown category",
      category && !category.active ? "Inactive category" : "",
      `R${menuItem.priceCents % 100 === 0
        ? menuItem.priceCents / 100
        : (menuItem.priceCents / 100).toFixed(2)}`,
      menuItem.description,
    ].filter(Boolean).join(" · ");
    details.append(name, description);

    const actions = document.createElement("div");
    actions.className = "plate-item__actions";
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "button button--quiet";
    edit.textContent = "Edit";
    edit.setAttribute("aria-label", `Edit ${menuItem.name}`);
    edit.addEventListener("click", () => editMenuItem(menuItem));
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "button button--quiet";
    toggle.textContent = menuItem.active ? "Deactivate" : "Restore";
    toggle.setAttribute(
      "aria-label",
      `${menuItem.active ? "Deactivate" : "Restore"} ${menuItem.name}`,
    );
    toggle.addEventListener("click", () => setMenuItemActive(menuItem, !menuItem.active, toggle));
    actions.append(edit, toggle);
    row.append(details, actions);
    menuItemsList.append(row);
  }
}

async function loadMenuItems() {
  menuItemsState.textContent = "Menu items are loading…";
  try {
    const result = await apiRequest("/api/admin/menu");
    if (
      !Array.isArray(result.categories) ||
      !result.categories.every(isMenuCategory) ||
      !Array.isArray(result.items)
    ) {
      throw new Error("The menu catalog response was invalid.");
    }
    menuCategories = result.categories;
    if (!result.items.every(isMenuItem)) {
      throw new Error("The menu catalog response was invalid.");
    }
    menuItems = result.items;
    renderMenuCategories();
    renderMenuItems();
    return true;
  } catch (error) {
    menuItemsState.textContent = error.message;
    return false;
  }
}

function resetMenuForm() {
  menuForm.reset();
  menuItemIdInput.value = "";
  menuItemNameInput.value = "";
  menuItemDescriptionInput.value = "";
  menuItemPriceInput.value = "";
  menuItemCategoryInput.value = "";
  menuItemOrderInput.value = "0";
  menuItemActiveInput.checked = true;
  cancelMenuEditButton.hidden = true;
  menuEditorTitle.textContent = "Add menu item";
  menuEditorPanel.classList.remove("menu-editor-panel--editing");
}

function editMenuItem(item) {
  showDashboardView("menu-view");
  menuItemIdInput.value = item.id;
  menuItemNameInput.value = item.name;
  menuItemDescriptionInput.value = item.description;
  menuItemPriceInput.value = (item.priceCents / 100).toFixed(2);
  renderMenuCategoryOptions(item.categoryId);
  menuItemOrderInput.value = String(item.itemOrder);
  menuItemActiveInput.checked = item.active;
  cancelMenuEditButton.hidden = false;
  menuEditorTitle.textContent = `Edit ${item.name}`;
  menuEditorPanel.classList.add("menu-editor-panel--editing");
  menuEditorPanel.scrollIntoView({
    behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth",
    block: "start",
  });
  menuItemNameInput.focus({ preventScroll: true });
}

async function setMenuItemActive(item, active, button) {
  if (!beginBusy(button, active ? "Restoring…" : "Deactivating…")) {
    return;
  }
  try {
    const fields = {
      name: item.name,
      description: item.description,
      priceCents: item.priceCents,
      categoryId: item.categoryId,
      itemOrder: item.itemOrder,
      active,
    };
    await apiRequest(`/api/admin/menu/${encodeURIComponent(item.id)}`, {
      method: "PATCH",
      body: JSON.stringify(fields),
    });
    const refreshed = await loadMenuItems();
    setStatus(
      refreshed
        ? `“${item.name}” ${active ? "restored to" : "removed from"} the public menu.`
        : "The menu item was updated, but the list could not be refreshed. Please reload.",
      refreshed ? "success" : "warning",
    );
  } catch (error) {
    setStatus(`The menu item could not be updated. ${error.message}`, "error");
  } finally {
    endBusy(button);
  }
}

menuForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!beginBusy(saveMenuItemButton, "Saving…")) {
    return;
  }
  const price = Number(menuItemPriceInput.value);
  const fields = {
    name: menuItemNameInput.value.trim(),
    description: menuItemDescriptionInput.value.trim(),
    priceCents: Math.round(price * 100),
    categoryId: menuItemCategoryInput.value,
    itemOrder: Number(menuItemOrderInput.value),
    active: menuItemActiveInput.checked,
  };
  if (
    !fields.name ||
    !fields.categoryId ||
    !Number.isFinite(price) ||
    price < 0 ||
    price > 1_000_000 ||
    !Number.isSafeInteger(fields.itemOrder) ||
    fields.itemOrder < 0
  ) {
    setStatus("Enter a valid name, price, category, and non-negative item order.", "error");
    endBusy(saveMenuItemButton);
    return;
  }
  try {
    const id = menuItemIdInput.value;
    await apiRequest(id ? `/api/admin/menu/${encodeURIComponent(id)}` : "/api/admin/menu", {
      method: id ? "PATCH" : "POST",
      body: JSON.stringify(fields),
    });
    resetMenuForm();
    const refreshed = await loadMenuItems();
    setStatus(
      refreshed
        ? `“${fields.name}” has been ${id ? "updated" : "added"} to the menu.`
        : "The menu item was saved, but the list could not be refreshed. Please reload.",
      refreshed ? "success" : "warning",
    );
  } catch (error) {
    setStatus(`The menu item could not be saved. ${error.message}`, "error");
  } finally {
    endBusy(saveMenuItemButton);
  }
});

newMenuItemButton.addEventListener("click", () => {
  resetMenuForm();
  menuItemNameInput.focus();
});
cancelMenuEditButton.addEventListener("click", resetMenuForm);
menuItemCategoryInput.addEventListener("change", () => {
  const matchingItems = menuItems.filter((item) =>
    item.categoryId === menuItemCategoryInput.value
  );
  menuItemOrderInput.value = String(
    Math.max(-1, ...matchingItems.map((item) => item.itemOrder)) + 1,
  );
});

function resetMenuCategoryForm() {
  menuCategoryForm.reset();
  menuCategoryIdInput.value = "";
  menuCategoryNameInput.value = "";
  menuCategorySortOrderInput.value = String(
    Math.max(-1, ...menuCategories.map((category) => category.categoryOrder)) + 1,
  );
  menuCategoryActiveInput.checked = true;
  menuCategoryEditorTitle.textContent = "Add category";
  cancelMenuCategoryEditButton.hidden = true;
}

function editMenuCategory(category) {
  menuCategoryIdInput.value = category.id;
  menuCategoryNameInput.value = category.name;
  menuCategorySortOrderInput.value = String(category.categoryOrder);
  menuCategoryActiveInput.checked = category.active;
  menuCategoryEditorTitle.textContent = `Edit ${category.name}`;
  cancelMenuCategoryEditButton.hidden = false;
  menuCategoryNameInput.focus({ preventScroll: true });
}

async function setMenuCategoryActive(category, active, button) {
  if (!beginBusy(button, active ? "Restoring…" : "Deactivating…")) {
    return;
  }
  try {
    await apiRequest(`/api/admin/menu/categories/${encodeURIComponent(category.id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        name: category.name,
        categoryOrder: category.categoryOrder,
        active,
      }),
    });
    const refreshed = await loadMenuItems();
    setStatus(
      refreshed
        ? `“${category.name}” ${active ? "restored to" : "removed from"} the public menu.`
        : "The category was updated, but the list could not be refreshed. Please reload.",
      refreshed ? "success" : "warning",
    );
  } catch (error) {
    setStatus(`The category could not be updated. ${error.message}`, "error");
  } finally {
    endBusy(button);
  }
}

async function deleteMenuCategory(category, button) {
  if (!beginBusy(button, "Deleting…")) {
    return;
  }
  try {
    await apiRequest(`/api/admin/menu/categories/${encodeURIComponent(category.id)}`, {
      method: "DELETE",
    });
    const refreshed = await loadMenuItems();
    setStatus(
      refreshed
        ? `“${category.name}” has been deleted.`
        : "The category was deleted, but the list could not be refreshed. Please reload.",
      refreshed ? "success" : "warning",
    );
  } catch (error) {
    setStatus(`The category could not be deleted. ${error.message}`, "error");
  } finally {
    endBusy(button);
  }
}

menuCategoryForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!beginBusy(saveMenuCategoryButton, "Saving…")) {
    return;
  }
  const fields = {
    name: menuCategoryNameInput.value.trim(),
    categoryOrder: Number(menuCategorySortOrderInput.value),
    active: menuCategoryActiveInput.checked,
  };
  if (
    !fields.name ||
    !Number.isSafeInteger(fields.categoryOrder) ||
    fields.categoryOrder < 0
  ) {
    setStatus("Enter a valid category name and non-negative display order.", "error");
    endBusy(saveMenuCategoryButton);
    return;
  }
  try {
    const id = menuCategoryIdInput.value;
    await apiRequest(
      id ? `/api/admin/menu/categories/${encodeURIComponent(id)}` : "/api/admin/menu/categories",
      {
        method: id ? "PATCH" : "POST",
        body: JSON.stringify(fields),
      },
    );
    resetMenuCategoryForm();
    const refreshed = await loadMenuItems();
    setStatus(
      refreshed
        ? `“${fields.name}” has been ${id ? "updated" : "added"} as a menu category.`
        : "The category was saved, but the list could not be refreshed. Please reload.",
      refreshed ? "success" : "warning",
    );
  } catch (error) {
    setStatus(`The category could not be saved. ${error.message}`, "error");
  } finally {
    endBusy(saveMenuCategoryButton);
  }
});

newMenuCategoryButton.addEventListener("click", () => {
  resetMenuCategoryForm();
  menuCategoryNameInput.focus();
});
cancelMenuCategoryEditButton.addEventListener("click", resetMenuCategoryForm);

function matchingPlates(searchText, selectedId = "") {
  const query = normalizeSearch(searchText);
  return plates.filter((plate) =>
    !query ||
    plate.id === selectedId ||
    normalizeSearch(`${plate.name} ${plate.description}`).includes(query)
  );
}

function updateTodaySummary() {
  const selected = plates.find((plate) => plate.id === todayPlateId);
  todaySummary.textContent = selected
    ? `${selected.name} — ${formatPrice(selected.priceCents)}`
    : "No plate has been selected for today.";
  clearTodayButton.hidden = !selected;
}

function renderPlateList(preserveSelection = false) {
  const todaySelection = preserveSelection ? todaySelect.value : todayPlateId ?? "";
  const scheduleSelection = preserveSelection ? scheduleSelect.value : "";
  plateList.replaceChildren();
  todaySelect.replaceChildren();
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = plates.length ? "Select a saved plate" : "Save a plate first";
  todaySelect.append(placeholder);

  for (const plate of matchingPlates(todayPlateSearch.value, todaySelection)) {
    const option = document.createElement("option");
    option.value = plate.id;
    option.textContent = plate.name;
    option.selected = plate.id === todaySelection;
    todaySelect.append(option);
  }
  todaySelect.value = todaySelection;

  const libraryPlates = matchingPlates(libraryPlateSearch.value);
  for (const plate of libraryPlates) {
    const item = document.createElement("li");
    item.className = "plate-item";
    const details = document.createElement("div");
    details.className = "plate-item__details";
    const name = document.createElement("span");
    name.className = "plate-item__name";
    name.textContent = `${plate.name} — ${formatPrice(plate.priceCents)}`;
    const description = document.createElement("span");
    description.className = "plate-item__description";
    description.textContent = plate.description || "No description";
    details.append(name, description);

    const actions = document.createElement("div");
    actions.className = "plate-item__actions";
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "button button--quiet";
    editButton.textContent = "Edit";
    editButton.setAttribute("aria-label", `Edit ${plate.name}`);
    editButton.addEventListener("click", () => editPlate(plate));

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "button button--quiet";
    deleteButton.textContent = "Delete";
    deleteButton.setAttribute("aria-label", `Delete ${plate.name}`);
    deleteButton.addEventListener("click", () => deletePlate(plate));
    actions.append(editButton, deleteButton);
    item.append(details, actions);
    plateList.append(item);
  }
  librarySearchEmpty.hidden = !libraryPlateSearch.value || libraryPlates.length > 0;
  const shouldShowSearch = plates.length > PLATE_SEARCH_THRESHOLD;
  todayPlateSearchWrap.hidden = !shouldShowSearch;
  planPlateSearchWrap.hidden = !shouldShowSearch;
  libraryPlateSearchWrap.hidden = !shouldShowSearch;
  setTodayButton.disabled = plates.length === 0;
  averagePriceButton.disabled = plates.length === 0;
  scheduleSelect.replaceChildren();
  const schedulePlaceholder = document.createElement("option");
  schedulePlaceholder.value = "";
  schedulePlaceholder.textContent = "Not planned";
  scheduleSelect.append(schedulePlaceholder);
  for (const plate of matchingPlates(planPlateSearch.value, scheduleSelection)) {
    const option = document.createElement("option");
    option.value = plate.id;
    option.textContent = plate.name;
    scheduleSelect.append(option);
  }
  scheduleSelect.value = scheduleSelection;
  updateTodaySummary();
  updateScheduleSummary();
}

function updateScheduleSummary() {
  const selected = plates.find((plate) => plate.id === scheduleSelect.value);
  scheduleSummary.textContent = selected && scheduleDateInput.value
    ? `${selected.name} is ready to be planned for ${formatServiceDate(scheduleDateInput.value)}.`
    : scheduleDateInput.value
    ? `No plate is planned for ${formatServiceDate(scheduleDateInput.value)}.`
    : "Choose a date.";
}

function selectScheduledPlate() {
  const scheduled = upcomingAssignments.find((item) => item.serviceDate === scheduleDateInput.value);
  scheduleSelect.value = scheduled?.plate.id ?? "";
  updateScheduleSummary();
}

function planningWeekdays(startDate) {
  const dates = [];
  const date = new Date(`${startDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  while (dates.length < 5) {
    const day = date.getUTCDay();
    if (day !== 0 && day !== 6) {
      dates.push(date.toISOString().slice(0, 10));
    }
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return dates;
}

function addDays(value, amount) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function renderWeeklyPlan(preserveSelection = false) {
  const currentSelections = preserveSelection
    ? new Map([...weeklyPlanList.children].map((row) => [
        row.dataset.serviceDate,
        row.children[1].value,
      ]))
    : new Map();
  weeklyPlanList.replaceChildren();
  if (!serviceDate.dataset.isoDate) {
    return;
  }
  const assignments = new Map(upcomingAssignments.map((item) => [item.serviceDate, item.plate]));
  for (const [index, date] of planningWeekdays(serviceDate.dataset.isoDate).entries()) {
    const row = document.createElement("div");
    row.className = "weekly-plan-row";
    row.dataset.serviceDate = date;
    row.dataset.dayNumber = String(index + 2);
    const label = document.createElement("label");
    const weekday = new Intl.DateTimeFormat("en-GB", {
      weekday: "long",
      timeZone: "UTC",
    }).format(new Date(`${date}T00:00:00.000Z`));
    label.textContent = `Day ${index + 2} · ${weekday} · ${formatServiceDate(date)}`;
    const select = document.createElement("select");
    select.setAttribute("aria-label", `Saved plate for ${label.textContent}`);
    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = "Not planned";
    select.append(empty);
    const existing = plates.find((plate) => plate.id === currentSelections.get(date))
      ?? assignments.get(date);
    for (const plate of matchingPlates(planPlateSearch.value, existing?.id ?? "")) {
      const option = document.createElement("option");
      option.value = plate.id;
      option.textContent = plate.name;
      select.append(option);
    }
    select.value = existing?.id ?? "";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "button button--secondary";
    button.textContent = "Save";
    button.addEventListener("click", async () => {
      if (!beginBusy(button, "Saving…")) {
        return;
      }
      setStatus(
        select.value
          ? `Saving the plate for ${label.textContent}…`
          : `Marking ${label.textContent} as not planned…`,
      );
      try {
        const result = await apiRequest("/api/admin/plates/today", {
          method: "POST",
          body: JSON.stringify({ serviceDate: date, plateId: select.value || null }),
        });
        await loadDashboard();
        setStatus(
          select.value
            ? `${result.today.plate.name} planned for ${formatServiceDate(result.today.serviceDate)}.`
            : `No plate planned for ${formatServiceDate(result.serviceDate)}.`,
          "success",
        );
      } catch (error) {
        setStatus(`Could not save ${label.textContent}. ${error.message}`, "error");
      } finally {
        endBusy(button);
      }
    });
    row.append(label, select, button);
    weeklyPlanList.append(row);
  }
}

function historyCategory(eventType) {
  if (eventType === "assigned" || eventType === "backfilled") {
    return "assignment";
  }
  if (eventType === "changed" || eventType === "cleared") {
    return "plan";
  }
  return "library";
}

function historyTypeLabel(eventType) {
  return {
    assigned: "Plate assigned",
    backfilled: "Earlier assignment",
    changed: "Plan changed",
    cleared: "Plan cleared",
    plate_deleted: "Plate removed from library",
  }[eventType] ?? "History event";
}

function historySummary(item) {
  const previousName = item.previousPlate?.name;
  const currentName = item.currentPlate?.name;
  if (item.eventType === "changed") {
    return `Changed from ${previousName || "no plate"} to ${currentName || "no plate"}`;
  }
  if (item.eventType === "cleared") {
    return `${previousName || "Plate"} removed from the plan`;
  }
  if (item.eventType === "plate_deleted") {
    return `${previousName || "Plate"} deleted from the library; historical record kept`;
  }
  return currentName || "Plate assignment";
}

function historySearchText(item) {
  return normalizeSearch([
    item.serviceDate,
    formatServiceDate(item.serviceDate),
    item.eventType,
    historyTypeLabel(item.eventType),
    historySummary(item),
    item.occurredAt,
    formatRecordedAt(item.occurredAt),
    ...[item.previousPlate, item.currentPlate]
      .filter(Boolean)
      .flatMap((plate) => [
        plate.name,
        plate.description,
        plate.priceCents,
        formatPrice(plate.priceCents),
      ]),
  ].join(" "));
}

function historySnapshotLabel(label, plate) {
  if (!plate) {
    return "";
  }
  const parts = [plate.name, plate.description, formatPrice(plate.priceCents)]
    .filter(Boolean);
  return `${label}: ${parts.join(" · ")}`;
}

function renderHistory() {
  historyList.replaceChildren();
  const query = normalizeSearch(historySearchInput.value);
  const category = historyEventFilter.value || "all";
  const visibleEvents = historyEvents
    .filter((item) =>
      (category === "all" || historyCategory(item.eventType) === category) &&
      (!query || historySearchText(item).includes(query))
    )
    .sort((left, right) =>
      right.serviceDate.localeCompare(left.serviceDate) ||
      right.occurredAt.localeCompare(left.occurredAt) ||
      right.id - left.id
    );

  for (const item of visibleEvents) {
    const row = document.createElement("li");
    row.className = "history-item";
    const details = document.createElement("div");
    details.className = "history-item__details";
    const type = document.createElement("span");
    type.className = `history-item__type history-item__type--${historyCategory(item.eventType)}`;
    type.textContent = historyTypeLabel(item.eventType);
    const date = document.createElement("span");
    date.className = "history-item__date";
    date.textContent = `Service date · ${formatServiceDate(item.serviceDate)}`;
    const name = document.createElement("span");
    name.className = "history-item__name";
    name.textContent = historySummary(item);
    details.append(type, date, name);
    for (const [label, plate] of [
      ["Before", item.previousPlate],
      ["Plate", item.currentPlate],
    ]) {
      const snapshot = historySnapshotLabel(label, plate);
      if (snapshot) {
        const snapshotDetails = document.createElement("span");
        snapshotDetails.className = "history-item__snapshot";
        snapshotDetails.textContent = snapshot;
        details.append(snapshotDetails);
      }
    }
    const recorded = document.createElement("span");
    recorded.className = "history-item__recorded";
    recorded.textContent = `Recorded · ${formatRecordedAt(item.occurredAt)}`;
    details.append(recorded);
    row.append(details);
    historyList.append(row);
  }

  if (!historyEvents.length) {
    historyState.textContent = "No history yet. Assign a plate or make a change to start your record.";
  } else if (!visibleEvents.length) {
    historyState.textContent = `No loaded history entries match. Search covers ${historyEvents.length} loaded entries${historyHasMore ? "; load older history to search further back" : ""}.`;
  } else {
    historyState.textContent = `${visibleEvents.length} of ${historyEvents.length} loaded history ${historyEvents.length === 1 ? "entry" : "entries"} shown. ${historyHasMore ? "Search covers loaded entries only; load older history to search further back." : "Dates are DD/MM/YYYY; newest service dates first."}`;
  }
}

async function loadHistory(before = null, append = false) {
  if (append && !beginBusy(historyLoadMoreButton, "Loading…")) {
    return;
  }
  historyState.textContent = append ? "Loading older history…" : "Loading history…";
  historyRetryButton.hidden = true;
  try {
    const path = before === null
      ? "/api/admin/history"
      : `/api/admin/history?before=${encodeURIComponent(before)}`;
    const result = await apiRequest(path);
    if (!Array.isArray(result.events) || typeof result.hasMore !== "boolean") {
      throw new Error("History could not be read. Please try again.");
    }
    historyEvents = append ? [...historyEvents, ...result.events] : result.events;
    historyHasMore = result.hasMore;
    historyNextBefore = result.nextBefore;
    renderHistory();
  } catch (error) {
    historyState.textContent = error.message;
    historyRetryButton.hidden = false;
  } finally {
    historyLoadMoreButton.hidden = !historyHasMore;
    if (append) {
      endBusy(historyLoadMoreButton);
    }
  }
}

async function loadDashboard() {
  setStatus("Loading today’s plate, plan ahead, and plate library…");
  let loaded = false;
  try {
    const catalog = await apiRequest("/api/admin/plates");
    const daily = await apiRequest("/api/admin/plates/today");
    plates = catalog.plates;
    upcomingAssignments = daily.upcoming;
    todayPlateId = daily.today?.id ?? null;
    serviceDate.dataset.isoDate = daily.serviceDate;
    serviceDate.textContent = formatServiceDate(daily.serviceDate);
    scheduleDateInput.min = daily.serviceDate;
    scheduleDateInput.max = addDays(daily.serviceDate, 365);
    scheduleDateInput.value ||= daily.serviceDate;
    renderPlateList();
    renderWeeklyPlan();
    selectScheduledPlate();
    loaded = true;
    setStatus("");
  } catch (error) {
    setStatus(error.message, "error");
  }
  await loadHistory();
  return loaded;
}

scheduleDateInput.addEventListener("change", selectScheduledPlate);
scheduleSelect.addEventListener("change", updateScheduleSummary);

saveScheduleButton.addEventListener("click", async () => {
  if (!beginBusy(saveScheduleButton, "Saving…")) {
    return;
  }
  if (!scheduleDateInput.value) {
    setStatus("Choose a date first.", "error");
    endBusy(saveScheduleButton);
    return;
  }
  setStatus(
    scheduleSelect.value ? "Saving the planned plate…" : "Marking the day as not planned…",
  );
  try {
    const result = await apiRequest("/api/admin/plates/today", {
      method: "POST",
      body: JSON.stringify({
        serviceDate: scheduleDateInput.value,
        plateId: scheduleSelect.value || null,
      }),
    });
    await loadDashboard();
    setStatus(
      scheduleSelect.value
        ? `${result.today.plate.name} planned for ${formatServiceDate(result.today.serviceDate)}.`
        : `No plate planned for ${formatServiceDate(result.serviceDate)}.`,
      "success",
    );
  } catch (error) {
    setStatus(`Could not save ${formatServiceDate(scheduleDateInput.value)}. ${error.message}`, "error");
  } finally {
    endBusy(saveScheduleButton);
  }
});

function resetForm() {
  plateForm.reset();
  plateIdInput.value = "";
  selectedImageFile = null;
  savedImageUrl = null;
  imageInput.value = "";
  cameraImageInput.value = "";
  imageNote.textContent = "Choose a photo from your camera or gallery. It will be resized and saved as a web-friendly image (up to 5 MB).";
  clearImagePreview();
  cancelEditButton.hidden = true;
  plateEditorPanel.classList.remove("plate-editor-panel--editing");
  plateEditorTitle.textContent = "Create plate";
}

function clearImagePreview() {
  if (previewObjectUrl) {
    URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = null;
  }
  imagePreviewImage.removeAttribute("src");
  imagePreviewImage.alt = "";
  imagePreview.hidden = true;
}

function showImagePreview(source, alt, isLocalPreview = false) {
  clearImagePreview();
  if (!source) {
    return;
  }
  if (isLocalPreview) {
    previewObjectUrl = source;
  }
  imagePreviewImage.src = source;
  imagePreviewImage.alt = alt;
  imagePreview.hidden = false;
}

function editPlate(plate) {
  showDashboardView("plate-library-view");
  plateIdInput.value = plate.id;
  nameInput.value = plate.name;
  descriptionInput.value = plate.description;
  priceInput.value = (plate.priceCents / 100).toFixed(2);
  selectedImageFile = null;
  imageInput.value = "";
  cameraImageInput.value = "";
  savedImageUrl = plate.imageUrl;
  imageNote.textContent = savedImageUrl
    ? "Saved photo shown below. It will be kept unless you choose a replacement."
    : "No saved photo. Add one if you want a photo with this plate.";
  showImagePreview(savedImageUrl, `Saved photo of ${plate.name}`);
  cancelEditButton.hidden = false;
  plateEditorPanel.classList.add("plate-editor-panel--editing");
  plateEditorTitle.textContent = `Edit ${plate.name}`;
  scrollToPlateEditor();
  nameInput.focus({ preventScroll: true });
}

function scrollToPlateEditor() {
  const behavior = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
  plateEditorPanel.scrollIntoView({ behavior, block: "start" });
}

function clearImageFileInputs() {
  imageInput.value = "";
  cameraImageInput.value = "";
}

function handleImageSelection(sourceInput) {
  const image = sourceInput.files[0];
  if (!image) {
    return;
  }
  if (!SOURCE_IMAGE_TYPES.has(image.type.toLowerCase())) {
    selectedImageFile = null;
    clearImageFileInputs();
    showImagePreview(savedImageUrl, savedImageUrl ? "Saved plate photo" : "");
    imageNote.textContent = "Choose a photo from your camera or gallery. It will be resized and saved as a web-friendly image (up to 5 MB).";
    setStatus("Choose a photo such as JPEG, PNG, WebP, or HEIC.", "error");
    return;
  }
  if (image.size < 1) {
    selectedImageFile = null;
    clearImageFileInputs();
    showImagePreview(savedImageUrl, savedImageUrl ? "Saved plate photo" : "");
    imageNote.textContent = "Choose a photo from your camera or gallery. It will be resized and saved as a web-friendly image (up to 5 MB).";
    setStatus("The selected photo is empty. Choose another photo.", "error");
    return;
  }
  if (previewObjectUrl) {
    URL.revokeObjectURL(previewObjectUrl);
  }
  selectedImageFile = image;
  clearImageFileInputs();
  const localPreviewUrl = URL.createObjectURL(image);
  showImagePreview(localPreviewUrl, `Selected photo: ${image.name}`, true);
  imageNote.textContent = `Ready to upload: ${image.name}. Save the plate to resize and apply this photo.`;
  setStatus("");
}

imageInput.addEventListener("change", () => handleImageSelection(imageInput));
cameraImageInput.addEventListener("change", () => handleImageSelection(cameraImageInput));

clearImageButton.addEventListener("click", () => {
  selectedImageFile = null;
  clearImageFileInputs();
  showImagePreview(savedImageUrl, savedImageUrl ? "Saved plate photo" : "");
  imageNote.textContent = savedImageUrl
    ? "Saved photo will be kept. Choose another photo to replace it."
    : "No photo selected. This plate will be saved without a photo.";
  setStatus("");
});

async function uploadSelectedImage() {
  const image = selectedImageFile;
  if (!image) {
    return savedImageUrl;
  }
  const sourceType = image.type.toLowerCase();
  if (!SOURCE_IMAGE_TYPES.has(sourceType)) {
    throw new Error("Choose a photo such as JPEG, PNG, WebP, or HEIC.");
  }
  if (image.size < 1) {
    throw new Error("The selected photo is empty. Choose another photo.");
  }
  const normalized = await normalizeImage(image);
  setStatus("Uploading photo and saving plate…");
  const response = await fetch("/api/admin/images", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": normalized.type },
    body: normalized,
  });
  let body = {};
  try {
    body = await response.json();
  } catch {
    throw new Error("The image upload returned an unreadable response.");
  }
  if (!response.ok) {
    if (response.status === 401) {
      showSignedOut();
      throw new Error("Your session expired. Please sign in again.");
    }
    throw new Error(apiErrorMessage(body, "The image could not be uploaded. Please try again."));
  }
  return body.imageUrl;
}

async function normalizeImage(file) {
  const sourceType = file.type.toLowerCase();
  const canDecode = typeof createImageBitmap === "function";
  if (!canDecode) {
    if (sourceType === "image/heic" || sourceType === "image/heif") {
      throw new Error("This device could not convert that HEIC photo. Choose JPEG or PNG instead.");
    }
    if (file.size > MAX_IMAGE_BYTES) {
      throw new Error("This photo is larger than 5 MB and this browser could not resize it. Choose a smaller photo.");
    }
    return file;
  }

  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("This photo format could not be opened on this device. Choose JPEG or PNG instead.");
  }
  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close?.();
    throw new Error("This device could not prepare the photo. Choose a smaller JPEG or PNG.");
  }
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  let quality = 0.82;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (blob && blob.size > 0 && blob.size <= MAX_IMAGE_BYTES) {
      return blob;
    }
    quality -= 0.12;
  }
  throw new Error("This photo could not be reduced below 5 MB. Choose a smaller photo.");
}

async function deletePlate(plate) {
  if (!window.confirm(`Delete “${plate.name}” from the plate library? Past history will be kept.`)) {
    return;
  }
  const deleteButton = document.querySelector(`[aria-label="Delete ${plate.name}"]`);
  if (deleteButton && !beginBusy(deleteButton, "Deleting…")) {
    return;
  }
  setStatus(`Deleting ${plate.name}…`);
  try {
    await apiRequest(`/api/admin/plates/${encodeURIComponent(plate.id)}`, {
      method: "DELETE",
    });
    await loadDashboard();
    setStatus("Plate deleted.", "success");
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    if (deleteButton) {
      endBusy(deleteButton);
    }
  }
}

signInForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!beginBusy(signInSubmit, "Signing in…")) {
    return;
  }
  setStatus("Signing in…");
  const formData = new FormData(signInForm);
  try {
    await apiRequest("/api/admin/session", {
      method: "POST",
      body: JSON.stringify({
        email: formData.get("email"),
        password: formData.get("password"),
        rememberMe: formData.get("rememberMe") === "on",
      }),
    });
    signInForm.reset();
    setStatus("Signed in.", "success");
    await showDashboard();
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    endBusy(signInSubmit);
  }
});

forgotPasswordButton.addEventListener("click", () => {
  signInPanel.hidden = true;
  recoveryRequestPanel.hidden = false;
  document.querySelector("#recovery-email").value =
    document.querySelector("#email").value;
  document.querySelector("#recovery-email").focus();
  setStatus("");
});

backToSignInButton.addEventListener("click", () => {
  recoveryRequestPanel.hidden = true;
  signInPanel.hidden = false;
  document.querySelector("#email").focus();
  setStatus("");
});

recoveryRequestForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!beginBusy(recoverySubmit, "Sending…")) {
    return;
  }
  setStatus("Sending password reset email…");
  const email = new FormData(recoveryRequestForm).get("email");
  try {
    const result = await apiRequest("/api/admin/password-recovery", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
    setStatus(
      typeof result.message === "string"
        ? result.message
        : "If the address belongs to the owner account, a password reset email will arrive shortly. Check the inbox and spam folder.",
      "success",
    );
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    endBusy(recoverySubmit);
  }
});

backFromPasswordResetButton.addEventListener("click", () => {
  passwordResetPanel.hidden = true;
  signInPanel.hidden = false;
  document.querySelector("#email").focus();
  setStatus("");
});

passwordResetForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(passwordResetForm);
  const password = formData.get("newPassword");
  if (password !== formData.get("confirmPassword")) {
    setStatus("Those passwords do not match. Please enter them again.", "error");
    document.querySelector("#confirm-password").focus();
    return;
  }
  if (!beginBusy(passwordResetSubmit, "Saving…")) {
    return;
  }
  setStatus("Updating your password…");
  try {
    await apiRequest("/api/admin/password-recovery/update", {
      method: "POST",
      body: JSON.stringify({ password }),
    });
    passwordResetForm.reset();
    passwordResetPanel.hidden = true;
    signInPanel.hidden = false;
    setStatus("Your password has been updated. Please sign in with your new password.", "success");
    document.querySelector("#email").focus();
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    endBusy(passwordResetSubmit);
  }
});

signOutButton.addEventListener("click", async () => {
  if (!beginBusy(signOutButton, "Signing out…")) {
    return;
  }
  try {
    await apiRequest("/api/admin/session", { method: "DELETE" });
    showSignedOut();
    setStatus("Signed out.", "success");
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    endBusy(signOutButton);
  }
});

plateForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!beginBusy(savePlateButton, "Saving…")) {
    return;
  }
  const price = Number(priceInput.value);
  const priceCents = Math.round(price * 100);
  if (!Number.isFinite(price) || price < 0 || Math.abs(priceCents / 100 - price) > 0.000001) {
    setStatus("Enter a valid price with no more than two decimal places.", "error");
    priceInput.focus();
    endBusy(savePlateButton);
    return;
  }

  setStatus("Saving plate…");
  try {
    const imageUrl = await uploadSelectedImage();
    const payload = {
      name: nameInput.value,
      description: descriptionInput.value,
      priceCents,
      imageUrl: imageUrl || null,
    };
    const id = plateIdInput.value;
    const saved = await apiRequest(
      id ? `/api/admin/plates/${encodeURIComponent(id)}` : "/api/admin/plates",
      {
        method: id ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      },
    );
    resetForm();
    await loadDashboard();
    setStatus(`${saved.plate.name} saved.`, "success");
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    endBusy(savePlateButton);
  }
});

setTodayButton.addEventListener("click", async () => {
  if (!beginBusy(setTodayButton, "Saving…")) {
    return;
  }
  if (!todaySelect.value) {
    setStatus("Choose a saved plate first.", "error");
    todaySelect.focus();
    endBusy(setTodayButton);
    return;
  }
  setStatus("Setting today’s plate…");
  try {
    const result = await apiRequest("/api/admin/plates/today", {
      method: "POST",
      body: JSON.stringify({ plateId: todaySelect.value }),
    });
    todayPlateId = result.today.plate.id;
    updateTodaySummary();
    setStatus(`Today’s plate is now ${result.today.plate.name}.`, "success");
    await loadDashboard();
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    endBusy(setTodayButton);
  }
});

todaySelect.addEventListener("change", updateTodaySummary);
for (const input of [todayPlateSearch, planPlateSearch, libraryPlateSearch]) {
  input.addEventListener("input", () => {
    renderPlateList(true);
    renderWeeklyPlan(true);
  });
}
historySearchInput.addEventListener("input", renderHistory);
historyEventFilter.addEventListener("change", renderHistory);
historyRetryButton.addEventListener("click", () => loadHistory());
historyLoadMoreButton.addEventListener("click", () =>
  loadHistory(historyNextBefore, true)
);
newPlateButton.addEventListener("click", () => {
  resetForm();
  scrollToPlateEditor();
  nameInput.focus();
});
cancelEditButton.addEventListener("click", resetForm);

averagePriceButton.addEventListener("click", () => {
  if (plates.length === 0) {
    setStatus("Save a plate first to calculate its average price.", "info");
    return;
  }
  const averagePrice = Math.round(
    plates.reduce((total, plate) => total + plate.priceCents, 0) /
      plates.length /
      100,
  );
  priceInput.value = String(averagePrice);
  priceInput.focus();
});

clearTodayButton.addEventListener("click", async () => {
  if (!beginBusy(clearTodayButton, "Clearing…")) {
    return;
  }
  setStatus("Clearing today’s plate…");
  try {
    await apiRequest("/api/admin/plates/today", {
      method: "POST",
      body: JSON.stringify({ plateId: null }),
    });
    todayPlateId = null;
    todaySelect.value = "";
    updateTodaySummary();
    const refreshed = await loadDashboard();
    todaySelect.focus();
    if (!refreshed) {
      setStatus("Today’s plate was cleared, but the admin view could not be refreshed. Please reload.", "warning");
      return;
    }
    setStatus("Today’s plate has been cleared.", "success");
  } catch (error) {
    setStatus(`Today’s plate could not be cleared. ${error.message}`, "error");
  } finally {
    endBusy(clearTodayButton);
  }
});

for (const [viewId, link] of Object.entries(dashboardNavigation)) {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    window.location.hash = `#${viewId}`;
    showDashboardView(viewId);
  });
}

window.addEventListener("hashchange", () => {
  if (!dashboard.hidden) {
    const viewId = window.location.hash.slice(1);
    showDashboardView(viewId);
    if (viewId === "menu-view") {
      void loadMenuItems();
    }
  }
});

async function initialize() {
  document.querySelector("#email").value = "corne.dawson@gmail.com";
  document.querySelector("#recovery-email").value = "corne.dawson@gmail.com";
  const recovery = new URLSearchParams(window.location.search).get("recovery");
  if (recovery) {
    window.history.replaceState(null, "", window.location.pathname);
    if (recovery === "ready") {
      signInPanel.hidden = true;
      passwordResetPanel.hidden = false;
      document.querySelector("#new-password").focus();
      setStatus("Reset link verified. Choose a new password of at least 8 characters.");
      return;
    }
    setStatus("That password reset link is invalid or has expired. Request a new one.", "error");
    return;
  }
  try {
    const session = await apiRequest("/api/admin/session");
    if (session.authenticated) {
      await showDashboard();
      return;
    }
  } catch (error) {
    setStatus(error.message, "error");
  }
}

initialize();

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
const signOutButton = document.querySelector("#sign-out");
const plateForm = document.querySelector("#plate-form");
const plateIdInput = document.querySelector("#plate-id");
const nameInput = document.querySelector("#plate-name");
const descriptionInput = document.querySelector("#plate-description");
const priceInput = document.querySelector("#plate-price");
const imageInput = document.querySelector("#plate-image");
const imageNote = document.querySelector("#image-note");
const imagePreview = document.querySelector("#image-preview");
const imagePreviewImage = document.querySelector("#image-preview-image");
const clearImageButton = document.querySelector("#clear-image");
const plateList = document.querySelector("#plate-list");
const historyList = document.querySelector("#history-list");
const todaySelect = document.querySelector("#today-select");
const todaySummary = document.querySelector("#today-summary");
const serviceDate = document.querySelector("#service-date");
const setTodayButton = document.querySelector("#set-today");
const newPlateButton = document.querySelector("#new-plate");
const cancelEditButton = document.querySelector("#cancel-edit");
const scheduleDateInput = document.querySelector("#schedule-date");
const scheduleSelect = document.querySelector("#schedule-select");
const saveScheduleButton = document.querySelector("#save-schedule");
const savePlateButton = document.querySelector("#save-plate");
const scheduleSummary = document.querySelector("#schedule-summary");
const weeklyPlanList = document.querySelector("#weekly-plan-list");

let plates = [];
let history = [];
let todayPlateId = null;
let savedImageUrl = null;
let previewObjectUrl = null;
let statusTimer = null;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 2000;
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
  if (text && typeof setTimeout === "function") {
    statusTimer = setTimeout(() => {
      dismissStatus();
    }, kind === "error" ? 10000 : 5000);
  }
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

async function showDashboard() {
  signInPanel.hidden = true;
  dashboard.hidden = false;
  signOutButton.hidden = false;
  await loadDashboard();
}

function formatPrice(priceCents) {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
  }).format(priceCents / 100);
}

function updateTodaySummary() {
  const selected = plates.find((plate) => plate.id === todayPlateId);
  todaySummary.textContent = selected
    ? `${selected.name} — ${formatPrice(selected.priceCents)}`
    : "No plate has been selected for today.";
}

function renderPlateList() {
  plateList.replaceChildren();
  todaySelect.replaceChildren();
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = plates.length ? "Select a saved plate" : "Save a plate first";
  todaySelect.append(placeholder);

  for (const plate of plates) {
    const option = document.createElement("option");
    option.value = plate.id;
    option.textContent = plate.name;
    option.selected = plate.id === todayPlateId;
    todaySelect.append(option);

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
  setTodayButton.disabled = plates.length === 0;
  scheduleSelect.replaceChildren();
  const schedulePlaceholder = document.createElement("option");
  schedulePlaceholder.value = "";
  schedulePlaceholder.textContent = "Not planned";
  scheduleSelect.append(schedulePlaceholder);
  for (const plate of plates) {
    const option = document.createElement("option");
    option.value = plate.id;
    option.textContent = plate.name;
    scheduleSelect.append(option);
  }
  updateTodaySummary();
  updateScheduleSummary();
}

function updateScheduleSummary() {
  const selected = plates.find((plate) => plate.id === scheduleSelect.value);
  scheduleSummary.textContent = selected && scheduleDateInput.value
    ? `${selected.name} is ready to be planned for ${scheduleDateInput.value}.`
    : scheduleDateInput.value
    ? `No plate is planned for ${scheduleDateInput.value}.`
    : "Choose a date.";
}

function selectScheduledPlate() {
  const scheduled = history.find((item) => item.serviceDate === scheduleDateInput.value);
  scheduleSelect.value = scheduled?.plate.id ?? "";
  updateScheduleSummary();
}

function planningWeekdays(startDate) {
  const dates = [];
  const date = new Date(`${startDate}T00:00:00.000Z`);
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

function renderWeeklyPlan() {
  weeklyPlanList.replaceChildren();
  if (!serviceDate.textContent) {
    return;
  }
  const assignments = new Map(history.map((item) => [item.serviceDate, item.plate]));
  for (const date of planningWeekdays(serviceDate.textContent)) {
    const row = document.createElement("div");
    row.className = "weekly-plan-row";
    const label = document.createElement("label");
    label.textContent = new Intl.DateTimeFormat("en-ZA", {
      weekday: "long",
      day: "numeric",
      month: "short",
      timeZone: "Africa/Johannesburg",
    }).format(new Date(`${date}T12:00:00.000Z`));
    const select = document.createElement("select");
    select.setAttribute("aria-label", `Saved plate for ${label.textContent}`);
    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = "Not planned";
    select.append(empty);
    for (const plate of plates) {
      const option = document.createElement("option");
      option.value = plate.id;
      option.textContent = plate.name;
      select.append(option);
    }
    const existing = assignments.get(date);
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
            ? `${result.today.plate.name} planned for ${date}.`
            : `No plate planned for ${date}.`,
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

function renderHistory() {
  historyList.replaceChildren();
  for (const item of history) {
    const row = document.createElement("li");
    row.className = "history-item";
    const details = document.createElement("div");
    details.className = "history-item__details";
    const date = document.createElement("span");
    date.className = "eyebrow";
    date.textContent = item.serviceDate;
    const name = document.createElement("span");
    name.className = "history-item__name";
    name.textContent = item.plate.name;
    details.append(date, name);
    row.append(details);
    historyList.append(row);
  }
  if (history.length === 0) {
    const empty = document.createElement("li");
    empty.textContent = "No saved history yet.";
    historyList.append(empty);
  }
}

async function loadDashboard() {
  setStatus("Loading saved plates and history…");
  try {
    const catalog = await apiRequest("/api/admin/plates");
    const daily = await apiRequest("/api/admin/plates/today");
    plates = catalog.plates;
    history = daily.history;
    todayPlateId = daily.today?.id ?? null;
    serviceDate.textContent = daily.serviceDate;
    scheduleDateInput.min = daily.serviceDate;
    scheduleDateInput.max = addDays(daily.serviceDate, 365);
    scheduleDateInput.value ||= daily.serviceDate;
    renderPlateList();
    renderWeeklyPlan();
    renderHistory();
    selectScheduledPlate();
    setStatus("");
  } catch (error) {
    setStatus(error.message, "error");
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
          ? `${result.today.plate.name} planned for ${result.today.serviceDate}.`
          : `No plate planned for ${result.serviceDate}.`,
        "success",
      );
    } catch (error) {
      setStatus(`Could not save ${scheduleDateInput.value}. ${error.message}`, "error");
    } finally {
      endBusy(saveScheduleButton);
    }
  });
}

function resetForm() {
  plateForm.reset();
  plateIdInput.value = "";
  savedImageUrl = null;
  imageNote.textContent = "Choose a photo from your camera or gallery. It will be resized and saved as a web-friendly image (up to 5 MB).";
  clearImagePreview();
  cancelEditButton.hidden = true;
  document.querySelector("#editor-title").textContent = "Plate details";
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
  plateIdInput.value = plate.id;
  nameInput.value = plate.name;
  descriptionInput.value = plate.description;
  priceInput.value = (plate.priceCents / 100).toFixed(2);
  imageInput.value = "";
  savedImageUrl = plate.imageUrl;
  imageNote.textContent = savedImageUrl
    ? "Saved photo shown below. It will be kept unless you choose a replacement."
    : "No saved photo. Add one if you want a photo with this plate.";
  showImagePreview(savedImageUrl, `Saved photo of ${plate.name}`);
  cancelEditButton.hidden = false;
  document.querySelector("#editor-title").textContent = `Edit ${plate.name}`;
  nameInput.focus();
}

imageInput.addEventListener("change", () => {
  const image = imageInput.files[0];
  if (!image) {
    showImagePreview(savedImageUrl, savedImageUrl ? "Saved plate photo" : "");
    imageNote.textContent = savedImageUrl
      ? "Saved photo will be kept. Choose another photo to replace it."
      : "No photo selected. This plate will be saved without a photo.";
    return;
  }
  if (!SOURCE_IMAGE_TYPES.has(image.type.toLowerCase())) {
    imageInput.value = "";
    showImagePreview(savedImageUrl, savedImageUrl ? "Saved plate photo" : "");
    imageNote.textContent = "Choose a photo from your camera or gallery. It will be resized and saved as a web-friendly image (up to 5 MB).";
    setStatus("Choose a photo such as JPEG, PNG, WebP, or HEIC.", "error");
    return;
  }
  if (image.size < 1) {
    imageInput.value = "";
    showImagePreview(savedImageUrl, savedImageUrl ? "Saved plate photo" : "");
    imageNote.textContent = "Choose a photo from your camera or gallery. It will be resized and saved as a web-friendly image (up to 5 MB).";
    setStatus("The selected photo is empty. Choose another photo.", "error");
    return;
  }
  if (previewObjectUrl) {
    URL.revokeObjectURL(previewObjectUrl);
  }
  const localPreviewUrl = URL.createObjectURL(image);
  showImagePreview(localPreviewUrl, `Selected photo: ${image.name}`, true);
  imageNote.textContent = `Ready to upload: ${image.name}. Save the plate to resize and apply this photo.`;
  setStatus("");
});

clearImageButton.addEventListener("click", () => {
  imageInput.value = "";
  showImagePreview(savedImageUrl, savedImageUrl ? "Saved plate photo" : "");
  imageNote.textContent = savedImageUrl
    ? "Saved photo will be kept. Choose another photo to replace it."
    : "No photo selected. This plate will be saved without a photo.";
  setStatus("");
});

async function uploadSelectedImage() {
  const image = imageInput.files[0];
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
  if (!window.confirm(`Delete “${plate.name}”? Saved history will prevent deletion.`)) {
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
    plates = plates.filter((item) => item.id !== plate.id);
    if (todayPlateId === plate.id) {
      todayPlateId = null;
    }
    renderPlateList();
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
newPlateButton.addEventListener("click", () => {
  resetForm();
  nameInput.focus();
});
cancelEditButton.addEventListener("click", resetForm);

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

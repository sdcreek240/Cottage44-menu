const categoryNav = document.querySelector("#category-nav");
const menuSections = document.querySelector("#menu-sections");
const themeToggle = document.querySelector(".theme-toggle");
const themeLabel = document.querySelector(".theme-toggle__label");
const todayPlate = document.querySelector("#today-plate");
const todayPlateSection = todayPlate.closest(".plate-day");
const upcomingRail = document.querySelector("#tomorrow-plate");
const upcomingSection = upcomingRail.closest(".plate-day--next");
const upcomingDots = document.querySelector("#upcoming-dots");
const upcomingNotice = document.querySelector("#upcoming-notice");
const upcomingTitle = document.querySelector("#next-plate-title");
const upcomingPrev = document.querySelector("#upcoming-prev");
const upcomingNext = document.querySelector("#upcoming-next");
const tomorrowCutoff = document.querySelector("#tomorrow-cutoff");
let tomorrowCutoffTimer = null;
let railScrollBound = false;
let currentSlide = 0;

// ---------------------------------------------------------------------------
// Menu loading, with sessionStorage cache
// ---------------------------------------------------------------------------

const MENU_CACHE_KEY = "cottage44-menu-cache";

function loadCachedMenu() {
  try {
    const raw = sessionStorage.getItem(MENU_CACHE_KEY);
    if (!raw) return false;
    const categories = JSON.parse(raw);
    if (!isMenuPayload({ categories })) return false;
    renderMenu(categories);
    return true;
  } catch {
    return false;
  }
}

function isMenuPayload(value) {
  return typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Array.isArray(value.categories) &&
    value.categories.length <= 100 &&
    value.categories.every((category) =>
      typeof category === "object" &&
      category !== null &&
      typeof category.category === "string" &&
      category.category.trim().length > 0 &&
      Array.isArray(category.items) &&
      category.items.every((item) =>
        typeof item === "object" &&
        item !== null &&
        typeof item.id === "string" &&
        typeof item.name === "string" &&
        item.name.trim().length > 0 &&
        Number.isSafeInteger(item.priceCents) &&
        item.priceCents >= 0 &&
        typeof item.description === "string"
      )
    );
}

function renderMenu(categories) {
  categoryNav.replaceChildren();
  menuSections.replaceChildren();
  const sectionIds = new Set();

  for (const [index, { category, items }] of categories.entries()) {
    const slug = category.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const baseId = `category-${slug || index}`;
    const sectionId = sectionIds.has(baseId) ? `${baseId}-${index}` : baseId;
    sectionIds.add(sectionId);
    const link = document.createElement("a");
    link.className = "category-nav__link";
    link.href = `#${sectionId}`;
    link.textContent = category;
    categoryNav.append(link);

    const section = document.createElement("section");
    section.className = "menu-category";
    section.id = sectionId;
    section.setAttribute("aria-labelledby", `${sectionId}-title`);

    const heading = document.createElement("h3");
    heading.className = "menu-category__title";
    heading.id = `${sectionId}-title`;
    heading.textContent = category;
    section.append(heading);

    const list = document.createElement("ul");
    list.className = "menu-list";
    for (const { name, priceCents, description } of items) {
      const item = document.createElement("li");
      item.className = "menu-item";

      const details = document.createElement("span");
      details.className = "menu-item__details";
      const itemName = document.createElement("span");
      itemName.className = "menu-item__name";
      itemName.textContent = name;
      details.append(itemName);

      if (description) {
        const itemContents = document.createElement("span");
        itemContents.className = "menu-item__contents";
        itemContents.textContent = `(${description})`;
        details.append(itemContents);
      }

      const itemPrice = document.createElement("span");
      itemPrice.className = "menu-item__price";
      itemPrice.textContent = `R${priceCents % 100 === 0
        ? priceCents / 100
        : (priceCents / 100).toFixed(2)}`;
      item.append(details, itemPrice);
      list.append(item);
    }
    section.append(list);
    menuSections.append(section);
  }
}

async function loadMenu() {
  const hadCache = loadCachedMenu();

  try {
    const response = await fetch("/api/menu", {
      headers: { Accept: "application/json" },
    });
    const contentType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
    if (
      !response.ok ||
      (contentType !== "application/json" && !contentType?.endsWith("+json"))
    ) {
      throw new Error("Invalid menu response.");
    }
    const payload = await response.json();
    if (!isMenuPayload(payload)) {
      throw new Error("Invalid menu response.");
    }
    renderMenu(payload.categories);
    try {
      sessionStorage.setItem(MENU_CACHE_KEY, JSON.stringify(payload.categories));
    } catch {
      // Storage full or blocked — safe to ignore.
    }
  } catch {
    if (hadCache) return;
    const status = document.createElement("p");
    status.className = "plate-day__status";
    status.setAttribute("role", "status");
    status.textContent = "Our menu is temporarily unavailable. Please try again later.";
    menuSections.replaceChildren(status);
  }
}

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

function setTheme(theme) {
  const isDark = theme === "dark";
  document.documentElement.dataset.theme = theme;
  themeToggle.setAttribute("aria-pressed", String(isDark));
  themeToggle.setAttribute(
    "aria-label",
    `Switch to ${isDark ? "light" : "dark"} theme`,
  );
  themeLabel.textContent = isDark ? "Light" : "Dark";
  document.querySelector('meta[name="theme-color"]').content = getComputedStyle(
    document.documentElement,
  )
    .getPropertyValue("--color-page")
    .trim();
}

// ---------------------------------------------------------------------------
// Date helpers — all anchored to Johannesburg wall-clock
// ---------------------------------------------------------------------------

function todayInSouthAfrica(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-ZA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function isWorkdayIso(iso) {
  const day = new Date(`${iso}T00:00:00.000Z`).getUTCDay();
  return day >= 1 && day <= 5;
}

function addDaysIso(iso, days) {
  const date = new Date(`${iso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// 15:00 cutoff countdown
// ---------------------------------------------------------------------------

function formatRemaining(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}h ${minutes}m ${seconds}s`;
}

function updateTomorrowCutoff(now = new Date()) {
  const cutoff = new Date(`${todayInSouthAfrica(now)}T13:00:00.000Z`);
  const remaining = cutoff.getTime() - now.getTime();
  tomorrowCutoff.hidden = false;
  tomorrowCutoff.textContent = remaining > 0
    ? `Time remaining before the 15:00 canteen cutoff: ${formatRemaining(remaining)}.`
    : "The 15:00 canteen cutoff for tomorrow has passed.";
}

function startTomorrowCutoff() {
  if (tomorrowCutoffTimer !== null) {
    clearInterval(tomorrowCutoffTimer);
  }
  updateTomorrowCutoff();
  tomorrowCutoffTimer = setInterval(updateTomorrowCutoff, 1000);
}

function hideTomorrowCutoff() {
  if (tomorrowCutoffTimer !== null) {
    clearInterval(tomorrowCutoffTimer);
    tomorrowCutoffTimer = null;
  }
  tomorrowCutoff.hidden = true;
  tomorrowCutoff.textContent = "";
}

// ---------------------------------------------------------------------------
// Plate validation
// ---------------------------------------------------------------------------

function isValidServiceDate(value, expected) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return false;
  if (date.toISOString().slice(0, 10) !== value) return false;
  if (expected !== undefined && value !== expected) return false;
  return true;
}

function isValidPlate(value, expectedDate) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  return (
    typeof value.id === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.id) &&
    typeof value.name === "string" &&
    value.name.trim().length > 0 &&
    value.name.length <= 120 &&
    typeof value.description === "string" &&
    value.description.length <= 1000 &&
    Number.isSafeInteger(value.priceCents) &&
    value.priceCents >= 0 &&
    (value.imageUrl === null || (
      typeof value.imageUrl === "string" &&
      value.imageUrl.length <= 2048 &&
      isHttpsUrl(value.imageUrl)
    )) &&
    isValidServiceDate(value.serviceDate, expectedDate)
  );
}

function isValidUpcomingSlot(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  if (!isValidServiceDate(value.serviceDate)) return false;
  if (value.plate === null) return true;
  return isValidPlate(value.plate, value.serviceDate);
}

function isHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Plate rendering
// ---------------------------------------------------------------------------

function finishPlateState(target) {
  target.setAttribute("aria-busy", "false");
}

function renderPlateMessage(target, message) {
  const status = document.createElement("p");
  status.className = "plate-day__status";
  status.setAttribute("role", "status");
  status.textContent = message;
  target.replaceChildren(status);
  finishPlateState(target);
}

function renderPlate(target, plate, options = {}) {
  const priority = options.priority === true;
  const article = document.createElement("article");
  article.className = "plate-card";

  const imageFrame = document.createElement("div");
  imageFrame.className = "plate-card__image-frame";
  if (plate.imageUrl) {
    const image = document.createElement("img");
    image.className = "plate-card__image";
    image.src = plate.imageUrl;
    image.alt = `Photo of ${plate.name}`;
    // Only the very first visible card is eager/high-priority. Everything
    // else stays lazy so the browser's initial network budget goes to what
    // the user actually sees.
    image.loading = priority ? "eager" : "lazy";
    image.decoding = "async";
    image.fetchPriority = priority ? "high" : "low";
    image.addEventListener("error", () => {
      image.hidden = true;
      image.removeAttribute("src");
      const fallback = document.createElement("span");
      fallback.className = "plate-card__image-fallback";
      fallback.setAttribute("role", "img");
      fallback.setAttribute("aria-label", "Photo unavailable");
      fallback.textContent = "Photo unavailable";
      imageFrame.replaceChildren(fallback);
    }, { once: true });
    imageFrame.append(image);
  } else {
    const fallback = document.createElement("span");
    fallback.className = "plate-card__image-fallback";
    fallback.setAttribute("role", "img");
    fallback.setAttribute("aria-label", "No photo available");
    fallback.textContent = "Photo coming soon";
    imageFrame.append(fallback);
  }

  const details = document.createElement("div");
  details.className = "plate-card__details";
  const name = document.createElement("h3");
  name.className = "plate-card__name";
  name.textContent = plate.name;
  const description = document.createElement("p");
  description.className = "plate-card__description";
  description.textContent = plate.description;
  const date = document.createElement("time");
  date.className = "plate-card__date";
  date.dateTime = plate.serviceDate;
  date.textContent = new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "full",
    timeZone: "Africa/Johannesburg",
  }).format(new Date(`${plate.serviceDate}T12:00:00.000Z`));
  const price = document.createElement("p");
  price.className = "plate-card__price";
  price.textContent = new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
  }).format(plate.priceCents / 100);
  details.append(name, description, date, price);
  article.append(imageFrame, details);
  target.replaceChildren(article);
  finishPlateState(target);
}

// ---------------------------------------------------------------------------
// Upcoming rail — one-plate-at-a-time carousel with arrows + dots
// ---------------------------------------------------------------------------

const PLATES_CACHE_KEY = "cottage44-plates-cache";

function labelForIsoDate(iso) {
  return new Intl.DateTimeFormat("en-ZA", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Africa/Johannesburg",
  }).format(new Date(`${iso}T12:00:00.000Z`));
}

function prefersReducedMotion() {
  return typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function selectDot(index) {
  const dots = upcomingDots.children;
  for (let i = 0; i < dots.length; i += 1) {
    dots[i].setAttribute("aria-selected", i === index ? "true" : "false");
  }
}

function updateArrows() {
  if (!upcomingPrev || !upcomingNext) return;
  const total = upcomingRail.children.length;
  const showArrows = total > 1;
  upcomingPrev.hidden = !showArrows || currentSlide === 0;
  upcomingNext.hidden = !showArrows || currentSlide >= total - 1;
}

function goToSlide(index) {
  const total = upcomingRail.children.length;
  if (total === 0) return;
  const clamped = Math.max(0, Math.min(total - 1, index));
  currentSlide = clamped;
  const slot = upcomingRail.children[clamped];
  if (slot && typeof slot.scrollIntoView === "function") {
    slot.scrollIntoView({
      behavior: prefersReducedMotion() ? "auto" : "smooth",
      inline: "start",
      block: "nearest",
    });
  }
  selectDot(clamped);
  updateArrows();
}

function bindRailScrollSync() {
  if (railScrollBound) return;
  railScrollBound = true;
  if (typeof upcomingRail.addEventListener !== "function") return;
  let queued = false;
  upcomingRail.addEventListener("scroll", () => {
    if (queued) return;
    queued = true;
    const run = () => {
      queued = false;
      const slots = upcomingRail.children;
      const railLeft = upcomingRail.scrollLeft ?? 0;
      let closest = 0;
      let closestDistance = Infinity;
      for (let i = 0; i < slots.length; i += 1) {
        const left = slots[i].offsetLeft ?? 0;
        const distance = Math.abs(left - railLeft);
        if (distance < closestDistance) {
          closestDistance = distance;
          closest = i;
        }
      }
      if (closest !== currentSlide) {
        currentSlide = closest;
        selectDot(closest);
        updateArrows();
      }
    };
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(run);
    } else {
      run();
    }
  }, { passive: true });
}

function renderUpcomingRail(slots) {
  upcomingRail.replaceChildren();
  upcomingDots.replaceChildren();
  currentSlide = 0;

  const planned = Array.isArray(slots)
    ? slots.filter((slot) => slot.plate !== null)
    : [];

  if (planned.length === 0) {
    renderPlateMessage(upcomingRail, "No upcoming plates have been planned yet.");
    upcomingDots.hidden = true;
    updateArrows();
    return;
  }

  planned.forEach((slot, index) => {
    const wrapper = document.createElement("div");
    wrapper.className = "plate-rail__slot";
    wrapper.dataset.serviceDate = slot.serviceDate;
    renderPlate(wrapper, slot.plate, { priority: index === 0 });
    upcomingRail.append(wrapper);

    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = "plate-dots__dot";
    dot.dataset.index = String(index);
    dot.setAttribute("role", "tab");
    dot.setAttribute("aria-label", labelForIsoDate(slot.serviceDate));
    dot.setAttribute("aria-selected", index === 0 ? "true" : "false");
    dot.addEventListener("click", () => goToSlide(index));
    upcomingDots.append(dot);
  });

  upcomingDots.hidden = planned.length < 2;
  bindRailScrollSync();
  updateArrows();
  finishPlateState(upcomingRail);
}

// ---------------------------------------------------------------------------
// Cached plates — makes refresh feel instant
// ---------------------------------------------------------------------------

function readPlatesCache(todayIso) {
  try {
    const raw = sessionStorage.getItem(PLATES_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.cachedFor !== todayIso) return null;
    if (!Array.isArray(parsed.upcoming)) return null;
    if (!parsed.upcoming.every(isValidUpcomingSlot)) return null;
    if (parsed.plate !== null && !isValidPlate(parsed.plate, todayIso)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writePlatesCache(todayIso, payload) {
  try {
    sessionStorage.setItem(PLATES_CACHE_KEY, JSON.stringify({
      cachedFor: todayIso,
      plate: payload.plate,
      upcoming: payload.upcoming,
    }));
  } catch {
    // Ignore — quota or storage disabled.
  }
}

function applyPlatesPayload(payload, todayIso, todayIsWorkday, tomorrowIso) {
  if (todayIsWorkday) {
    if (payload.plate === null) {
      renderPlateMessage(todayPlate, "No plate has been announced for today. Please check back later.");
    } else {
      renderPlate(todayPlate, payload.plate, { priority: true });
    }
  }

  // The 15:00 canteen cutoff is real whenever tomorrow is a workday —
  // it's the deadline to order tomorrow's plate. It shows even when the
  // kitchen hasn't announced tomorrow's plate yet, because the deadline
  // is a property of the schedule, not of the plate.
  const showCountdown = isWorkdayIso(tomorrowIso);
  if (showCountdown) {
    startTomorrowCutoff();
  } else {
    hideTomorrowCutoff();
  }

  const hasAnyPlannedPlate = payload.upcoming.some((slot) => slot.plate !== null);

  // Hide the section only when there's nothing to show at all: no plates
  // AND no countdown. If the countdown is meaningful, keep the section
  // visible so the deadline is still communicated.
  if (!hasAnyPlannedPlate && !showCountdown) {
    if (upcomingSection) upcomingSection.hidden = true;
    return;
  }

  if (upcomingSection) upcomingSection.hidden = false;
  renderUpcomingRail(payload.upcoming);
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

async function loadTodayPlate() {
  const todayIso = todayInSouthAfrica();
  const todayIsWorkday = isWorkdayIso(todayIso);
  const tomorrowIso = addDaysIso(todayIso, 1);
  const tomorrowIsWorkday = isWorkdayIso(tomorrowIso);
  const bridgingWeekend = !tomorrowIsWorkday;

  if (todayPlateSection) todayPlateSection.hidden = !todayIsWorkday;

  if (upcomingNotice) {
    upcomingNotice.textContent = bridgingWeekend
      ? "Order a future plate the day before it's served at 15:00."
      : "Orders for tomorrow can be placed through the canteen until 15:00 today.";
  }
  if (upcomingTitle) {
    upcomingTitle.textContent = bridgingWeekend ? "Next week's plates" : "Tomorrow's Plate";
  }

  // ---- 1. Render whatever's cached for today, synchronously ----
  const cached = readPlatesCache(todayIso);
  if (cached) {
    applyPlatesPayload(cached, todayIso, todayIsWorkday, tomorrowIso);
  }

  // ---- 2. Refresh from the network ----
  try {
    const response = await fetch("/api/plates/today", {
      headers: { Accept: "application/json" },
    });
    const contentType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
    if (
      !response.ok ||
      (contentType !== "application/json" && !contentType?.endsWith("+json"))
    ) {
      throw new Error("Invalid plate response.");
    }
    const payload = await response.json();
    if (
      typeof payload !== "object" ||
      payload === null ||
      Array.isArray(payload) ||
      !Object.hasOwn(payload, "plate")
    ) {
      throw new Error("Invalid plate response.");
    }
    if (payload.plate !== null && !isValidPlate(payload.plate, todayIso)) {
      throw new Error("Invalid today's plate response.");
    }
    if (!Array.isArray(payload.upcoming) || !payload.upcoming.every(isValidUpcomingSlot)) {
      throw new Error("Invalid upcoming plates response.");
    }

    applyPlatesPayload(payload, todayIso, todayIsWorkday, tomorrowIso);
    writePlatesCache(todayIso, payload);
  } catch {
    // If we already rendered from cache, keep it. Otherwise, show the
    // unavailable state.
    if (cached) return;
    hideTomorrowCutoff();
    if (todayIsWorkday) {
      renderPlateMessage(todayPlate, "Today's plate is temporarily unavailable. Please try again later.");
    }
    if (upcomingSection) upcomingSection.hidden = false;
    renderPlateMessage(upcomingRail, "Upcoming plates are temporarily unavailable. Please try again later.");
    upcomingDots.replaceChildren();
    upcomingDots.hidden = true;
    updateArrows();
  }
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

if (upcomingPrev) {
  upcomingPrev.addEventListener("click", () => goToSlide(currentSlide - 1));
}
if (upcomingNext) {
  upcomingNext.addEventListener("click", () => goToSlide(currentSlide + 1));
}

loadTodayPlate();
loadMenu();
setTheme(document.documentElement.dataset.theme);
themeToggle.addEventListener("click", () => {
  const nextTheme =
    document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  localStorage.setItem("cottage44-theme", nextTheme);
  setTheme(nextTheme);
});
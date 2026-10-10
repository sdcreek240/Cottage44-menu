const categoryNav = document.querySelector("#category-nav");
const menuSections = document.querySelector("#menu-sections");
const themeToggle = document.querySelector(".theme-toggle");
const themeLabel = document.querySelector(".theme-toggle__label");
const todayPlate = document.querySelector("#today-plate");
const tomorrowPlate = document.querySelector("#tomorrow-plate");
const tomorrowCutoff = document.querySelector("#tomorrow-cutoff");
let tomorrowCutoffTimer = null;

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
  } catch {
    const status = document.createElement("p");
    status.className = "plate-day__status";
    status.setAttribute("role", "status");
    status.textContent = "Our menu is temporarily unavailable. Please try again later.";
    menuSections.replaceChildren(status);
  }
}

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

function isWorkdayInSouthAfrica(date = new Date()) {
  // getUTCDay(): 0 = Sunday, 1 = Monday, … 6 = Saturday
  const day = new Date(`${todayInSouthAfrica(date)}T00:00:00.000Z`).getUTCDay();
  return day >= 1 && day <= 5;
}//END_isWorkdayInSouthAfrica

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

function isValidServiceDate(value, expected = todayInSouthAfrica()) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value &&
    value === expected;
}

function isValidPlate(value, expectedDate = todayInSouthAfrica()) {
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

function isHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

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

function renderPlate(target, plate) {
  const article = document.createElement("article");
  article.className = "plate-card";

  const imageFrame = document.createElement("div");
  imageFrame.className = "plate-card__image-frame";
  if (plate.imageUrl) {
    const image = document.createElement("img");
    image.className = "plate-card__image";
    image.src = plate.imageUrl;
    image.alt = `Photo of ${plate.name}`;
    image.loading = "lazy";
    image.decoding = "async";
    image.fetchPriority = "low";
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

async function loadTodayPlate() {

  const todayIsWorkday = isWorkdayInSouthAfrica();
  const tomorrowIsWorkday = isWorkdayInSouthAfrica(
    new Date(Date.now() + 24 * 60 * 60 * 1000),
  );

  // Hide before loading
  todayPlate.closest(".plate-day").hidden = !todayIsWorkday;
  tomorrowPlate.closest(".plate-day").hidden = !tomorrowIsWorkday;

  if (!todayIsWorkday && !tomorrowIsWorkday) {
    hideTomorrowCutoff();
    return;
  }

  try {
    const response = await fetch("/api/plates/today", {
      headers: { Accept: "application/json" },
    });
    const contentType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
    if (
      !response.ok ||
      (contentType !== "application/json" && !contentType?.endsWith("+json"))
    ) {
      throw new Error("Invalid today's plate response.");
    }

    const payload = await response.json();
    if (
      typeof payload !== "object" ||
      payload === null ||
      Array.isArray(payload) ||
      !Object.hasOwn(payload, "plate")
    ) {
      throw new Error("Invalid today's plate response.");
    }

    if (payload.plate !== null && !isValidPlate(payload.plate)) {
      throw new Error("Invalid today's plate response.");
    }

    if (!todayIsWorkday){
      //Load nothing
    } else if (payload.plate === null) {
      renderPlateMessage(todayPlate, "No plate has been announced for today. Please check back later.");
    } else {
      renderPlate(todayPlate, payload.plate);
    }

    const tomorrow = new Date(`${todayInSouthAfrica()}T00:00:00.000Z`);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const tomorrowDate = tomorrow.toISOString().slice(0, 10);
    const nextPlate = payload.nextPlate ?? null;

    if (!tomorrowIsWorkday){
      //Load nothing
    } else if (nextPlate === null) {
      renderPlateMessage(tomorrowPlate, "Tomorrow's plate has not been announced yet.");
      hideTomorrowCutoff();
    } else if (!isValidPlate(nextPlate, tomorrowDate)) {
      throw new Error("Invalid tomorrow's plate response.");
    } else {
      renderPlate(tomorrowPlate, nextPlate);
      startTomorrowCutoff();
    }
  } catch {
    hideTomorrowCutoff();
    renderPlateMessage(todayPlate, "Today's plate is temporarily unavailable. Please try again later.");
    renderPlateMessage(tomorrowPlate, "Tomorrow's plate is temporarily unavailable. Please try again later.");
  }
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

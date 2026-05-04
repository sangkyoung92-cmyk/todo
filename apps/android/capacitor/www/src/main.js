import { createEmptyScheduleState } from "../shared/schedule-state.js";
import {
  addTask,
  deleteTask,
  editTask,
  toggleTaskSectionDone,
} from "../shared/tasks.js";
import {
  fromDateKey,
  getMonthGrid,
  getMonthLabel,
  getWeekDates,
  getWeekRangeLabel,
  isSameMonth,
  isToday,
  toDateKey,
  todayKey,
} from "../shared/date-utils.js";
import {
  formatNativeBridgeDiagnostics,
  getFirebaseAuthPluginFallback,
  waitForFirebaseAuthPlugin,
  waitForFirebasePlugins,
} from "./native-plugins.js";
import {
  buildWeatherInsights,
  fetchWeatherForecast,
  isWeatherForLocation,
  isWeatherFresh,
  readCachedWeather,
  writeCachedWeather,
} from "./weather.js";

let firebaseAuth = null;
let firestore = null;

const WEEKDAY_LABELS_KO = ["일", "월", "화", "수", "목", "금", "토"];
const LOCATION_STORAGE_KEY = "assistant_weather_location";
const cachedLocation = readCachedLocation();
const cachedWeather = readCachedWeather();

const els = {
  authButton: document.getElementById("auth-button"),
  authEmpty: document.getElementById("auth-empty"),
  bottomNav: document.getElementById("bottom-nav"),
  calendarGrid: document.getElementById("calendar-grid"),
  calendarLabel: document.getElementById("calendar-label"),
  calendarNext: document.getElementById("calendar-next"),
  calendarPrev: document.getElementById("calendar-prev"),
  contentShell: document.getElementById("content-shell"),
  deleteTaskBtn: document.getElementById("delete-task-btn"),
  editTaskDeadline: document.getElementById("edit-task-deadline"),
  editTaskDifficulty: document.getElementById("edit-task-difficulty"),
  editTaskId: document.getElementById("edit-task-id"),
  editTaskText: document.getElementById("edit-task-text"),
  fab: document.getElementById("fab"),
  modeButtons: document.querySelectorAll(".mode-btn"),
  modal: document.getElementById("task-modal"),
  navButtons: document.querySelectorAll(".bottom-nav__item"),
  quickAddForm: document.getElementById("quick-add-form"),
  taskEditForm: document.getElementById("task-edit-form"),
  todayDate: document.getElementById("today-date"),
  todayView: document.getElementById("today-view"),
  views: document.querySelectorAll(".view-panel"),
  voicePrimaryBtn: document.getElementById("voice-primary-btn"),
};

const appState = {
  activeView: "today",
  authBusy: false,
  briefing: null,
  briefingStatus: "idle",
  location: cachedLocation,
  rawDoc: {},
  state: createEmptyScheduleState(),
  uid: null,
  weather: isWeatherForLocation(cachedWeather, cachedLocation) ? cachedWeather : null,
  weatherStatus: getInitialWeatherStatus(cachedLocation, cachedWeather),
};

function helperBundle() {
  return {
    uid: () => crypto.randomUUID(),
    nowISO: () => new Date().toISOString(),
  };
}

async function connectFirebasePlugins() {
  if (firebaseAuth && firestore) return true;
  const plugins = await waitForFirebasePlugins();
  firebaseAuth = plugins.firebaseAuth;
  firestore = plugins.firestore;
  return true;
}

async function connectFirebaseAuthPlugin() {
  if (firebaseAuth) return true;
  const fallbackAuth = getFirebaseAuthPluginFallback();
  if (fallbackAuth) {
    firebaseAuth = fallbackAuth;
    return true;
  }
  const plugins = await waitForFirebaseAuthPlugin();
  firebaseAuth = plugins.firebaseAuth;
  return true;
}

async function ensurePlugins() {
  try {
    return await connectFirebasePlugins();
  } catch (error) {
    console.error(error);
    alert(
      "Android Firebase 플러그인을 아직 사용할 수 없습니다.\n"
        + `${error.message || error}\n`
        + formatNativeBridgeDiagnostics()
    );
    return false;
  }
}

async function ensurePluginsForLogin() {
  try {
    return await connectFirebaseAuthPlugin();
  } catch (error) {
    console.error(error);
    alert(
      "Android Firebase login is not ready yet.\n"
        + `${error.message || error}\n`
        + "Build: 20260502-native-plugin-header-guard\n\n"
        + formatNativeBridgeDiagnostics(["FirebaseAuthentication"])
    );
    return false;
  }
}

async function loadStateDocument(uid) {
  const { snapshot } = await firestore.getDocument({
    reference: `users/${uid}/data/state`,
  });
  const data = snapshot?.data || {};
  return {
    raw: data,
    schedule: {
      todos: normalizeTodos(data.todos || []),
      scheduleEntries: data.scheduleEntries || [],
      scheduleView: data.scheduleView || "week",
      scheduleWeekStart: data.scheduleWeekStart || toDateKey(new Date()),
      scheduleMonth: data.scheduleMonth || todayKey().slice(0, 7),
    },
  };
}

async function loadBriefing(uid) {
  appState.briefingStatus = "loading";
  renderToday();

  const date = todayKey();
  try {
    const endpointBriefing = await requestEndpointBriefing(uid, date).catch((error) => {
      console.warn("Configured briefing endpoint failed:", error);
      return null;
    });
    if (endpointBriefing) {
      appState.briefing = endpointBriefing;
      appState.briefingStatus = "ready";
      return;
    }

    const { snapshot } = await firestore.getDocument({
      reference: `users/${uid}/briefings/${date}`,
    });
    appState.briefing = snapshot?.data || null;
    appState.briefingStatus = appState.briefing ? "ready" : "fallback";
  } catch (error) {
    console.warn("Failed to load assistant briefing:", error);
    appState.briefing = null;
    appState.briefingStatus = "fallback";
  } finally {
    renderToday();
  }
}

async function requestEndpointBriefing(uid, date) {
  const endpoint = appState.rawDoc.assistantBriefingEndpoint;
  if (!endpoint || !appState.location) return null;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      uid,
      date,
      location: appState.location,
      weather: appState.weather,
      todos: appState.state.todos,
      scheduleEntries: appState.state.scheduleEntries,
    }),
  });

  if (!response.ok) throw new Error(`Briefing endpoint failed: ${response.status}`);
  return response.json();
}

async function saveStateDocument(uid) {
  const nextDoc = {
    ...appState.rawDoc,
    todos: appState.state.todos,
    scheduleEntries: appState.state.scheduleEntries,
    scheduleView: appState.state.scheduleView,
    scheduleWeekStart: appState.state.scheduleWeekStart,
    scheduleMonth: appState.state.scheduleMonth,
    updatedAt: new Date().toISOString(),
  };

  await firestore.setDocument({
    reference: `users/${uid}/data/state`,
    data: nextDoc,
    merge: true,
  });

  appState.rawDoc = nextDoc;
}

async function persist() {
  if (!appState.uid) return;
  await saveStateDocument(appState.uid);
}

function setActiveView(view) {
  appState.activeView = view;
  els.navButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
  });
  els.views.forEach((panel) => {
    panel.classList.toggle("hidden", panel.id !== `${view}-view`);
  });
  els.fab.classList.toggle("voice-fab--compact", view !== "today");
}

function normalizeTodos(todos) {
  return todos.map((todo) => {
    if (["상", "중", "하"].includes(todo.difficulty)) return todo;
    const difficulty = String(todo.difficulty || "중");
    if (difficulty.includes("상") || difficulty.includes("어려")) return { ...todo, difficulty: "상" };
    if (difficulty.includes("하") || difficulty.includes("간단")) return { ...todo, difficulty: "하" };
    return { ...todo, difficulty: "중" };
  });
}

function getTodosForDate(dateKey) {
  return appState.state.scheduleEntries
    .filter((entry) => entry.date === dateKey)
    .map((entry) => {
      const todo = appState.state.todos.find((item) => item.id === entry.todoId);
      return todo ? { entry, todo } : null;
    })
    .filter(Boolean);
}

function getTodayItems() {
  return getTodosForDate(todayKey()).sort(sortTodoEntries);
}

function getOverdueItems() {
  const today = todayKey();
  return appState.state.todos
    .filter((todo) => !todo.done && todo.deadline && todo.deadline < today)
    .sort((a, b) => a.deadline.localeCompare(b.deadline));
}

function getWeekItems() {
  const weekDates = getWeekDates(fromDateKey(appState.state.scheduleWeekStart));
  const seen = new Set();
  const items = [];

  weekDates.forEach((date) => {
    getTodosForDate(toDateKey(date)).forEach(({ todo, entry }) => {
      if (seen.has(todo.id)) return;
      seen.add(todo.id);
      items.push({ todo, entry });
    });
  });

  return items.sort(sortTodoEntries);
}

function sortTodoEntries(left, right) {
  const leftDone = left.entry?.done || left.todo.done;
  const rightDone = right.entry?.done || right.todo.done;
  if (leftDone !== rightDone) return leftDone ? 1 : -1;
  return difficultyRank(right.todo.difficulty) - difficultyRank(left.todo.difficulty)
    || (left.todo.deadline || "9999-99-99").localeCompare(right.todo.deadline || "9999-99-99");
}

function difficultyRank(value) {
  if (value === "상") return 3;
  if (value === "중") return 2;
  return 1;
}

function buildBriefing() {
  const server = appState.briefing;
  const todayItems = getTodayItems();
  const overdue = getOverdueItems();
  const fallback = buildLocalBriefing(todayItems, overdue);

  return {
    ...fallback,
    ...server,
    carryItems: uniqueList([...asList(server?.carryItems), ...fallback.carryItems]).slice(0, 6),
    scheduleWarnings: uniqueList([...asList(server?.scheduleWarnings), ...fallback.scheduleWarnings]).slice(0, 4),
    topPriorities: (asList(server?.topPriorities).length ? asList(server?.topPriorities) : fallback.topPriorities).slice(0, 3),
    suggestedOrder: (asList(server?.suggestedOrder).length ? asList(server?.suggestedOrder) : fallback.suggestedOrder).slice(0, 4),
  };
}

function buildLocalBriefing(todayItems, overdue) {
  const activeToday = todayItems.filter(({ entry, todo }) => !entry.done && !todo.done);
  const weather = buildWeatherInsights(appState.weather, appState.weatherStatus, Boolean(appState.location));
  const headline = activeToday.length
    ? `오늘은 ${activeToday.length}개의 일정 중 ${activeToday[0].todo.text}부터 처리하면 좋아요.`
    : "오늘 확정된 일정은 여유가 있어요. 미리 밀린 일을 정리하기 좋습니다.";

  const carryItems = weather.carryItems;
  const scheduleWarnings = [...weather.scheduleWarnings];
  if (overdue.length) scheduleWarnings.push(`마감이 지난 일이 ${overdue.length}개 있어요.`);
  if (activeToday.length >= 5) scheduleWarnings.push("오늘 일정이 많아 우선순위를 줄이는 게 좋아요.");

  return {
    headline,
    weatherSummary: weather.weatherSummary,
    carryItems,
    scheduleWarnings,
    topPriorities: activeToday.map(({ todo }) => todo.text),
    suggestedOrder: activeToday.map(({ todo }) => todo.text),
    updatedAt: new Date().toISOString(),
  };
}

function renderToday() {
  if (!els.todayView) return;
  const todayItems = getTodayItems();
  const activeToday = todayItems.filter(({ entry, todo }) => !entry.done && !todo.done);
  const briefing = buildBriefing();
  const locationLabel = appState.location ? "현재 위치 기준" : "위치 권한 전";

  els.todayDate.textContent = formatTodayLabel();
  els.todayView.innerHTML = `
    <section class="briefing-panel">
      <div class="briefing-meta">
        <span>${locationLabel}</span>
        <span>${formatBriefingStatus()}</span>
      </div>
      <h2>${escapeHtml(briefing.headline)}</h2>
      <p>${escapeHtml(briefing.weatherSummary || "날씨 브리핑을 준비하고 있어요.")}</p>
      ${renderLocationPrompt()}
    </section>

    <section class="carry-panel">
      <div class="section-heading compact-heading">
        <h2>챙길 것</h2>
        <p>${briefing.carryItems.length ? "오늘 상황 기준" : "날씨 연결 대기"}</p>
      </div>
      <div class="chip-row">
        ${renderCarryChips(briefing.carryItems)}
      </div>
      ${renderWarnings(briefing.scheduleWarnings)}
    </section>

    <section class="priority-panel">
      <div class="section-heading compact-heading">
        <h2>핵심 일정</h2>
        <p>${activeToday.length}개 남음</p>
      </div>
      ${renderPriorityItems(todayItems.slice(0, 3))}
    </section>

    <section class="all-tasks-panel">
      <div class="section-heading compact-heading">
        <h2>전체 일정</h2>
        <p>${todayItems.length}개</p>
      </div>
      ${renderTaskRows(todayItems, "today", "오늘 등록된 일정이 없어요. 음성으로 바로 추가해보세요.")}
    </section>
  `;

  bindActionButtons();
  document.getElementById("location-briefing-btn")?.addEventListener("click", () => {
    if (appState.location) {
      refreshWeatherForLocation({ force: true }).catch(console.error);
      return;
    }
    requestLocationForBriefing();
  });
}

function renderCarryChips(items) {
  if (!items.length) {
    const firstChip = appState.weatherStatus === "loading"
      ? "날씨 확인 중"
      : appState.location ? "날씨 대기" : "위치 허용";
    const secondChip = appState.location ? "날씨 새로고침" : "날씨 연결";
    return `
      <span class="carry-chip muted">${firstChip}</span>
      <span class="carry-chip muted">${secondChip}</span>
    `;
  }
  return items.map((item) => `<span class="carry-chip">${escapeHtml(item)}</span>`).join("");
}

function renderWarnings(warnings) {
  if (!warnings.length) return "";
  return `
    <div class="warning-list">
      ${warnings.map((warning) => `<div>${escapeHtml(warning)}</div>`).join("")}
    </div>
  `;
}

function renderLocationPrompt() {
  if (appState.weatherStatus === "loading") return "";
  if (!appState.location) {
    return `<button id="location-briefing-btn" class="secondary-btn" type="button">현재 위치로 날씨 브리핑 받기</button>`;
  }
  if (["failed", "stale"].includes(appState.weatherStatus)) {
    return `<button id="location-briefing-btn" class="secondary-btn" type="button">날씨 다시 받기</button>`;
  }
  return "";
}

function renderPriorityItems(items) {
  if (!items.length) {
    return `<div class="empty-panel compact"><p>오늘은 비어 있어요. 음성 버튼으로 빠르게 일정을 추가할 수 있습니다.</p></div>`;
  }
  return `
    <div class="priority-list">
      ${items.map(({ entry, todo }, index) => renderTaskRow({ entry, todo }, "today", index + 1)).join("")}
    </div>
  `;
}

function renderTaskRows(items, sectionKey, emptyCopy) {
  if (!items.length) return `<div class="empty-panel compact"><p>${emptyCopy}</p></div>`;
  return `<div class="task-list">${items.map((item) => renderTaskRow(item, sectionKey)).join("")}</div>`;
}

function renderTaskRow({ entry, todo }, sectionKey, order = null) {
  const done = entry.done || todo.done;
  return `
    <article class="task-row" data-task-id="${todo.id}">
      <button class="task-toggle ${done ? "is-done" : ""}" data-action="toggle-section" data-section="${sectionKey}" data-task-id="${todo.id}" aria-label="완료 전환"></button>
      <button class="task-row__body" data-action="edit" data-task-id="${todo.id}" type="button">
        <span class="task-row__title ${done ? "done" : ""}">${order ? `${order}. ` : ""}${escapeHtml(todo.text)}</span>
        <span class="task-row__meta">${formatDeadline(todo.deadline)} · ${escapeHtml(todo.difficulty || "중")}</span>
      </button>
    </article>
  `;
}

function renderCalendar() {
  els.modeButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === appState.state.scheduleView);
  });

  if (appState.state.scheduleView === "month") {
    const [year, month] = appState.state.scheduleMonth.split("-").map(Number);
    els.calendarLabel.textContent = getMonthLabel(year, month);
    els.calendarGrid.innerHTML = renderMonthGrid(year, month);
    return;
  }

  const weekDates = getWeekDates(fromDateKey(appState.state.scheduleWeekStart));
  els.calendarLabel.textContent = getWeekRangeLabel(weekDates);
  els.calendarGrid.innerHTML = renderWeekList(weekDates);
}

function renderMonthGrid(year, month) {
  const weeks = getMonthGrid(year, month);
  return `
    <div class="month-grid">
      <div class="calendar-weekdays">${WEEKDAY_LABELS_KO.map((label) => `<span>${label}</span>`).join("")}</div>
      ${weeks.flat().map((date) => {
        const dateKey = toDateKey(date);
        const items = getTodosForDate(dateKey);
        return `
          <div class="month-day ${isToday(dateKey) ? "today" : ""} ${!isSameMonth(date, year, month) ? "muted" : ""}">
            <strong>${date.getDate()}</strong>
            <span>${items.length ? `${items.length}개` : ""}</span>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderWeekList(weekDates) {
  return `
    <div class="week-list">
      ${weekDates.map((date, index) => {
        const dateKey = toDateKey(date);
        const items = getTodosForDate(dateKey);
        return `
          <section class="week-day ${isToday(dateKey) ? "today" : ""}">
            <div class="week-day__heading">
              <strong>${WEEKDAY_LABELS_KO[index]} ${date.getMonth() + 1}/${date.getDate()}</strong>
              <span>${items.length}개</span>
            </div>
            ${renderTaskRows(items, "week", "비어 있음")}
          </section>
        `;
      }).join("")}
    </div>
  `;
}

function renderAll() {
  renderToday();
  renderCalendar();
  setActiveView(appState.activeView);
}

function bindActionButtons() {
  document.querySelectorAll('[data-action="toggle-section"]').forEach((el) => {
    el.addEventListener("click", async () => {
      const todo = appState.state.todos.find((item) => item.id === el.dataset.taskId);
      const nextDone = !todo?.done;
      toggleTaskSectionDone(appState.state, el.dataset.taskId, el.dataset.section, nextDone, helperBundle());
      await persist();
      renderAll();
    });
  });

  document.querySelectorAll('[data-action="edit"]').forEach((el) => {
    el.addEventListener("click", () => openTaskModal(el.dataset.taskId));
  });
}

function openTaskModal(taskId) {
  const todo = appState.state.todos.find((item) => item.id === taskId);
  if (!todo) return;

  els.editTaskId.value = todo.id;
  els.editTaskText.value = todo.text;
  els.editTaskDeadline.value = todo.deadline || "";
  els.editTaskDifficulty.value = todo.difficulty || "중";
  els.modal.classList.remove("hidden");
  els.modal.setAttribute("aria-hidden", "false");
}

function closeTaskModal() {
  els.modal.classList.add("hidden");
  els.modal.setAttribute("aria-hidden", "true");
}

async function requestLocationForBriefing() {
  if (!navigator.geolocation) {
    appState.weatherStatus = "unavailable";
    renderToday();
    return;
  }

  appState.weatherStatus = "loading";
  renderToday();

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      appState.location = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        updatedAt: new Date().toISOString(),
      };
      appState.weatherStatus = "loading";
      localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(appState.location));
      renderToday();
      await refreshWeatherForLocation({ force: true });
      if (appState.uid) await loadBriefing(appState.uid);
    },
    (error) => {
      console.warn("Location permission failed:", error);
      appState.weatherStatus = "permission-denied";
      renderToday();
    },
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 1000 * 60 * 30 },
  );
}

async function refreshWeatherForLocation({ force = false } = {}) {
  if (!appState.location) {
    appState.weatherStatus = "permission-needed";
    renderToday();
    return null;
  }

  if (
    !force
    && appState.weather
    && isWeatherForLocation(appState.weather, appState.location)
    && isWeatherFresh(appState.weather)
  ) {
    appState.weatherStatus = "ready";
    renderToday();
    return appState.weather;
  }

  appState.weatherStatus = "loading";
  renderToday();

  try {
    const weather = await fetchWeatherForecast(appState.location);
    appState.weather = weather;
    appState.weatherStatus = "ready";
    writeCachedWeather(weather);
    return weather;
  } catch (error) {
    console.warn("Failed to load weather forecast:", error);
    appState.weatherStatus = appState.weather && isWeatherForLocation(appState.weather, appState.location)
      ? "stale"
      : "failed";
    return appState.weather;
  } finally {
    renderToday();
  }
}

async function loadForUser(uid) {
  if (!(await ensurePlugins())) return;
  const { raw, schedule } = await loadStateDocument(uid);
  appState.uid = uid;
  appState.rawDoc = raw;
  appState.state = schedule;
  els.authButton.textContent = "로그아웃";
  els.authEmpty.classList.add("hidden");
  els.contentShell.classList.remove("hidden");
  els.bottomNav.classList.remove("hidden");
  els.fab.classList.remove("hidden");
  renderAll();
  if (appState.location) {
    refreshWeatherForLocation().catch(console.error);
  }
  await loadBriefing(uid);
}

async function refreshCurrentUser() {
  const { user } = await firebaseAuth.getCurrentUser();
  if (!user) {
    appState.uid = null;
    appState.rawDoc = {};
    appState.state = createEmptyScheduleState();
    appState.briefing = null;
    els.authButton.textContent = "Google 로그인";
    els.authEmpty.classList.remove("hidden");
    els.contentShell.classList.add("hidden");
    els.bottomNav.classList.add("hidden");
    els.fab.classList.add("hidden");
    return;
  }

  await loadForUser(user.uid);
}

async function handleAuthClick() {
  if (appState.authBusy) return;

  appState.authBusy = true;
  const previousLabel = els.authButton.textContent;
  els.authButton.disabled = true;
  els.authButton.textContent = "Google login...";

  try {
    if (!(await ensurePluginsForLogin())) return;

    const { user } = await firebaseAuth.getCurrentUser();
    if (user) {
      await firebaseAuth.signOut();
      await refreshCurrentUser();
      return;
    }

    await firebaseAuth.signInWithGoogle({ useCredentialManager: false });
    await refreshCurrentUser();
  } finally {
    appState.authBusy = false;
    els.authButton.disabled = false;
    if (!appState.uid) els.authButton.textContent = previousLabel;
  }
}

els.authButton.addEventListener("click", () => {
  handleAuthClick().catch((error) => {
    console.error(error);
    if (String(error?.message || error).includes("12502")) {
      refreshCurrentUser().catch(console.error);
      return;
    }
    if (String(error?.message || error).includes("unable to find plugin")) {
      alert(
        `Android Firebase plugin call failed: ${error.message || error}\n`
          + formatNativeBridgeDiagnostics(["FirebaseAuthentication"])
      );
      return;
    }
    alert(`로그인 처리 중 오류가 발생했습니다: ${error.message || error}`);
  });
});

els.navButtons.forEach((button) => {
  button.addEventListener("click", () => setActiveView(button.dataset.view));
});

els.modeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    appState.state.scheduleView = button.dataset.mode;
    renderCalendar();
  });
});

els.calendarPrev.addEventListener("click", () => {
  if (appState.state.scheduleView === "month") {
    const [year, month] = appState.state.scheduleMonth.split("-").map(Number);
    const prevDate = new Date(year, month - 2, 1);
    appState.state.scheduleMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;
  } else {
    const prev = fromDateKey(appState.state.scheduleWeekStart);
    prev.setDate(prev.getDate() - 7);
    appState.state.scheduleWeekStart = toDateKey(prev);
  }
  renderCalendar();
});

els.calendarNext.addEventListener("click", () => {
  if (appState.state.scheduleView === "month") {
    const [year, month] = appState.state.scheduleMonth.split("-").map(Number);
    const nextDate = new Date(year, month, 1);
    appState.state.scheduleMonth = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, "0")}`;
  } else {
    const next = fromDateKey(appState.state.scheduleWeekStart);
    next.setDate(next.getDate() + 7);
    appState.state.scheduleWeekStart = toDateKey(next);
  }
  renderCalendar();
});

els.quickAddForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = document.getElementById("quick-add-text").value.trim();
  const deadline = document.getElementById("quick-add-deadline").value || null;
  const difficulty = document.getElementById("quick-add-difficulty").value;
  if (!text) return;

  addTask(appState.state, { text, deadline, difficulty }, helperBundle());
  await persist();
  els.quickAddForm.reset();
  setActiveView("today");
  renderAll();
});

els.fab.addEventListener("click", () => setActiveView("voice"));
els.voicePrimaryBtn.addEventListener("click", () => document.getElementById("quick-add-text")?.focus());

document.querySelectorAll('[data-close-modal="true"]').forEach((el) => {
  el.addEventListener("click", closeTaskModal);
});

els.taskEditForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  editTask(
    appState.state,
    els.editTaskId.value,
    {
      text: els.editTaskText.value,
      difficulty: els.editTaskDifficulty.value,
      deadline: els.editTaskDeadline.value || null,
    },
    helperBundle(),
  );
  await persist();
  closeTaskModal();
  renderAll();
});

els.deleteTaskBtn.addEventListener("click", async () => {
  deleteTask(appState.state, els.editTaskId.value);
  await persist();
  closeTaskModal();
  renderAll();
});

async function bootstrap() {
  els.todayDate.textContent = formatTodayLabel();
  if (!(await connectFirebaseAuthPlugin().catch((error) => {
    console.warn("Firebase auth plugin is not ready during bootstrap:", error);
    return false;
  }))) return;

  if (typeof firebaseAuth.addListener === "function") {
    await firebaseAuth.addListener("authStateChange", async () => {
      await refreshCurrentUser();
    });
  }

  await refreshCurrentUser();
}

bootstrap().catch((error) => {
  console.error(error);
  alert(`앱 초기화 중 오류가 발생했습니다: ${error.message || error}`);
});

function readCachedLocation() {
  try {
    return JSON.parse(localStorage.getItem(LOCATION_STORAGE_KEY) || "null");
  } catch {
    return null;
  }
}

function formatTodayLabel() {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date());
}

function formatBriefingStatus() {
  if (appState.briefingStatus === "loading") return "브리핑 생성 중";
  if (appState.briefingStatus === "ready") return "AI 브리핑";
  if (appState.weatherStatus === "loading") return "날씨 확인 중";
  if (appState.weatherStatus === "ready") return "날씨 브리핑";
  if (appState.weatherStatus === "stale") return "저장된 날씨";
  if (appState.weatherStatus === "failed") return "날씨 연결 실패";
  if (appState.weatherStatus === "permission-denied") return "위치 권한 꺼짐";
  return "로컬 브리핑";
}

function getInitialWeatherStatus(location, weather) {
  if (!location) return "permission-needed";
  if (!isWeatherForLocation(weather, location)) return "stale";
  return isWeatherFresh(weather) ? "ready" : "stale";
}

function formatDeadline(deadline) {
  if (!deadline) return "마감 없음";
  const [, month, day] = deadline.split("-");
  return `${Number(month)}/${Number(day)} 마감`;
}

function uniqueList(items) {
  return [...new Set(items.filter(Boolean).map((item) => String(item).trim()).filter(Boolean))];
}

function asList(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

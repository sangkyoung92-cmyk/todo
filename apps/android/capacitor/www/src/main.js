import { createEmptyScheduleState } from "../shared/schedule-state.js";
import {
  addTask,
  deleteTask,
  editTask,
  getTaskProgress,
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

const firebaseAuth = window.Capacitor?.Plugins?.FirebaseAuthentication;
const firestore = window.Capacitor?.Plugins?.FirebaseFirestore;

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAY_LABELS_KO = ["일", "월", "화", "수", "목", "금", "토"];

const els = {
  authButton: document.getElementById("auth-button"),
  authEmpty: document.getElementById("auth-empty"),
  contentShell: document.getElementById("content-shell"),
  fab: document.getElementById("fab"),
  views: document.querySelectorAll(".view-panel"),
  navButtons: document.querySelectorAll(".segmented-nav__item"),
  modeButtons: document.querySelectorAll(".mode-btn"),
  todayView: document.getElementById("today-view"),
  weekView: document.getElementById("week-view"),
  quickAddForm: document.getElementById("quick-add-form"),
  calendarPrev: document.getElementById("calendar-prev"),
  calendarNext: document.getElementById("calendar-next"),
  calendarLabel: document.getElementById("calendar-label"),
  calendarGrid: document.getElementById("calendar-grid"),
  modal: document.getElementById("task-modal"),
  taskEditForm: document.getElementById("task-edit-form"),
  editTaskId: document.getElementById("edit-task-id"),
  editTaskText: document.getElementById("edit-task-text"),
  editTaskDeadline: document.getElementById("edit-task-deadline"),
  editTaskDifficulty: document.getElementById("edit-task-difficulty"),
  deleteTaskBtn: document.getElementById("delete-task-btn"),
  heroTitle: document.getElementById("hero-title"),
  heroSubtitle: document.getElementById("hero-subtitle"),
  statToday: document.getElementById("stat-today"),
  statWeek: document.getElementById("stat-week"),
  statDone: document.getElementById("stat-done"),
};

const appState = {
  uid: null,
  activeView: "today",
  state: createEmptyScheduleState(),
  rawDoc: {},
  authBusy: false,
};

function helperBundle() {
  return {
    uid: () => crypto.randomUUID(),
    nowISO: () => new Date().toISOString(),
  };
}

function ensurePlugins() {
  if (firebaseAuth && firestore) return true;
  alert("이 화면은 Android Capacitor 앱에서 테스트해야 합니다. Android Studio로 실행해 주세요.");
  return false;
}

async function loadStateDocument(uid) {
  const { snapshot } = await firestore.getDocument({
    reference: `users/${uid}/data/state`,
  });
  const data = snapshot?.data || {};
  return {
    raw: data,
    schedule: {
      todos: data.todos || [],
      scheduleEntries: data.scheduleEntries || [],
      scheduleView: data.scheduleView || "week",
      scheduleWeekStart: data.scheduleWeekStart || toDateKey(new Date()),
      scheduleMonth: data.scheduleMonth || todayKey().slice(0, 7),
    },
  };
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
}

function formatDeadline(deadline) {
  if (!deadline) return "기한 없음";
  const [, month, day] = deadline.split("-");
  return `${parseInt(month, 10)}/${parseInt(day, 10)}`;
}

function difficultyBadge(difficulty) {
  const cls = difficulty === "상" ? "high" : difficulty === "하" ? "low" : "";
  return `<span class="badge ${cls}">${escapeHtml(difficulty || "중")}</span>`;
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
  return getTodosForDate(todayKey());
}

function getWeekTodos() {
  const weekDates = getWeekDates(fromDateKey(appState.state.scheduleWeekStart));
  const seen = new Set();
  const weekItems = [];

  weekDates.forEach((date) => {
    getTodosForDate(toDateKey(date)).forEach(({ todo, entry }) => {
      if (seen.has(todo.id)) return;
      seen.add(todo.id);
      weekItems.push({ todo, entry });
    });
  });

  return weekItems;
}

function renderHero() {
  const todayItems = getTodayItems();
  const weekItems = getWeekTodos();
  const doneCount = appState.state.scheduleEntries.filter((entry) => entry.done).length;

  els.statToday.textContent = String(todayItems.length);
  els.statWeek.textContent = String(weekItems.length);
  els.statDone.textContent = String(doneCount);

  if (!todayItems.length) {
    els.heroTitle.textContent = "오늘은 조금 여유로운 날";
    els.heroSubtitle.textContent = "급한 일정이 없다면 이번 주 할 일을 미리 정리해 두기 좋습니다.";
    return;
  }

  const firstTask = todayItems[0].todo.text;
  els.heroTitle.textContent = `오늘은 ${todayItems.length}개의 일정`;
  els.heroSubtitle.textContent = `${firstTask}${todayItems.length > 1 ? " 포함" : ""} 일정이 준비되어 있습니다.`;
}

function renderTaskCards(items, sectionKey, emptyCopy) {
  if (!items.length) {
    return `<div class="state-card"><p class="empty-copy">${emptyCopy}</p></div>`;
  }

  return `
    <div class="task-list">
      ${items
        .map((todo) => {
          const progress = getTaskProgress(appState.state, todo.id);
          return `
            <article class="task-card" data-task-id="${todo.id}">
              <div class="task-card__row">
                <div class="task-card__main">
                  <button class="task-toggle ${todo.done ? "is-done" : ""}" data-action="toggle-section" data-section="${sectionKey}" data-task-id="${todo.id}" aria-label="완료 토글"></button>
                  <div>
                    <span class="task-card__title ${todo.done ? "done" : ""}">${escapeHtml(todo.text)}</span>
                    <div class="task-card__subtitle">${todo.deadline ? `기한 ${formatDeadline(todo.deadline)}` : "언제든 진행 가능"}</div>
                  </div>
                </div>
                <div class="task-card__actions">
                  <button class="ghost-btn" data-action="edit" data-task-id="${todo.id}">수정</button>
                </div>
              </div>
              <div class="task-card__meta">
                <div class="task-card__meta-group">
                  ${difficultyBadge(todo.difficulty)}
                  <span class="badge">${todo.done ? "완료됨" : "진행 중"}</span>
                </div>
                <span class="task-card__progress">${progress.total ? `${progress.done}/${progress.total}` : "단일 일정"}</span>
              </div>
            </article>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderToday() {
  const todayItems = getTodayItems().map(({ todo }) => todo);
  els.todayView.innerHTML = `
    <div class="view-heading">
      <div>
        <h2>오늘</h2>
        <p>${todayItems.length}개의 일정이 잡혀 있습니다.</p>
      </div>
    </div>
    ${renderTaskCards(todayItems, "today", "오늘 등록된 일정이 없습니다. 빠른 추가에서 바로 만들어보세요.")}
  `;
}

function renderWeek() {
  const weekDates = getWeekDates(fromDateKey(appState.state.scheduleWeekStart));
  const seen = new Set();
  const weekItems = [];

  weekDates.forEach((date) => {
    getTodosForDate(toDateKey(date)).forEach(({ todo }) => {
      if (seen.has(todo.id)) return;
      seen.add(todo.id);
      weekItems.push(todo);
    });
  });

  els.weekView.innerHTML = `
    <div class="view-heading">
      <div>
        <h2>이번 주</h2>
        <p>${getWeekRangeLabel(weekDates)}</p>
      </div>
    </div>
    ${renderTaskCards(weekItems, "week", "이번 주 일정이 아직 없습니다.")}
  `;
}

function renderMonthGrid(year, month) {
  const weeks = getMonthGrid(year, month);
  return `
    <div class="calendar-grid-shell">
      <div class="calendar-weekdays">
        ${WEEKDAY_LABELS_KO.map((label) => `<span>${label}</span>`).join("")}
      </div>
      <div class="month-grid">
        ${weeks
          .map(
            (week) => `
              <div class="month-grid__row">
                ${week
                  .map((date) => {
                    const dateKey = toDateKey(date);
                    const items = getTodosForDate(dateKey);
                    return `
                      <article class="calendar-day ${isToday(dateKey) ? "calendar-day--today" : ""} ${!isSameMonth(date, year, month) ? "calendar-day--muted" : ""}">
                        <div class="calendar-day__top">
                          <span class="calendar-day__date">${date.getDate()}일</span>
                          <span class="calendar-day__count">${items.length}개</span>
                        </div>
                        <div class="calendar-day__items">
                          ${items
                            .slice(0, 3)
                            .map(
                              ({ entry, todo }) => `
                                <div class="calendar-entry ${entry.done ? "is-done" : ""}">
                                  <span class="calendar-dot"></span>
                                  <span>${escapeHtml(todo.text)}</span>
                                </div>
                              `,
                            )
                            .join("")}
                          ${items.length > 3 ? `<div class="calendar-more">+${items.length - 3} more</div>` : ""}
                        </div>
                      </article>
                    `;
                  })
                  .join("")}
              </div>
            `,
          )
          .join("")}
      </div>
    </div>
  `;
}

function renderWeekGrid(weekDates) {
  return `
    <div class="week-grid">
      ${weekDates
        .map((date, index) => {
          const dateKey = toDateKey(date);
          const items = getTodosForDate(dateKey);
          return `
            <article class="week-card ${isToday(dateKey) ? "week-card--today" : ""}">
              <div class="week-card__top">
                <div class="week-card__day">
                  <span class="week-card__label">${WEEKDAY_LABELS[index]}</span>
                  <strong class="week-card__date">${date.getMonth() + 1}/${date.getDate()}</strong>
                </div>
                <span class="week-card__count">${items.length}개</span>
              </div>
              <div class="week-card__list">
                ${
                  items.length
                    ? items
                        .slice(0, 4)
                        .map(
                          ({ entry, todo }) => `
                            <div class="week-card__item ${entry.done ? "is-done" : ""}">
                              <span class="calendar-dot"></span>
                              <span>${escapeHtml(todo.text)}</span>
                            </div>
                          `,
                        )
                        .join("")
                    : `<p class="empty-copy">비어 있음</p>`
                }
              </div>
            </article>
          `;
        })
        .join("")}
    </div>
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
  els.calendarGrid.innerHTML = renderWeekGrid(weekDates);
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

function renderAll() {
  renderHero();
  renderToday();
  renderWeek();
  renderCalendar();
  setActiveView(appState.activeView);
  bindActionButtons();
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

async function loadForUser(uid) {
  const { raw, schedule } = await loadStateDocument(uid);
  appState.uid = uid;
  appState.rawDoc = raw;
  appState.state = schedule;
  els.authButton.textContent = "로그아웃";
  els.authEmpty.classList.add("hidden");
  els.contentShell.classList.remove("hidden");
  els.fab.classList.remove("hidden");
  renderAll();
}

async function refreshCurrentUser() {
  const { user } = await firebaseAuth.getCurrentUser();
  if (!user) {
    appState.uid = null;
    appState.rawDoc = {};
    appState.state = createEmptyScheduleState();
    els.authButton.textContent = "Google 로그인";
    els.authEmpty.classList.remove("hidden");
    els.contentShell.classList.add("hidden");
    els.fab.classList.add("hidden");
    return;
  }

  await loadForUser(user.uid);
}

async function handleAuthClick() {
  if (!ensurePlugins()) return;
  if (appState.authBusy) return;

  appState.authBusy = true;
  els.authButton.disabled = true;

  try {
    const { user } = await firebaseAuth.getCurrentUser();
    if (user) {
      await firebaseAuth.signOut();
      await refreshCurrentUser();
      return;
    }

    await firebaseAuth.signInWithGoogle({
      useCredentialManager: false,
    });
    await refreshCurrentUser();
  } finally {
    appState.authBusy = false;
    els.authButton.disabled = false;
  }
}

els.authButton.addEventListener("click", () => {
  handleAuthClick().catch((error) => {
    console.error(error);
    if (String(error?.message || error).includes("12502")) {
      refreshCurrentUser().catch(console.error);
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

els.fab.addEventListener("click", () => setActiveView("quick-add"));

document.querySelectorAll('[data-close-modal="true"]').forEach((el) => {
  el.addEventListener("click", closeTaskModal);
});

els.taskEditForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const taskId = els.editTaskId.value;
  editTask(
    appState.state,
    taskId,
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
  const taskId = els.editTaskId.value;
  deleteTask(appState.state, taskId);
  await persist();
  closeTaskModal();
  renderAll();
});

async function bootstrap() {
  if (!ensurePlugins()) return;

  await firebaseAuth.addListener("authStateChange", async () => {
    await refreshCurrentUser();
  });

  await refreshCurrentUser();
}

bootstrap().catch((error) => {
  console.error(error);
  alert(`앱 초기화 중 오류가 발생했습니다: ${error.message || error}`);
});

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

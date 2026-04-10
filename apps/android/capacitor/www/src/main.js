import { createEmptyScheduleState } from '../shared/schedule-state.js';
import {
  addTask,
  deleteTask,
  editTask,
  getTaskProgress,
  toggleTaskSectionDone,
} from '../shared/tasks.js';
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
} from '../shared/date-utils.js';

const firebaseAuth = window.Capacitor?.Plugins?.FirebaseAuthentication;
const firestore = window.Capacitor?.Plugins?.FirebaseFirestore;

const els = {
  authButton: document.getElementById('auth-button'),
  authEmpty: document.getElementById('auth-empty'),
  contentShell: document.getElementById('content-shell'),
  fab: document.getElementById('fab'),
  views: document.querySelectorAll('.view-panel'),
  navButtons: document.querySelectorAll('.segmented-nav__item'),
  modeButtons: document.querySelectorAll('.mode-btn'),
  todayView: document.getElementById('today-view'),
  weekView: document.getElementById('week-view'),
  quickAddForm: document.getElementById('quick-add-form'),
  calendarPrev: document.getElementById('calendar-prev'),
  calendarNext: document.getElementById('calendar-next'),
  calendarLabel: document.getElementById('calendar-label'),
  calendarGrid: document.getElementById('calendar-grid'),
  modal: document.getElementById('task-modal'),
  taskEditForm: document.getElementById('task-edit-form'),
  editTaskId: document.getElementById('edit-task-id'),
  editTaskText: document.getElementById('edit-task-text'),
  editTaskDeadline: document.getElementById('edit-task-deadline'),
  editTaskDifficulty: document.getElementById('edit-task-difficulty'),
  deleteTaskBtn: document.getElementById('delete-task-btn'),
};

const appState = {
  uid: null,
  activeView: 'today',
  state: createEmptyScheduleState(),
  rawDoc: {},
};

function helperBundle() {
  return {
    uid: () => crypto.randomUUID(),
    nowISO: () => new Date().toISOString(),
  };
}

function ensurePlugins() {
  if (firebaseAuth && firestore) return true;
  alert('이 화면은 Android Capacitor 앱에서 테스트해야 합니다. Android Studio로 실행해 주세요.');
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
      scheduleView: data.scheduleView || 'week',
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
    button.classList.toggle('active', button.dataset.view === view);
  });
  els.views.forEach((panel) => {
    panel.classList.toggle('hidden', panel.id !== `${view}-view`);
  });
}

function formatDeadline(deadline) {
  if (!deadline) return '기한 없음';
  const [, month, day] = deadline.split('-');
  return `${parseInt(month, 10)}/${parseInt(day, 10)}`;
}

function difficultyBadge(difficulty) {
  const cls = difficulty === '상' ? 'high' : difficulty === '하' ? 'low' : '';
  return `<span class="badge ${cls}">${difficulty || '중'}</span>`;
}

function renderTaskCards(items, sectionKey) {
  if (!items.length) {
    return '<div class="state-card"><p class="empty-copy">표시할 일정이 없습니다.</p></div>';
  }

  return `<div class="task-list">${items.map((todo) => {
    const progress = getTaskProgress(appState.state, todo.id);
    return `
      <article class="task-card" data-task-id="${todo.id}">
        <div class="task-card__row">
          <label class="task-card__row">
            <input class="task-card__checkbox" type="checkbox" data-action="toggle-section" data-section="${sectionKey}" data-task-id="${todo.id}" ${todo.done ? 'checked' : ''} />
            <span class="task-card__title ${todo.done ? 'done' : ''}">${escapeHtml(todo.text)}</span>
          </label>
          <div class="task-card__actions">
            <button class="ghost-btn" data-action="edit" data-task-id="${todo.id}">수정</button>
          </div>
        </div>
        <div class="task-card__meta">
          <div>
            ${difficultyBadge(todo.difficulty)}
            <span class="badge">기한 ${formatDeadline(todo.deadline)}</span>
          </div>
          <span>${progress.total ? `${progress.done}/${progress.total}` : '단일 일정'}</span>
        </div>
      </article>
    `;
  }).join('')}</div>`;
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

function renderToday() {
  const todayItems = getTodosForDate(todayKey()).map(({ todo }) => todo);
  els.todayView.innerHTML = `
    <div class="view-heading">
      <div>
        <h2>오늘</h2>
        <p>${todayItems.length}개의 일정</p>
      </div>
    </div>
    ${renderTaskCards(todayItems, 'today')}
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
    ${renderTaskCards(weekItems, 'week')}
  `;
}

function renderCalendar() {
  els.modeButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.mode === appState.state.scheduleView);
  });

  if (appState.state.scheduleView === 'month') {
    const [year, month] = appState.state.scheduleMonth.split('-').map(Number);
    els.calendarLabel.textContent = getMonthLabel(year, month);
    const weeks = getMonthGrid(year, month);
    els.calendarGrid.className = 'month-grid';
    els.calendarGrid.innerHTML = weeks.map((week) => `
      <div class="calendar-grid">
        ${week.map((date) => {
          const dateKey = toDateKey(date);
          const items = getTodosForDate(dateKey);
          return `
            <article class="calendar-cell ${isToday(dateKey) ? 'calendar-cell--today' : ''} ${!isSameMonth(date, year, month) ? 'calendar-cell--muted' : ''}">
              <div class="calendar-cell__date">
                <span>${date.getDate()}일</span>
                <span>${items.length}개</span>
              </div>
              ${items.slice(0, 3).map(({ entry, todo }) => `
                <div class="calendar-chip ${entry.done ? 'done' : ''}">
                  <strong>${escapeHtml(todo.text)}</strong>
                </div>
              `).join('')}
            </article>
          `;
        }).join('')}
      </div>
    `).join('');
    return;
  }

  const weekDates = getWeekDates(fromDateKey(appState.state.scheduleWeekStart));
  els.calendarLabel.textContent = getWeekRangeLabel(weekDates);
  els.calendarGrid.className = 'calendar-grid';
  els.calendarGrid.innerHTML = weekDates.map((date) => {
    const dateKey = toDateKey(date);
    const items = getTodosForDate(dateKey);
    return `
      <article class="calendar-cell ${isToday(dateKey) ? 'calendar-cell--today' : ''}">
        <div class="calendar-cell__date">
          <span>${date.getMonth() + 1}/${date.getDate()}</span>
          <span>${items.length}개</span>
        </div>
        ${items.length ? items.map(({ entry, todo }) => `
          <div class="calendar-chip ${entry.done ? 'done' : ''}">
            <strong>${escapeHtml(todo.text)}</strong>
          </div>
        `).join('') : '<p class="empty-copy">비어 있음</p>'}
      </article>
    `;
  }).join('');
}

function renderAll() {
  renderToday();
  renderWeek();
  renderCalendar();
  setActiveView(appState.activeView);
  bindActionButtons();
}

function bindActionButtons() {
  document.querySelectorAll('[data-action="toggle-section"]').forEach((el) => {
    el.addEventListener('change', async () => {
      toggleTaskSectionDone(appState.state, el.dataset.taskId, el.dataset.section, el.checked, helperBundle());
      await persist();
      renderAll();
    });
  });

  document.querySelectorAll('[data-action="edit"]').forEach((el) => {
    el.addEventListener('click', () => openTaskModal(el.dataset.taskId));
  });
}

function openTaskModal(taskId) {
  const todo = appState.state.todos.find((item) => item.id === taskId);
  if (!todo) return;

  els.editTaskId.value = todo.id;
  els.editTaskText.value = todo.text;
  els.editTaskDeadline.value = todo.deadline || '';
  els.editTaskDifficulty.value = todo.difficulty || '중';
  els.modal.classList.remove('hidden');
  els.modal.setAttribute('aria-hidden', 'false');
}

function closeTaskModal() {
  els.modal.classList.add('hidden');
  els.modal.setAttribute('aria-hidden', 'true');
}

async function loadForUser(uid) {
  const { raw, schedule } = await loadStateDocument(uid);
  appState.uid = uid;
  appState.rawDoc = raw;
  appState.state = schedule;
  els.authButton.textContent = '로그아웃';
  els.authEmpty.classList.add('hidden');
  els.contentShell.classList.remove('hidden');
  els.fab.classList.remove('hidden');
  renderAll();
}

async function refreshCurrentUser() {
  const { user } = await firebaseAuth.getCurrentUser();
  if (!user) {
    appState.uid = null;
    appState.rawDoc = {};
    appState.state = createEmptyScheduleState();
    els.authButton.textContent = 'Google 로그인';
    els.authEmpty.classList.remove('hidden');
    els.contentShell.classList.add('hidden');
    els.fab.classList.add('hidden');
    return;
  }

  await loadForUser(user.uid);
}

async function handleAuthClick() {
  if (!ensurePlugins()) return;

  const { user } = await firebaseAuth.getCurrentUser();
  if (user) {
    await firebaseAuth.signOut();
    await refreshCurrentUser();
    return;
  }

  await firebaseAuth.signInWithGoogle();
  await refreshCurrentUser();
}

els.authButton.addEventListener('click', () => {
  handleAuthClick().catch((error) => {
    console.error(error);
    alert(`로그인 처리 중 오류가 발생했습니다: ${error.message || error}`);
  });
});

els.navButtons.forEach((button) => {
  button.addEventListener('click', () => setActiveView(button.dataset.view));
});

els.modeButtons.forEach((button) => {
  button.addEventListener('click', () => {
    appState.state.scheduleView = button.dataset.mode;
    renderCalendar();
  });
});

els.calendarPrev.addEventListener('click', () => {
  if (appState.state.scheduleView === 'month') {
    const [year, month] = appState.state.scheduleMonth.split('-').map(Number);
    const prevDate = new Date(year, month - 2, 1);
    appState.state.scheduleMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
  } else {
    const prev = fromDateKey(appState.state.scheduleWeekStart);
    prev.setDate(prev.getDate() - 7);
    appState.state.scheduleWeekStart = toDateKey(prev);
  }
  renderCalendar();
});

els.calendarNext.addEventListener('click', () => {
  if (appState.state.scheduleView === 'month') {
    const [year, month] = appState.state.scheduleMonth.split('-').map(Number);
    const nextDate = new Date(year, month, 1);
    appState.state.scheduleMonth = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`;
  } else {
    const next = fromDateKey(appState.state.scheduleWeekStart);
    next.setDate(next.getDate() + 7);
    appState.state.scheduleWeekStart = toDateKey(next);
  }
  renderCalendar();
});

els.quickAddForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const text = document.getElementById('quick-add-text').value.trim();
  const deadline = document.getElementById('quick-add-deadline').value || null;
  const difficulty = document.getElementById('quick-add-difficulty').value;
  if (!text) return;

  addTask(appState.state, { text, deadline, difficulty }, helperBundle());
  await persist();
  els.quickAddForm.reset();
  setActiveView('today');
  renderAll();
});

els.fab.addEventListener('click', () => setActiveView('quick-add'));

document.querySelectorAll('[data-close-modal="true"]').forEach((el) => {
  el.addEventListener('click', closeTaskModal);
});

els.taskEditForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const taskId = els.editTaskId.value;
  editTask(appState.state, taskId, {
    text: els.editTaskText.value,
    difficulty: els.editTaskDifficulty.value,
    deadline: els.editTaskDeadline.value || null,
  }, helperBundle());
  await persist();
  closeTaskModal();
  renderAll();
});

els.deleteTaskBtn.addEventListener('click', async () => {
  const taskId = els.editTaskId.value;
  deleteTask(appState.state, taskId);
  await persist();
  closeTaskModal();
  renderAll();
});

async function bootstrap() {
  if (!ensurePlugins()) return;

  await firebaseAuth.addListener('authStateChange', async () => {
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
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

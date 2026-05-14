const WIDTH_STORAGE_KEY = 'todo_panel_widths_v2';

const NOTES_PAGE_WIDTH = { min: 120, fallback: 290 };
const NOTES_TODO_WIDTH = { min: 160, fallback: 340 };
const SCHEDULE_SIDEBAR_WIDTH = { min: 160, fallback: 320 };
const MIN_MAIN_WIDTH = 260;
const HIT_AREA = 8;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function readSavedWidths() {
  try {
    return JSON.parse(localStorage.getItem(WIDTH_STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveWidth(key, width) {
  localStorage.setItem(WIDTH_STORAGE_KEY, JSON.stringify({
    ...readSavedWidths(),
    [key]: Math.round(width),
  }));
}

function getGap(containerEl) {
  const style = getComputedStyle(containerEl);
  const value = Number.parseFloat(style.columnGap || style.gap);
  return Number.isFinite(value) ? value : 0;
}

function getPaddingX(containerEl) {
  const style = getComputedStyle(containerEl);
  return (Number.parseFloat(style.paddingLeft) || 0) + (Number.parseFloat(style.paddingRight) || 0);
}

function getPanelWidth(panelEl, fallback) {
  const width = panelEl?.getBoundingClientRect().width;
  return Number.isFinite(width) && width > 0 ? width : fallback;
}

function setCssWidth(containerEl, key, width) {
  containerEl.style.setProperty(key, `${Math.round(width)}px`);
}

function getMaxWidth(containerEl, otherFixedWidth = 0) {
  const rect = containerEl.getBoundingClientRect();
  return rect.width - getPaddingX(containerEl) - getGap(containerEl) * 2 - otherFixedWidth - MIN_MAIN_WIDTH;
}

function isDesktopLayout(containerEl) {
  const rect = containerEl.getBoundingClientRect();
  return rect.width > 900 && !window.matchMedia('(max-width: 768px)').matches;
}

function isVisible(panelEl) {
  const rect = panelEl.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 && getComputedStyle(panelEl).display !== 'none';
}

function isNearBoundary(leftPanelEl, rightPanelEl, event) {
  const leftRect = leftPanelEl.getBoundingClientRect();
  const rightRect = rightPanelEl.getBoundingClientRect();
  return event.clientX >= leftRect.right - HIT_AREA && event.clientX <= rightRect.left + HIT_AREA;
}

function getBoundaryAtPointer(containerEl, boundaries, event) {
  if (!isDesktopLayout(containerEl)) return null;

  const containerRect = containerEl.getBoundingClientRect();
  if (event.clientY < containerRect.top || event.clientY > containerRect.bottom) return null;

  return boundaries.find((boundary) => {
    if (!boundary.isEnabled()) return false;
    if (!isVisible(boundary.leftPanelEl) || !isVisible(boundary.rightPanelEl)) return false;
    return isNearBoundary(boundary.leftPanelEl, boundary.rightPanelEl, event);
  }) || null;
}

function initPanelResize(containerEl, boundaries) {
  if (!containerEl || !boundaries.length) return;

  const saved = readSavedWidths();
  boundaries.forEach((boundary) => {
    if (Number.isFinite(saved[boundary.storageKey])) {
      setCssWidth(containerEl, boundary.cssProperty, saved[boundary.storageKey]);
    }
  });

  let drag = null;

  containerEl.addEventListener('pointermove', (event) => {
    if (drag) return;
    const boundary = getBoundaryAtPointer(containerEl, boundaries, event);
    containerEl.classList.toggle('is-panel-resize-ready', !!boundary);
  });

  containerEl.addEventListener('pointerleave', () => {
    if (!drag) containerEl.classList.remove('is-panel-resize-ready');
  });

  containerEl.addEventListener('pointerdown', (event) => {
    const boundary = getBoundaryAtPointer(containerEl, boundaries, event);
    if (!boundary) return;

    event.preventDefault();
    drag = {
      boundary,
      startX: event.clientX,
      startWidth: getPanelWidth(boundary.resizedPanelEl, boundary.fallbackWidth),
    };
    document.body.classList.add('is-panel-resizing');
  });

  window.addEventListener('pointermove', (event) => {
    if (!drag) return;

    const { boundary } = drag;
    const deltaX = event.clientX - drag.startX;
    const otherFixedWidth = boundary.getOtherFixedWidth?.() || 0;
    const maxWidth = getMaxWidth(containerEl, otherFixedWidth);
    const nextWidth = clamp(
      boundary.getWidthFromDelta(drag.startWidth, deltaX),
      boundary.minWidth,
      maxWidth,
    );

    setCssWidth(containerEl, boundary.cssProperty, nextWidth);
    saveWidth(boundary.storageKey, nextWidth);
  });

  function stopDrag() {
    if (!drag) return;
    drag = null;
    document.body.classList.remove('is-panel-resizing');
    containerEl.classList.remove('is-panel-resize-ready');
  }

  window.addEventListener('pointerup', stopDrag);
  window.addEventListener('pointercancel', stopDrag);
}

export function initNotesPanelResize(layoutEl) {
  if (!layoutEl) return;

  const pagesPanelEl = layoutEl.querySelector('.pages-panel');
  const editorPanelEl = layoutEl.querySelector('.editor-panel');
  const todoPanelEl = layoutEl.querySelector('.todo-panel');
  if (!pagesPanelEl || !editorPanelEl || !todoPanelEl) return;

  initPanelResize(layoutEl, [
    {
      leftPanelEl: pagesPanelEl,
      rightPanelEl: editorPanelEl,
      resizedPanelEl: pagesPanelEl,
      cssProperty: '--notes-pages-width',
      storageKey: 'notesPages',
      minWidth: NOTES_PAGE_WIDTH.min,
      fallbackWidth: NOTES_PAGE_WIDTH.fallback,
      getWidthFromDelta: (startWidth, deltaX) => startWidth + deltaX,
      getOtherFixedWidth: () => getPanelWidth(todoPanelEl, NOTES_TODO_WIDTH.fallback),
      isEnabled: () => true,
    },
    {
      leftPanelEl: editorPanelEl,
      rightPanelEl: todoPanelEl,
      resizedPanelEl: todoPanelEl,
      cssProperty: '--notes-todo-width',
      storageKey: 'notesTodo',
      minWidth: NOTES_TODO_WIDTH.min,
      fallbackWidth: NOTES_TODO_WIDTH.fallback,
      getWidthFromDelta: (startWidth, deltaX) => startWidth - deltaX,
      getOtherFixedWidth: () => getPanelWidth(pagesPanelEl, NOTES_PAGE_WIDTH.fallback),
      isEnabled: () => !todoPanelEl.classList.contains('collapsed'),
    },
  ]);
}

export function initSchedulePanelResize(workspaceEl) {
  if (!workspaceEl) return;

  const sidebarEl = workspaceEl.querySelector('.schedule-sidebar');
  const calendarEl = workspaceEl.querySelector('.schedule-calendar-area');
  const dayNotePanelEl = workspaceEl.querySelector('.schedule-day-note-panel');
  if (!sidebarEl || !calendarEl) return;

  initPanelResize(workspaceEl, [
    {
      leftPanelEl: sidebarEl,
      rightPanelEl: calendarEl,
      resizedPanelEl: sidebarEl,
      cssProperty: '--schedule-sidebar-width',
      storageKey: 'scheduleSidebar',
      minWidth: SCHEDULE_SIDEBAR_WIDTH.min,
      fallbackWidth: SCHEDULE_SIDEBAR_WIDTH.fallback,
      getWidthFromDelta: (startWidth, deltaX) => startWidth + deltaX,
      getOtherFixedWidth: () => dayNotePanelEl && isVisible(dayNotePanelEl) ? getPanelWidth(dayNotePanelEl, 280) : 0,
      isEnabled: () => true,
    },
  ]);
}

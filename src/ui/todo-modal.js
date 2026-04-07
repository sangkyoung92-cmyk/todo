const DIFFICULTY_COLORS = { '상': '#e74c3c', '중': '#e67e22', '하': '#27ae60' };

const overlayEl = document.getElementById('todo-modal-overlay');
const modalEl = document.getElementById('todo-modal');
const textInput = document.getElementById('todo-modal-text');
const projectInput = document.getElementById('todo-modal-project');
const deadlineInput = document.getElementById('todo-modal-deadline');
const diffBtns = document.querySelectorAll('.todo-modal-diff-btn');
const submitBtn = document.getElementById('todo-modal-submit');
const cancelBtn = document.getElementById('todo-modal-cancel');

let selectedDifficulty = '중';
let resolvePromise = null;

function setDifficulty(diff) {
  selectedDifficulty = diff;
  diffBtns.forEach((btn) => {
    const isActive = btn.dataset.diff === diff;
    btn.classList.toggle('active', isActive);
    btn.style.background = isActive ? DIFFICULTY_COLORS[diff] : '';
    btn.style.color = isActive ? '#fff' : '';
    btn.style.borderColor = isActive ? DIFFICULTY_COLORS[diff] : '';
  });
}

function open() {
  textInput.value = '';
  projectInput.value = '';
  deadlineInput.value = '';
  setDifficulty('중');
  overlayEl.classList.add('open');
  modalEl.classList.add('open');
  setTimeout(() => textInput.focus(), 50);
}

function close(result) {
  overlayEl.classList.remove('open');
  modalEl.classList.remove('open');
  if (resolvePromise) {
    resolvePromise(result);
    resolvePromise = null;
  }
}

function submit() {
  const text = textInput.value.trim();
  if (!text) {
    textInput.focus();
    return;
  }
  close({
    text,
    project: projectInput.value.trim() || null,
    difficulty: selectedDifficulty,
    deadline: deadlineInput.value || null,
  });
}

diffBtns.forEach((btn) => {
  btn.addEventListener('click', () => setDifficulty(btn.dataset.diff));
});

submitBtn.addEventListener('click', submit);
cancelBtn.addEventListener('click', () => close(null));
overlayEl.addEventListener('click', () => close(null));

textInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); submit(); }
  if (e.key === 'Escape') { e.preventDefault(); close(null); }
});

modalEl.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { e.preventDefault(); close(null); }
});

/**
 * 할 일 추가 모달을 열고 결과를 반환한다.
 * @returns {Promise<{ text: string, project: string|null, difficulty: string, deadline: string|null } | null>}
 */
export function showAddTodoModal() {
  return new Promise((resolve) => {
    resolvePromise = resolve;
    open();
  });
}

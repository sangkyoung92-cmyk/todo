/**
 * 스케줄 업무 추가 모달
 */

const overlay = document.getElementById('schedule-modal-overlay');
const modal = document.getElementById('schedule-modal');
const cancelBtn = document.getElementById('schedule-modal-cancel');
const submitBtn = document.getElementById('schedule-modal-submit');
const textInput = document.getElementById('schedule-modal-text');
const deadlineInput = document.getElementById('schedule-modal-deadline');
const diffBtns = modal.querySelectorAll('.todo-modal-diff-btn');

let resolveFn = null;
let selectedDiff = '중';

function setDiff(diff) {
  selectedDiff = diff;
  diffBtns.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.diff === diff);
  });
}

diffBtns.forEach((btn) => {
  btn.addEventListener('click', () => setDiff(btn.dataset.diff));
});

function openModal(defaults = {}) {
  textInput.value = defaults.text || '';
  deadlineInput.value = defaults.deadline || '';
  setDiff(defaults.difficulty || '중');
  overlay.classList.add('open');
  modal.classList.add('open');
  setTimeout(() => textInput.focus(), 50);
}

function closeModal(result = null) {
  overlay.classList.remove('open');
  modal.classList.remove('open');
  if (resolveFn) {
    resolveFn(result);
    resolveFn = null;
  }
}

cancelBtn.addEventListener('click', () => closeModal(null));
overlay.addEventListener('click', () => closeModal(null));

submitBtn.addEventListener('click', () => {
  const text = textInput.value.trim();
  if (!text) {
    textInput.focus();
    return;
  }
  closeModal({
    text,
    deadline: deadlineInput.value || null,
    difficulty: selectedDiff,
  });
});

textInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') submitBtn.click();
  if (e.key === 'Escape') closeModal(null);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && modal.classList.contains('open')) {
    closeModal(null);
  }
});

/**
 * 업무 추가 모달을 열고 결과를 반환한다
 * @returns {Promise<{text, deadline, difficulty}|null>}
 */
export function showScheduleModal(defaults = {}) {
  return new Promise((resolve) => {
    resolveFn = resolve;
    openModal(defaults);
  });
}

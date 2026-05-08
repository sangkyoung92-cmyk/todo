import {
  configureDateTextInput,
  readDateInputValue,
  setDateInputValue,
} from '../utils/date-input.js';

const overlay = document.getElementById('schedule-modal-overlay');
const modal = document.getElementById('schedule-modal');
const cancelBtn = document.getElementById('schedule-modal-cancel');
const submitBtn = document.getElementById('schedule-modal-submit');
const textInput = document.getElementById('schedule-modal-text');
const deadlineInput = document.getElementById('schedule-modal-deadline');
const titleEl = modal.querySelector('.todo-modal-header h3');
const diffBtns = modal.querySelectorAll('.todo-modal-diff-btn');

let resolveFn = null;
let selectedDiff = '\uC911';

function setDiff(diff) {
  selectedDiff = diff;
  diffBtns.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.diff === diff);
  });
}

function openModal(defaults = {}) {
  const hasPrefilledText = typeof defaults.text === 'string' && defaults.text.trim().length > 0;
  const modalTitle = defaults.title || (hasPrefilledText ? '\uC5C5\uBB34 \uC218\uC815' : '\uC5C5\uBB34 \uCD94\uAC00');
  const submitLabel = defaults.submitLabel || (hasPrefilledText ? '\uC800\uC7A5' : '\uCD94\uAC00');

  textInput.value = defaults.text || '';
  setDateInputValue(deadlineInput, defaults.deadline || '');
  titleEl.textContent = modalTitle;
  submitBtn.textContent = submitLabel;
  modal.setAttribute('aria-label', modalTitle);
  setDiff(defaults.difficulty || '\uC911');
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

function submit() {
  const text = textInput.value.trim();
  const deadline = readDateInputValue(deadlineInput, { allowEmpty: true, report: true });

  if (!text) {
    textInput.focus();
    return;
  }

  if (deadline === undefined) {
    deadlineInput.focus();
    return;
  }

  closeModal({
    text,
    deadline,
    difficulty: selectedDiff,
  });
}

diffBtns.forEach((btn) => {
  btn.addEventListener('click', () => setDiff(btn.dataset.diff));
});

configureDateTextInput(deadlineInput);

cancelBtn.addEventListener('click', () => closeModal(null));
overlay.addEventListener('click', () => closeModal(null));
submitBtn.addEventListener('click', submit);

textInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    submit();
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    closeModal(null);
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && modal.classList.contains('open')) {
    closeModal(null);
  }
});

export function showScheduleModal(defaults = {}) {
  return new Promise((resolve) => {
    resolveFn = resolve;
    openModal(defaults);
  });
}

import {
  configureDateTextInput,
  readDateInputValue,
  setDateInputValue,
} from '../utils/date-input.js';

const DIFFICULTY_COLORS = {
  '\uC0C1': '#e74c3c',
  '\uC911': '#e67e22',
  '\uD558': '#27ae60',
};

const overlayEl = document.getElementById('todo-modal-overlay');
const modalEl = document.getElementById('todo-modal');
const projectInput = document.getElementById('todo-modal-project');
const textInput = document.getElementById('todo-modal-text');
const deadlineInput = document.getElementById('todo-modal-deadline');
const descriptionInput = document.getElementById('todo-modal-description');
const diffBtns = modalEl.querySelectorAll('.todo-modal-diff-btn');
const submitBtn = document.getElementById('todo-modal-submit');
const cancelBtn = document.getElementById('todo-modal-cancel');

let selectedDifficulty = '\uC911';
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
  projectInput.value = '';
  textInput.value = '';
  descriptionInput.value = '';
  setDateInputValue(deadlineInput, '');
  setDifficulty('\uC911');
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
  const deadline = readDateInputValue(deadlineInput, { allowEmpty: true, report: true });

  if (!text) {
    textInput.focus();
    return;
  }

  if (deadline === undefined) {
    deadlineInput.focus();
    return;
  }

  close({
    projectName: projectInput.value.trim(),
    text,
    difficulty: selectedDifficulty,
    deadline,
    description: descriptionInput.value.trim(),
  });
}

diffBtns.forEach((btn) => {
  btn.addEventListener('click', () => setDifficulty(btn.dataset.diff));
});

configureDateTextInput(deadlineInput);

submitBtn.addEventListener('click', submit);
cancelBtn.addEventListener('click', () => close(null));
overlayEl.addEventListener('click', () => close(null));

textInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    submit();
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    close(null);
  }
});

descriptionInput.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    close(null);
  }
});

modalEl.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    close(null);
  }
});

export function showAddTodoModal() {
  return new Promise((resolve) => {
    resolvePromise = resolve;
    open();
  });
}

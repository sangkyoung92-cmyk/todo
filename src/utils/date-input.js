const FULL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const DEFAULT_MIN = '1900-01-01';
const DEFAULT_MAX = '2100-12-31';

function stripToDigits(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 8);
}

function formatDateDigits(digits) {
  if (!digits) return '';
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

function parseDateKey(dateKey) {
  if (!FULL_DATE_PATTERN.test(dateKey)) return null;

  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

export function isDateKeyValid(dateKey, options = {}) {
  const min = options.min || DEFAULT_MIN;
  const max = options.max || DEFAULT_MAX;

  if (!parseDateKey(dateKey)) return false;
  if (min && dateKey < min) return false;
  if (max && dateKey > max) return false;
  return true;
}

function setValidity(input, message = '') {
  input.setCustomValidity(message);
}

function getInvalidMessage(min, max) {
  return `\uB0A0\uC9DC\uB97C YYYY-MM-DD \uD615\uC2DD\uC73C\uB85C \uC785\uB825\uD574 \uC8FC\uC138\uC694. (${min} ~ ${max})`;
}

export function setDateInputValue(input, value) {
  if (!input) return;
  input.value = formatDateDigits(stripToDigits(value));
  setValidity(input, '');
}

export function configureDateTextInput(input, options = {}) {
  if (!input) return;

  input.type = 'text';
  input.inputMode = 'numeric';
  input.autocomplete = 'off';
  input.placeholder = options.placeholder || 'YYYY-MM-DD';
  input.maxLength = 10;

  if (options.value !== undefined) {
    setDateInputValue(input, options.value);
  }

  if (input.dataset.dateTextInputReady === 'true') {
    return;
  }

  input.dataset.dateTextInputReady = 'true';

  ensureDatePickerButton(input, { min: options.min, max: options.max });

  input.addEventListener('input', () => {
    const nextValue = formatDateDigits(stripToDigits(input.value));
    if (input.value !== nextValue) {
      input.value = nextValue;
    }
    setValidity(input, '');
  });

  input.addEventListener('blur', () => {
    const nextValue = readDateInputValue(input, {
      allowEmpty: options.allowEmpty !== false,
      min: options.min,
      max: options.max,
      report: false,
    });

    if (nextValue === undefined) return;
    input.value = nextValue || '';
  });
}

function ensureDatePickerButton(input, options = {}) {
  if (input.dataset.datePickerEnhanced === 'true') return;
  input.dataset.datePickerEnhanced = 'true';

  const wrapper = document.createElement('div');
  wrapper.className = 'date-input-combo';
  input.parentNode.insertBefore(wrapper, input);
  wrapper.appendChild(input);

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'date-picker-btn';
  button.title = '달력 열기';
  button.setAttribute('aria-label', '달력 열기');
  button.innerHTML = '<svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M6 2a1 1 0 011 1v1h6V3a1 1 0 112 0v1h1a2 2 0 012 2v9a3 3 0 01-3 3H5a3 3 0 01-3-3V6a2 2 0 012-2h1V3a1 1 0 011-1zm10 7H4v6a1 1 0 001 1h10a1 1 0 001-1V9zM5 6a1 1 0 00-1 1h12a1 1 0 00-1-1H5z"/></svg>';

  const picker = document.createElement('input');
  picker.type = 'date';
  picker.className = 'date-picker-native';
  picker.tabIndex = -1;
  picker.setAttribute('aria-hidden', 'true');
  picker.min = options.min || DEFAULT_MIN;
  picker.max = options.max || DEFAULT_MAX;

  const syncPickerValue = () => {
    const dateKey = readDateInputValue(input, {
      allowEmpty: true,
      min: picker.min,
      max: picker.max,
      report: false,
    });
    picker.value = dateKey || '';
  };

  button.addEventListener('click', () => {
    syncPickerValue();
    if (typeof picker.showPicker === 'function') {
      picker.showPicker();
      return;
    }
    picker.click();
  });

  picker.addEventListener('change', () => {
    setDateInputValue(input, picker.value || '');
    input.dispatchEvent(new CustomEvent('dateinput:pick', {
      bubbles: true,
      detail: { value: picker.value || null },
    }));
  });

  wrapper.appendChild(button);
  wrapper.appendChild(picker);
}

export function readDateInputValue(input, options = {}) {
  if (!input) return null;

  const allowEmpty = options.allowEmpty !== false;
  const min = options.min || DEFAULT_MIN;
  const max = options.max || DEFAULT_MAX;
  const digits = stripToDigits(input.value);

  if (!digits.length) {
    if (allowEmpty) {
      setValidity(input, '');
      return null;
    }

    setValidity(input, getInvalidMessage(min, max));
    if (options.report) input.reportValidity();
    return undefined;
  }

  if (digits.length !== 8) {
    setValidity(input, getInvalidMessage(min, max));
    if (options.report) input.reportValidity();
    return undefined;
  }

  const dateKey = formatDateDigits(digits);
  if (!isDateKeyValid(dateKey, { min, max })) {
    setValidity(input, getInvalidMessage(min, max));
    if (options.report) input.reportValidity();
    return undefined;
  }

  input.value = dateKey;
  setValidity(input, '');
  return dateKey;
}

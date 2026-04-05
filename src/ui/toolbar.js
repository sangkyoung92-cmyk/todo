import { contentEl, fontColorEl, fontFamilyEl, fontSizeEl, toolbarEl } from './dom.js';

function runCommand(command, value = null) {
  contentEl.focus();
  document.execCommand(command, false, value);
}

export function initializeToolbar() {
  toolbarEl.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-cmd]');
    if (!button) {
      return;
    }

    const cmd = button.dataset.cmd;
    runCommand(cmd);
  });

  fontFamilyEl.addEventListener('change', () => {
    runCommand('fontName', fontFamilyEl.value);
  });

  fontSizeEl.addEventListener('change', () => {
    runCommand('fontSize', fontSizeEl.value);
  });

  fontColorEl.addEventListener('change', () => {
    runCommand('foreColor', fontColorEl.value);
  });
}

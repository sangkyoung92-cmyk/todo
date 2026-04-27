const WAVEFORM_BAR_COUNT = 32;

function formatRecordingTime(seconds) {
  const safeSeconds = Math.max(0, Math.floor(seconds || 0));
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

function createWaveformBars(waveformEl) {
  if (!waveformEl) return [];

  waveformEl.innerHTML = '';
  return Array.from({ length: WAVEFORM_BAR_COUNT }, () => {
    const bar = document.createElement('span');
    bar.className = 'recording-waveform-bar';
    bar.style.setProperty('--bar-scale', '0.12');
    waveformEl.appendChild(bar);
    return bar;
  });
}

export function createRecordingPanel({
  panelEl,
  statusEl,
  waveformEl,
  timerEl,
  stopBtn,
} = {}) {
  const bars = createWaveformBars(waveformEl);

  function setVisible(isVisible) {
    if (panelEl) panelEl.hidden = !isVisible;
  }

  function reset() {
    setVisible(false);
    if (statusEl) statusEl.textContent = '녹음 중';
    if (timerEl) timerEl.textContent = '00:00';
    bars.forEach((bar) => bar.style.setProperty('--bar-scale', '0.12'));
  }

  function setRecording(isRecording) {
    setVisible(isRecording);
    if (statusEl) statusEl.textContent = isRecording ? '녹음 중' : '녹음 정리 중';
  }

  function setBusy(message) {
    setVisible(true);
    if (statusEl) statusEl.textContent = message;
  }

  function updateMeter({ elapsedSeconds = 0, levels = [] } = {}) {
    if (timerEl) timerEl.textContent = formatRecordingTime(elapsedSeconds);
    if (!levels.length) return;

    bars.forEach((bar, index) => {
      const level = levels[index % levels.length] || 0;
      const scale = Math.min(1, Math.max(0.08, level));
      bar.style.setProperty('--bar-scale', scale.toFixed(2));
    });
  }

  function onStop(handler) {
    stopBtn?.addEventListener('click', handler);
  }

  reset();

  return {
    reset,
    setRecording,
    setBusy,
    updateMeter,
    onStop,
  };
}

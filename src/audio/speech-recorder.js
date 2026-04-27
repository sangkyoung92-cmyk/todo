export function createSpeechRecorder({
  onTranscript,
  onStateChange,
  onMeter,
  onStopComplete,
  onError,
} = {}) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    return {
      isSupported: false,
      isRecording: () => false,
      start: () => onError?.(new Error('SPEECH_RECOGNITION_UNSUPPORTED')),
      stop: () => {},
    };
  }

  let recognition = null;
  let recording = false;
  let stopNotifyTimer = null;
  let startedAt = 0;
  let meterStream = null;
  let audioContext = null;
  let analyser = null;
  let animationFrameId = null;
  let levels = Array(32).fill(0.12);

  function setRecording(nextRecording) {
    recording = nextRecording;
    onStateChange?.(recording);
  }

  function stopMeter() {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
    meterStream?.getTracks().forEach((track) => track.stop());
    meterStream = null;
    audioContext?.close?.();
    audioContext = null;
    analyser = null;
  }

  async function startMeter() {
    if (!navigator.mediaDevices?.getUserMedia) return;

    meterStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 128;
    analyser.smoothingTimeConstant = 0.7;

    const source = audioContext.createMediaStreamSource(meterStream);
    source.connect(analyser);

    const bins = new Uint8Array(analyser.frequencyBinCount);
    const renderMeter = () => {
      if (!analyser) return;

      analyser.getByteFrequencyData(bins);
      levels = levels.slice(1);
      const average = bins.reduce((sum, value) => sum + value, 0) / bins.length / 255;
      levels.push(Math.min(1, Math.max(0.08, average * 2.8)));

      onMeter?.({
        elapsedSeconds: (Date.now() - startedAt) / 1000,
        levels,
      });

      animationFrameId = requestAnimationFrame(renderMeter);
    };

    animationFrameId = requestAnimationFrame(renderMeter);
  }

  function scheduleStopComplete() {
    if (stopNotifyTimer) clearTimeout(stopNotifyTimer);
    stopNotifyTimer = setTimeout(() => {
      stopNotifyTimer = null;
      onStopComplete?.();
    }, 700);
  }

  async function start() {
    if (recording) return;

    startedAt = Date.now();
    levels = Array(32).fill(0.12);
    recognition = new SpeechRecognition();
    recognition.lang = 'ko-KR';
    recognition.continuous = true;
    recognition.interimResults = false;

    recognition.onstart = () => setRecording(true);
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .slice(event.resultIndex)
        .filter((result) => result.isFinal)
        .map((result) => result[0]?.transcript || '')
        .join(' ')
        .trim();
      if (transcript) onTranscript?.(transcript);
    };
    recognition.onerror = (event) => {
      setRecording(false);
      recognition = null;
      if (stopNotifyTimer) clearTimeout(stopNotifyTimer);
      stopNotifyTimer = null;
      stopMeter();
      onError?.(new Error(event.error || 'SPEECH_RECOGNITION_ERROR'));
    };
    recognition.onend = () => {
      setRecording(false);
      recognition = null;
      stopMeter();
    };

    try {
      await startMeter();
      recognition.start();
    } catch (err) {
      setRecording(false);
      stopMeter();
      onError?.(err);
    }
  }

  function stop() {
    if (!recording || !recognition) return;
    recognition?.stop();
    setRecording(false);
    stopMeter();
    scheduleStopComplete();
  }

  return {
    isSupported: true,
    isRecording: () => recording,
    start,
    stop,
  };
}

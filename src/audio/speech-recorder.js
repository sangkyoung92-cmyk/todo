export function createSpeechRecorder({ onTranscript, onStateChange, onError } = {}) {
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
  let stopRequested = false;

  function setRecording(nextRecording) {
    recording = nextRecording;
    onStateChange?.(recording);
  }

  function start() {
    if (recording) return;

    stopRequested = false;
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
      onError?.(new Error(event.error || 'SPEECH_RECOGNITION_ERROR'));
    };
    recognition.onend = () => {
      setRecording(false);
      if (!stopRequested) recognition = null;
    };

    try {
      recognition.start();
    } catch (err) {
      setRecording(false);
      onError?.(err);
    }
  }

  function stop() {
    stopRequested = true;
    recognition?.stop();
    setRecording(false);
  }

  return {
    isSupported: true,
    isRecording: () => recording,
    start,
    stop,
  };
}

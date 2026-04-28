import { getApiKey } from '../ai/extract.js';
import { transcribeAudioWithAI } from '../ai/transcription.js';

const TARGET_SAMPLE_RATE = 16000;

export function createSpeechRecorder({
  onTranscript,
  onStateChange,
  onMeter,
  onStopComplete,
  onError,
  onProcessingChange,
} = {}) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const supportsAudioCapture = Boolean(navigator.mediaDevices?.getUserMedia);

  if (!supportsAudioCapture) {
    return {
      isSupported: false,
      isRecording: () => false,
      isBusy: () => false,
      start: () => onError?.(new Error('AUDIO_RECORDING_UNSUPPORTED')),
      stop: () => {},
    };
  }

  let recognition = null;
  let recording = false;
  let processing = false;
  let restartTimer = null;
  let stopRequested = false;
  let startedAt = 0;
  let meterStream = null;
  let audioContext = null;
  let analyser = null;
  let sourceNode = null;
  let processorNode = null;
  let silentGainNode = null;
  let animationFrameId = null;
  let resumeOnVisible = null;
  let pcmChunks = [];
  let liveTranscriptReceived = false;
  let visibilityInterrupted = false;
  let levels = Array(32).fill(0.12);

  function setRecording(nextRecording) {
    recording = nextRecording;
    onStateChange?.(recording);
  }

  function setProcessing(nextProcessing) {
    processing = nextProcessing;
    onProcessingChange?.(processing);
  }

  function clearRestartTimer() {
    if (restartTimer) clearTimeout(restartTimer);
    restartTimer = null;
  }

  function clearVisibilityResume() {
    if (resumeOnVisible) {
      document.removeEventListener('visibilitychange', resumeOnVisible);
      resumeOnVisible = null;
    }
  }

  function cleanupAudioGraph() {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    animationFrameId = null;

    if (processorNode) {
      processorNode.onaudioprocess = null;
      processorNode.disconnect();
      processorNode = null;
    }
    sourceNode?.disconnect();
    sourceNode = null;
    analyser?.disconnect();
    analyser = null;
    silentGainNode?.disconnect();
    silentGainNode = null;

    meterStream?.getTracks().forEach((track) => track.stop());
    meterStream = null;

    audioContext?.close?.();
    audioContext = null;
  }

  function scheduleRecognitionRestart() {
    if (stopRequested || !recording || !SpeechRecognition) return;
    clearRestartTimer();
    clearVisibilityResume();

    if (document.hidden) {
      visibilityInterrupted = true;
      resumeOnVisible = () => {
        if (document.hidden) return;
        clearVisibilityResume();
        scheduleRecognitionRestart();
      };
      document.addEventListener('visibilitychange', resumeOnVisible);
      return;
    }

    restartTimer = setTimeout(() => {
      restartTimer = null;
      if (!stopRequested && recording) startRecognition();
    }, 600);
  }

  async function startCapture() {
    meterStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        noiseSuppression: true,
        echoCancellation: true,
      },
    });

    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    sourceNode = audioContext.createMediaStreamSource(meterStream);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 128;
    analyser.smoothingTimeConstant = 0.7;

    processorNode = audioContext.createScriptProcessor(4096, 1, 1);
    processorNode.onaudioprocess = (event) => {
      if (!recording || stopRequested) return;
      const input = event.inputBuffer.getChannelData(0);
      pcmChunks.push(new Float32Array(input));
    };

    silentGainNode = audioContext.createGain();
    silentGainNode.gain.value = 0;

    sourceNode.connect(analyser);
    sourceNode.connect(processorNode);
    processorNode.connect(silentGainNode);
    silentGainNode.connect(audioContext.destination);

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

  function startRecognition() {
    if (!SpeechRecognition || stopRequested) return;

    recognition = new SpeechRecognition();
    recognition.lang = 'ko-KR';
    recognition.continuous = true;
    recognition.interimResults = false;

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .slice(event.resultIndex)
        .filter((result) => result.isFinal)
        .map((result) => result[0]?.transcript || '')
        .join(' ')
        .trim();
      if (transcript) {
        liveTranscriptReceived = true;
        onTranscript?.(transcript);
      }
    };
    recognition.onerror = (event) => {
      const error = event.error || 'SPEECH_RECOGNITION_ERROR';
      recognition = null;
      if ((error === 'no-speech' || error === 'network') && !stopRequested) {
        if (error === 'network') visibilityInterrupted = true;
        scheduleRecognitionRestart();
        return;
      }
      if (error === 'aborted' && stopRequested) return;
      onError?.(new Error(error));
    };
    recognition.onend = () => {
      recognition = null;
      if (!stopRequested && recording) {
        scheduleRecognitionRestart();
      }
    };

    try {
      recognition.start();
    } catch (err) {
      recognition = null;
      if (!stopRequested) onError?.(err);
    }
  }

  function stopRecognition() {
    clearRestartTimer();
    clearVisibilityResume();
    try {
      recognition?.stop();
    } catch {
      // Ignore stop races from the browser speech engine.
    }
    recognition = null;
  }

  async function finalizeRecording() {
    const sampleRate = audioContext?.sampleRate || TARGET_SAMPLE_RATE;
    const wavBlob = encodeWavFromFloat32Chunks(pcmChunks, sampleRate, TARGET_SAMPLE_RATE);
    const canUseAiTranscript = Boolean(getApiKey());
    const shouldUseAiTranscript = canUseAiTranscript && (!liveTranscriptReceived || visibilityInterrupted);

    cleanupAudioGraph();
    pcmChunks = [];

    if (shouldUseAiTranscript) {
      try {
        const transcript = await transcribeAudioWithAI(wavBlob);
        onTranscript?.(transcript, { replace: true });
      } catch (err) {
        onError?.(err);
      }
    }
  }

  async function start() {
    if (recording || processing) return;

    stopRequested = false;
    startedAt = Date.now();
    levels = Array(32).fill(0.12);
    pcmChunks = [];
    liveTranscriptReceived = false;
    visibilityInterrupted = false;

    try {
      await startCapture();
      setRecording(true);
      startRecognition();
    } catch (err) {
      setRecording(false);
      cleanupAudioGraph();
      onError?.(err);
    }
  }

  function stop() {
    if (!recording || processing) return;

    stopRequested = true;
    stopRecognition();
    setRecording(false);
    setProcessing(true);

    finalizeRecording()
      .catch((err) => onError?.(err))
      .finally(() => {
        setProcessing(false);
        onStopComplete?.();
      });
  }

  return {
    isSupported: true,
    isRecording: () => recording,
    isBusy: () => processing,
    start,
    stop,
  };
}

function encodeWavFromFloat32Chunks(chunks, inputSampleRate, outputSampleRate) {
  const merged = mergeFloat32Chunks(chunks);
  const downsampled = downsampleBuffer(merged, inputSampleRate, outputSampleRate);
  const wavBuffer = createWavBuffer(downsampled, outputSampleRate);
  return new Blob([wavBuffer], { type: 'audio/wav' });
}

function mergeFloat32Chunks(chunks) {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Float32Array(totalLength);
  let offset = 0;
  chunks.forEach((chunk) => {
    merged.set(chunk, offset);
    offset += chunk.length;
  });
  return merged;
}

function downsampleBuffer(buffer, inputSampleRate, outputSampleRate) {
  if (!buffer.length) return new Float32Array(0);
  if (outputSampleRate >= inputSampleRate) return buffer;

  const sampleRateRatio = inputSampleRate / outputSampleRate;
  const newLength = Math.round(buffer.length / sampleRateRatio);
  const result = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;

  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
    let accum = 0;
    let count = 0;

    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i += 1) {
      accum += buffer[i];
      count += 1;
    }

    result[offsetResult] = count ? accum / count : 0;
    offsetResult += 1;
    offsetBuffer = nextOffsetBuffer;
  }

  return result;
}

function createWavBuffer(samples, sampleRate) {
  const bytesPerSample = 2;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  floatTo16BitPcm(view, 44, samples);
  return buffer;
}

function floatTo16BitPcm(view, offset, input) {
  for (let i = 0; i < input.length; i += 1, offset += 2) {
    const sample = Math.max(-1, Math.min(1, input[i]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
  }
}

function writeAscii(view, offset, text) {
  for (let i = 0; i < text.length; i += 1) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}

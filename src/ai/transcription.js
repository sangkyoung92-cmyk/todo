import { getApiKey } from './extract.js';

const GEMINI_MODEL = 'gemini-2.5-flash';
const INLINE_UPLOAD_LIMIT = 18 * 1024 * 1024;

export async function transcribeAudioWithAI(audioBlob) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('API_KEY_MISSING');
  if (!audioBlob || !audioBlob.size) throw new Error('오디오 데이터가 비어 있습니다.');

  let response;
  try {
    response = audioBlob.size <= INLINE_UPLOAD_LIMIT
      ? await requestInlineTranscription(apiKey, audioBlob)
      : await requestUploadedTranscription(apiKey, audioBlob);
  } catch (err) {
    throw new Error(`네트워크 오류: ${err.message}`);
  }

  if (!response.ok) {
    if (response.status === 400 || response.status === 403) {
      throw new Error('API_KEY_INVALID');
    }
    if (response.status === 413) {
      throw new Error('AUDIO_TOO_LARGE');
    }
    if (response.status === 503) {
      throw new Error('API_OVERLOADED');
    }
    const body = await response.text().catch(() => '');
    throw new Error(`API 오류 ${response.status}: ${body.slice(0, 120)}`);
  }

  const data = await response.json();
  const transcript = extractTranscriptText(data);
  if (!transcript) throw new Error('TRANSCRIPT_EMPTY');
  return transcript;
}

async function requestInlineTranscription(apiKey, audioBlob) {
  const base64Audio = await blobToBase64(audioBlob);
  return fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: buildTranscriptPrompt() },
            {
              inline_data: {
                mime_type: audioBlob.type || 'audio/wav',
                data: base64Audio,
              },
            },
          ],
        }],
        generationConfig: { maxOutputTokens: 8192, temperature: 0.1 },
      }),
    },
  );
}

async function requestUploadedTranscription(apiKey, audioBlob) {
  const uploadStart = await fetch('https://generativelanguage.googleapis.com/upload/v1beta/files', {
    method: 'POST',
    headers: {
      'x-goog-api-key': apiKey,
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(audioBlob.size),
      'X-Goog-Upload-Header-Content-Type': audioBlob.type || 'audio/wav',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      file: {
        display_name: `recording-${Date.now()}.wav`,
      },
    }),
  });

  if (!uploadStart.ok) return uploadStart;

  const uploadUrl = uploadStart.headers.get('x-goog-upload-url');
  if (!uploadUrl) throw new Error('파일 업로드 URL을 받지 못했습니다.');

  const uploadFinish = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Length': String(audioBlob.size),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
    },
    body: audioBlob,
  });

  if (!uploadFinish.ok) return uploadFinish;

  const uploadData = await uploadFinish.json();
  const fileUri = uploadData?.file?.uri;
  const mimeType = uploadData?.file?.mimeType || audioBlob.type || 'audio/wav';
  if (!fileUri) throw new Error('업로드된 파일 URI를 받지 못했습니다.');

  return fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: buildTranscriptPrompt() },
            {
              file_data: {
                mime_type: mimeType,
                file_uri: fileUri,
              },
            },
          ],
        }],
        generationConfig: { maxOutputTokens: 8192, temperature: 0.1 },
      }),
    },
  );
}

function buildTranscriptPrompt() {
  return `다음 한국어 회의/업무 음성을 가능한 한 정확하게 받아쓰세요.

규칙:
- 응답은 순수 본문만 작성합니다.
- 불필요한 설명, 제목, 코드블록, 마크다운 서식은 넣지 않습니다.
- 문장 단위로 줄바꿈해 주세요.
- 알아듣기 어려운 구간은 추측하지 말고 자연스럽게 생략하거나 [불명확]으로 표시합니다.`;
}

function extractTranscriptText(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return parts
    .map((part) => (typeof part?.text === 'string' ? part.text : ''))
    .join('\n')
    .trim();
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = String(reader.result || '');
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error || new Error('오디오 인코딩 실패'));
    reader.readAsDataURL(blob);
  });
}

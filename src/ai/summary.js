import { getApiKey } from './extract.js';
import { getSummaryPrompt } from './summary-settings.js';

export async function summarizeRecordingWithAI(recordingText) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('API_KEY_MISSING');

  const content = (recordingText || '').trim();
  if (!content) throw new Error('요약할 녹음 내용이 없습니다.');

  let response;
  try {
    response = await requestSummary(apiKey, content);
    if (response.status === 503) {
      await wait(900);
      response = await requestSummary(apiKey, content);
    }
  } catch (err) {
    throw new Error(`네트워크 오류: ${err.message}`);
  }

  if (!response.ok) {
    if (response.status === 400 || response.status === 403) {
      throw new Error('API_KEY_INVALID');
    }
    if (response.status === 503) {
      throw new Error('API_OVERLOADED');
    }
    const body = await response.text().catch(() => '');
    throw new Error(`API 오류 ${response.status}: ${body.slice(0, 120)}`);
  }

  const data = await response.json();
  const summary = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
  if (!summary) throw new Error('AI 요약 결과가 비어 있습니다.');
  return summary;
}

function requestSummary(apiKey, content) {
  return fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: buildSummaryPrompt(content),
          }],
        }],
        generationConfig: { maxOutputTokens: 1024, temperature: 0.2 },
      }),
    },
  );
}

function buildSummaryPrompt(recordingText) {
  return `${getSummaryPrompt()}

녹음 내용:
${recordingText}`;
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

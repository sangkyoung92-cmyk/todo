const SUMMARY_PROMPT_KEY = 'ai_summary_prompt_v1';

export const DEFAULT_SUMMARY_PROMPT = [
  '녹음으로 받아쓴 내용을 한국어로 간결하게 요약하세요.',
  '핵심 결정, 해야 할 일, 중요한 날짜나 숫자가 있으면 놓치지 마세요.',
  '불확실한 내용은 추측하지 말고 녹음 내용에 있는 정보만 사용하세요.',
].join('\n');

export function getSummaryPrompt() {
  const stored = localStorage.getItem(SUMMARY_PROMPT_KEY);
  if (!stored) return DEFAULT_SUMMARY_PROMPT;
  const sanitized = sanitizeUserPrompt(stored);
  if (sanitized !== stored) localStorage.setItem(SUMMARY_PROMPT_KEY, sanitized);
  return sanitized || DEFAULT_SUMMARY_PROMPT;
}

export function saveSummaryPrompt(prompt) {
  const nextPrompt = sanitizeUserPrompt(prompt);
  if (!nextPrompt) {
    localStorage.removeItem(SUMMARY_PROMPT_KEY);
    return DEFAULT_SUMMARY_PROMPT;
  }
  localStorage.setItem(SUMMARY_PROMPT_KEY, nextPrompt);
  return nextPrompt;
}

export function resetSummaryPrompt() {
  localStorage.removeItem(SUMMARY_PROMPT_KEY);
  return DEFAULT_SUMMARY_PROMPT;
}

function sanitizeUserPrompt(prompt) {
  return String(prompt || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !isFixedInstruction(line))
    .join('\n');
}

function isFixedInstruction(line) {
  return line.includes('응답은 제목 없이')
    || ((line.includes('3~5개') || line.includes('3~5개의') || line.includes('3~5'))
      && line.toLowerCase().includes('bullet'));
}

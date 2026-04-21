const SUMMARY_PROMPT_KEY = 'ai_summary_prompt_v1';

export const DEFAULT_SUMMARY_PROMPT = [
  '현재 노트 내용을 한국어로 간결하게 요약하세요.',
  '핵심 결정, 해야 할 일, 중요한 날짜나 숫자가 있으면 놓치지 마세요.',
  '불확실한 내용은 추측하지 말고 노트에 있는 정보만 사용하세요.',
  '응답은 제목 없이 3~5개의 짧은 bullet로 작성하세요.',
].join('\n');

export function getSummaryPrompt() {
  return localStorage.getItem(SUMMARY_PROMPT_KEY) || DEFAULT_SUMMARY_PROMPT;
}

export function saveSummaryPrompt(prompt) {
  const nextPrompt = (prompt || '').trim();
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

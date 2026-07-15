export function initAuthLanding({ onGoogle, onEmailLogin, onEmailSignup, onResetPassword, onManualMigration }) {
  const page = document.getElementById('landing-page');
  const status = document.getElementById('landing-status');
  const googleBtn = document.getElementById('landing-google-btn');
  const form = document.getElementById('email-auth-form');
  const emailInput = document.getElementById('landing-email');
  const passwordInput = document.getElementById('landing-password');
  const signupBtn = document.getElementById('email-signup-btn');
  const resetBtn = document.getElementById('password-reset-btn');
  const manualBtn = document.getElementById('manual-migration-btn');

  const setStatus = (message, isError = false) => {
    if (!status) return;
    status.textContent = message || '';
    status.classList.toggle('error', Boolean(isError));
  };

  const getCredentials = () => ({
    email: emailInput.value.trim(),
    password: passwordInput.value,
  });

  googleBtn?.addEventListener('click', async () => {
    setStatus('Google 로그인 창을 여는 중이에요...');
    try { await onGoogle?.(); } catch (error) { setStatus(error.message || 'Google 로그인에 실패했어요.', true); }
  });

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    setStatus('이메일로 로그인하는 중이에요...');
    try { await onEmailLogin?.(getCredentials()); } catch (error) { setStatus(error.message || '이메일 로그인에 실패했어요.', true); }
  });

  signupBtn?.addEventListener('click', async () => {
    const ok = window.confirm(
      '가입 후 이 브라우저에 있던 기존 데이터가 계정으로 안전하게 복사됩니다.\n'
      + '복사 전 백업도 자동으로 만들어둘게요.\n'
      + '이미 같은 계정에 데이터가 있으면 기존 데이터와 합쳐집니다.',
    );
    if (!ok) return;
    setStatus('이메일 계정을 만들고 기존 데이터를 확인하는 중이에요...');
    try { await onEmailSignup?.(getCredentials()); } catch (error) { setStatus(error.message || '이메일 가입에 실패했어요.', true); }
  });

  resetBtn?.addEventListener('click', async () => {
    const email = emailInput.value.trim();
    if (!email) {
      setStatus('비밀번호 재설정 메일을 받을 이메일을 먼저 입력해주세요.', true);
      return;
    }
    setStatus('비밀번호 재설정 메일을 보내는 중이에요...');
    try {
      await onResetPassword?.(email);
      setStatus('비밀번호 재설정 메일을 보냈어요.');
    } catch (error) {
      setStatus(error.message || '재설정 메일 발송에 실패했어요.', true);
    }
  });

  manualBtn?.addEventListener('click', async () => {
    setStatus('기존 로컬 데이터를 계정에 연동하는 중이에요...');
    try {
      const result = await onManualMigration?.();
      setStatus(result || '연동이 완료됐어요.');
    } catch (error) {
      setStatus(error.message || '기존 데이터 연동에 실패했어요.', true);
    }
  });

  return {
    show() { document.body.classList.add('auth-required'); page?.removeAttribute('hidden'); },
    hide() { document.body.classList.remove('auth-required'); page?.setAttribute('hidden', ''); setStatus(''); },
    setStatus,
  };
}

async function routeFromIndex(session) {
  const params = new URLSearchParams(window.location.search);
  if (session && isAdminSession(session)) { window.location.replace(params.has('session') || params.has('code') ? `mapping.html${window.location.search}` : 'dashboard.html'); return; }
}
async function createGuestSession() {
  const { data, error } = await supabaseClient.auth.signInAnonymously();
  if (error) throw error;
  const created = await cloneSession(TEMPLATE_SESSION_ID, 'New Session', { is_ephemeral: true, creator_type: 'guest' });
  window.location.replace(`mapping.html?session=${encodeURIComponent(created.id)}`);
}
const form = document.getElementById('loginForm');
form.addEventListener('submit', async event => {
  event.preventDefault();
  const errorBox = document.getElementById('loginError'); errorBox.textContent = '';
  const { error } = await supabaseClient.auth.signInWithPassword({ email: document.getElementById('loginEmail').value.trim(), password: document.getElementById('loginPassword').value });
  if (error) errorBox.textContent = 'Sign in failed. Check your email and password.';
});
document.getElementById('guestButton').addEventListener('click', async event => {
  const button = event.currentTarget; const errorBox = document.getElementById('loginError');
  button.disabled = true; button.textContent = 'Creating guest session...'; errorBox.textContent = '';
  try { await createGuestSession(); } catch (error) {
    button.disabled = false;
    button.textContent = 'Login as Guest';
    errorBox.textContent = error.message === 'Anonymous sign-ins are disabled'
      ? 'Guest access is disabled in Supabase. Enable Anonymous Sign-ins in Authentication → Providers.'
      : 'Could not create a guest session. Please try again.';
    console.error(error);
  }
});
supabaseClient.auth.onAuthStateChange((event, session) => { if (event === 'SIGNED_IN') routeFromIndex(session); if (!session && event === 'SIGNED_OUT') window.location.replace('index.html'); });
(async () => {
  const params = new URLSearchParams(window.location.search);
  const { data, error } = await supabaseClient.auth.getSession();
  if (error) { document.getElementById('loginError').textContent = 'Could not check your sign-in status.'; return; }
  if (data.session && (params.has('session') || params.has('code'))) { window.location.replace(`mapping.html${window.location.search}`); return; }
  if (data.session && isAdminSession(data.session)) window.location.replace('dashboard.html');
})();

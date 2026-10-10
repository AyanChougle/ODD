'use strict';

const form = document.getElementById('admin-login-form');
const errorBox = document.getElementById('login-error');

// Automatically redirect if already authenticated
(function() {
  const session = localStorage.getItem('odd_admin_session');
  if (session) {
    try {
      const parsed = JSON.parse(session);
      if (parsed.authenticated) {
        window.location.replace('admin.html');
        return;
      }
    } catch (e) {}
  }
})();

if (form) {
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (errorBox) errorBox.style.display = 'none';

    const submit = form.querySelector('button[type="submit"]');
    if (submit) {
      submit.disabled = true;
      submit.textContent = 'Signing in…';
    }

    const email = form.email ? form.email.value.trim() : 'admin@oddperfume.com';
    const password = form.password ? form.password.value.trim() : 'admin';

    if (!email || !password) {
      if (errorBox) {
        errorBox.textContent = 'Please enter both email and password.';
        errorBox.style.display = 'block';
      }
      if (submit) {
        submit.disabled = false;
        submit.textContent = 'Sign in securely';
      }
      return;
    }

    // Save session in localStorage for Hostinger static deployment
    const sessionObj = {
      authenticated: true,
      email: email,
      name: email.split('@')[0].toUpperCase(),
      role: 'admin',
      token: 'static-hostinger-token-' + Date.now()
    };

    localStorage.setItem('odd_admin_session', JSON.stringify(sessionObj));
    localStorage.setItem('odd_role', 'admin');

    window.location.replace('admin.html');
  });
}

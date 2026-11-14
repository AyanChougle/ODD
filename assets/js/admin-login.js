'use strict';

const form = document.getElementById('admin-login-form');
const errorBox = document.getElementById('login-error');

// Check active server-side session immediately
(async function checkExistingSession() {
  try {
    const res = await fetch('/api/auth/session', { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      if (data && data.authenticated && data.user) {
        if (data.csrfToken) {
          sessionStorage.setItem('odd_csrf_token', data.csrfToken);
        }
        window.location.replace('admin.html');
      }
    }
  } catch (err) {
    // API server unreachable or offline - stay on login page
  }
})();

if (form) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (errorBox) {
      errorBox.style.display = 'none';
      errorBox.textContent = '';
    }

    const submit = form.querySelector('button[type="submit"]');
    if (submit) {
      submit.disabled = true;
      submit.textContent = 'Authenticating...';
    }

    const email = (form.email ? form.email.value : '').trim();
    const password = (form.password ? form.password.value : '').trim();

    if (!email || !password) {
      if (errorBox) {
        errorBox.textContent = 'Please provide both email and password.';
        errorBox.style.display = 'block';
      }
      if (submit) {
        submit.disabled = false;
        submit.textContent = 'Sign in securely';
      }
      return;
    }

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ email, password })
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data.authenticated) {
        if (response.status >= 500) {
          throw new Error(data.error ? `${data.error}${data.details ? ': ' + data.details : ''}` : `Server error (${response.status}). Please check database and server configuration.`);
        }
        throw new Error(data.error || 'Invalid credentials or inactive account.');
      }

      if (data.csrfToken) {
        sessionStorage.setItem('odd_csrf_token', data.csrfToken);
      }

      window.location.replace('admin.html');
    } catch (err) {
      if (errorBox) {
        errorBox.textContent = err.message || 'Authentication failed. Please verify credentials.';
        errorBox.style.display = 'block';
      }
      if (submit) {
        submit.disabled = false;
        submit.textContent = 'Sign in securely';
      }
    }
  });
}

const togglePwdBtn = document.getElementById('toggle-pwd-btn');
if (togglePwdBtn) {
  togglePwdBtn.addEventListener('click', () => {
    const pwdInput = document.getElementById('login-password');
    if (!pwdInput) return;
    const isPass = pwdInput.type === 'password';
    pwdInput.type = isPass ? 'text' : 'password';
    togglePwdBtn.innerHTML = isPass
      ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>'
      : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
  });
}

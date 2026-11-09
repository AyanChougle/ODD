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

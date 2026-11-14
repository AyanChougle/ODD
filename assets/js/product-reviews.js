/* ==========================================================================
   ODD Perfume — Product Reviews & Customer Feedback Engine
   Supports Hostinger PHP/MySQL API (/api/reviews) + Local Node + Storage fallback.
   Autofills reviewer details directly from authenticated customer login session.
   ========================================================================== */

(function initOddProductReviewsModule() {
  const VALID_PRODUCTS = new Set(['phantom', 'lucid', 'first-move', 'hamper']);
  const STORAGE_KEY_PREFIX = 'odd_product_reviews_';

  function getApiBase() {
    if (typeof API_BASE !== 'undefined' && API_BASE) return API_BASE;
    if (location.protocol === 'file:') return './api';
    return '/api';
  }

  function escapeReviewHtml(str) {
    if (typeof escapeHTML === 'function') return escapeHTML(str);
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getInitials(name) {
    const clean = String(name || '').trim();
    if (!clean) return 'O';
    const parts = clean.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return clean.slice(0, 2).toUpperCase();
  }

  function getCustomerSessionLocal() {
    try {
      const raw = localStorage.getItem('odd_customer_session');
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && (parsed.name || parsed.email)) {
        return parsed;
      }
    } catch (_) {}
    return null;
  }

  async function fetchCustomerSessionRemote() {
    try {
      const res = await fetch(`${getApiBase()}/customer/session`, {
        headers: { Accept: 'application/json' },
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.authenticated && data.customer) {
          try {
            localStorage.setItem('odd_customer_session', JSON.stringify(data.customer));
          } catch (_) {}
          return data.customer;
        } else if (data && data.authenticated === false) {
          return null;
        }
      }
    } catch (_) {}
    return null;
  }

  function readLocalReviews(productId) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_PREFIX + productId);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function writeLocalReviews(productId, reviews) {
    try {
      localStorage.setItem(STORAGE_KEY_PREFIX + productId, JSON.stringify(reviews));
    } catch (_) {}
  }

  function normalizeReviewRow(row) {
    const ratingNum = Math.min(5, Math.max(1, Math.round(Number(row.rating) || 5)));
    return {
      id: row.id || `rev-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      productId: String(row.productId || row.product_id || '').trim().toLowerCase(),
      name: String(row.name || row.reviewer_name || 'Verified Customer').trim(),
      rating: ratingNum,
      occasion: String(row.occasion || row.wear_occasion || '').trim(),
      comment: String(row.comment || '').trim(),
      isVerified: Boolean(row.isVerified || row.is_verified || row.verified),
      createdAt: row.createdAt || row.created_at || new Date().toISOString(),
    };
  }

  function mergeReviews(apiRows = [], localRows = []) {
    const map = new Map();
    [...apiRows, ...localRows].forEach((r) => {
      const item = normalizeReviewRow(r);
      if (!item.comment) return;
      const dedupeKey = `${item.name.toLowerCase()}::${item.comment.toLowerCase().slice(0, 60)}`;
      if (!map.has(dedupeKey)) {
        map.set(dedupeKey, item);
      }
    });
    return Array.from(map.values()).sort((a, b) => {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }

  async function fetchProductReviews(productId) {
    const localRows = readLocalReviews(productId);
    try {
      const res = await fetch(`${getApiBase()}/reviews?product=${encodeURIComponent(productId)}`, {
        headers: { Accept: 'application/json' },
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.reviews)) {
          return mergeReviews(data.reviews, localRows);
        }
      }
    } catch (_) {}
    return mergeReviews([], localRows);
  }

  async function submitProductReview(productId, payload) {
    const entry = normalizeReviewRow({
      ...payload,
      productId,
      createdAt: new Date().toISOString(),
    });

    // Save locally immediately so instant UI re-render works cleanly offline/online
    const existingLocal = readLocalReviews(productId);
    writeLocalReviews(productId, [entry, ...existingLocal]);

    try {
      const res = await fetch(`${getApiBase()}/reviews`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          productId,
          name: entry.name,
          rating: entry.rating,
          occasion: entry.occasion,
          comment: entry.comment,
          email: payload.email || '',
          customerId: payload.customerId || '',
          isVerified: Boolean(payload.isVerified),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.review) {
          return normalizeReviewRow(data.review);
        }
      }
    } catch (_) {}

    return entry;
  }

  function renderStars(count) {
    const full = Math.min(5, Math.max(0, Math.round(Number(count) || 0)));
    let html = '';
    for (let i = 1; i <= 5; i++) {
      html += `<span class="review-star ${i <= full ? 'is-filled' : ''}" aria-hidden="true">&#9733;</span>`;
    }
    return html;
  }

  function formatReviewDate(isoStr) {
    const d = new Date(isoStr);
    if (Number.isNaN(d.getTime())) return 'Recent';
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function getProductLabel(productId) {
    if (typeof PRODUCTS !== 'undefined' && PRODUCTS[productId]) {
      return PRODUCTS[productId].fullName || `ODD ${PRODUCTS[productId].name}`;
    }
    if (productId === 'first-move') return 'ODD First Move';
    if (productId === 'hamper') return 'The ODD Trio Gift Hamper';
    return `ODD ${productId.charAt(0).toUpperCase() + productId.slice(1)}`;
  }

  function renderAuthBannerHtml(customer) {
    if (customer && (customer.name || customer.email)) {
      const displayName = customer.name || customer.email.split('@')[0] || 'Valued Customer';
      const displayEmail = customer.email || '';
      return `
        <div class="review-account-banner is-logged-in" id="review-account-banner">
          <div class="review-account-avatar" aria-hidden="true">${escapeReviewHtml(getInitials(displayName))}</div>
          <div class="review-account-info">
            <div class="review-account-title">
              <span class="review-account-label">Posting as</span>
              <strong class="review-account-name">${escapeReviewHtml(displayName)}</strong>
            </div>
            ${displayEmail ? `<span class="review-account-sub">${escapeReviewHtml(displayEmail)}</span>` : ''}
          </div>
          <a href="my-account.html" class="review-account-link" title="Manage your account">Account &rarr;</a>
        </div>
      `;
    }

    return `
      <div class="review-account-banner is-guest" id="review-account-banner">
        <div class="review-guest-icon" aria-hidden="true">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        </div>
        <div class="review-account-info">
          <span class="review-guest-label">Reviewing as Guest</span>
          <span class="review-guest-sub"><a href="my-account.html" class="review-signin-link">Sign in</a> to auto-fill your account details</span>
        </div>
      </div>
    `;
  }

  async function mountProductReviews() {
    const root = document.getElementById('product-reviews-root');
    if (!root) return;

    const productId = String(root.getAttribute('data-product') || '').trim().toLowerCase();
    if (!VALID_PRODUCTS.has(productId)) return;

    let activeCustomer = getCustomerSessionLocal();
    let reviews = await fetchProductReviews(productId);
    let selectedRating = 5;
    let activeFilter = 'all';

    function buildReviewsFeedHtml() {
      const totalCount = reviews.length;
      const filtered = activeFilter === 'all'
        ? reviews
        : reviews.filter((r) => r.rating === Number(activeFilter));

      const reviewsListHtml = filtered.length
        ? filtered.map((r) => `
          <article class="product-review-card">
            <div class="product-review-card-top">
              <div>
                <div class="product-review-stars" aria-label="${r.rating} out of 5 stars">
                  ${renderStars(r.rating)}
                </div>
                <div class="product-review-author-wrap">
                  <strong class="product-review-author">${escapeReviewHtml(r.name)}</strong>
                  ${r.isVerified ? `
                    <span class="review-verified-badge" title="Verified Customer">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
                      Verified Customer
                    </span>
                  ` : ''}
                </div>
              </div>
              <div class="product-review-meta">
                ${r.occasion ? `<span class="product-review-tag">${escapeReviewHtml(r.occasion)}</span>` : ''}
                <time class="product-review-date">${escapeReviewHtml(formatReviewDate(r.createdAt))}</time>
              </div>
            </div>
            <p class="product-review-comment">${escapeReviewHtml(r.comment)}</p>
          </article>
        `).join('')
        : `
          <div class="product-review-empty">
            <strong>${totalCount === 0 ? 'No reviews yet.' : 'No comments match this star rating.'}</strong>
            <p>${totalCount === 0
              ? `Tried ${escapeReviewHtml(getProductLabel(productId))}? Share how it wore on your skin, projection, and longevity.`
              : 'Select "All" above to view all customer feedback.'}</p>
          </div>
        `;

      const filterBarHtml = totalCount > 0 ? `
        <div class="review-filter-bar" role="tablist" aria-label="Filter reviews by rating">
          <button type="button" class="review-filter-pill ${activeFilter === 'all' ? 'active' : ''}" data-filter="all">All (${totalCount})</button>
          ${[5, 4, 3, 2, 1].map((s) => {
            const cnt = reviews.filter((r) => r.rating === s).length;
            return cnt > 0
              ? `<button type="button" class="review-filter-pill ${String(activeFilter) === String(s) ? 'active' : ''}" data-filter="${s}">${s}&#9733; (${cnt})</button>`
              : '';
          }).join('')}
        </div>
      ` : '';

      return `
        ${filterBarHtml}
        <div class="product-reviews-list">
          ${reviewsListHtml}
        </div>
      `;
    }

    function updateSummaryUI() {
      const totalCount = reviews.length;
      const avgRating = totalCount > 0
        ? (reviews.reduce((sum, r) => sum + r.rating, 0) / totalCount).toFixed(1)
        : null;

      const summaryPill = root.querySelector('.product-review-summary-pill');
      if (summaryPill) {
        summaryPill.innerHTML = `
          <strong>${avgRating ? `${avgRating} / 5` : 'New'}</strong>
          <span>${totalCount} ${totalCount === 1 ? 'review' : 'reviews'}</span>
        `;
      }
    }

    function renderFeedColumn() {
      const col = root.querySelector('.product-reviews-feed-col');
      if (!col) return;
      col.innerHTML = buildReviewsFeedHtml();
      updateSummaryUI();

      col.querySelectorAll('.review-filter-pill').forEach((pill) => {
        pill.addEventListener('click', () => {
          activeFilter = pill.getAttribute('data-filter') || 'all';
          renderFeedColumn();
        });
      });
    }

    function renderAuthSlot() {
      const slot = document.getElementById('review-account-banner-slot');
      if (slot) {
        slot.innerHTML = renderAuthBannerHtml(activeCustomer);
      }
      const hint = document.getElementById('review-name-hint');
      if (hint) {
        hint.style.display = activeCustomer?.name ? 'block' : 'none';
      }
    }

    const initialAuthorName = activeCustomer?.name || '';
    const totalCount = reviews.length;
    const avgRating = totalCount > 0
      ? (reviews.reduce((sum, r) => sum + r.rating, 0) / totalCount).toFixed(1)
      : null;

    root.innerHTML = `
      <div class="product-reviews-header">
        <div>
          <span class="product-eyebrow">REVIEWS &amp; FEEDBACK</span>
          <h2>Real wear notes &amp; impressions.</h2>
          <p>Customer thoughts on longevity, projection, and how ${escapeReviewHtml(getProductLabel(productId))} wears across the day.</p>
        </div>
        <div class="product-review-summary-pill">
          <strong>${avgRating ? `${avgRating} / 5` : 'New'}</strong>
          <span>${totalCount} ${totalCount === 1 ? 'review' : 'reviews'}</span>
        </div>
      </div>

      <div class="product-reviews-layout">
        <div class="product-review-form-card">
          <span class="product-eyebrow">LEAVE FEEDBACK</span>
          <h3>Share your take</h3>
          <div id="review-account-banner-slot">
            ${renderAuthBannerHtml(activeCustomer)}
          </div>
          <form id="product-review-form" class="product-review-form">
            <div class="review-field">
              <label for="review-rating-group">Your Rating</label>
              <div id="review-rating-group" class="review-star-picker" role="radiogroup" aria-label="Rating out of 5 stars">
                ${[1, 2, 3, 4, 5].map((star) => `
                  <button type="button" class="review-star-btn ${star <= selectedRating ? 'is-selected' : ''}" data-rating="${star}" aria-label="${star} star${star > 1 ? 's' : ''}">&#9733;</button>
                `).join('')}
                <span class="review-rating-label">${selectedRating} / 5</span>
              </div>
            </div>

            <div class="review-field-row">
              <div class="review-field">
                <label for="review-author-name">Your Name *</label>
                <input type="text" id="review-author-name" maxlength="64" placeholder="e.g. Aarav K." value="${escapeReviewHtml(initialAuthorName)}" ${initialAuthorName ? 'data-autofilled="true"' : ''} required>
                <span class="review-field-hint" id="review-name-hint" style="${initialAuthorName ? '' : 'display:none;'}">Fetched from your signed-in account</span>
              </div>
              <div class="review-field">
                <label for="review-occasion">Worn For (Optional)</label>
                <input type="text" id="review-occasion" maxlength="64" placeholder="e.g. Date night, Office">
              </div>
            </div>

            <div class="review-field">
              <label for="review-comment-text">Review / Feedback Comment *</label>
              <textarea id="review-comment-text" rows="4" maxlength="600" placeholder="How did it smell on opening, dry-down, and how long did it last?" required></textarea>
            </div>

            <button type="submit" class="review-submit-btn">Post Feedback</button>
          </form>
        </div>

        <div class="product-reviews-feed-col">
          ${buildReviewsFeedHtml()}
        </div>
      </div>
    `;

    // Bind star picker
    root.querySelectorAll('.review-star-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedRating = Number(btn.getAttribute('data-rating')) || 5;
        root.querySelectorAll('.review-star-btn').forEach((b) => {
          const val = Number(b.getAttribute('data-rating')) || 0;
          b.classList.toggle('is-selected', val <= selectedRating);
        });
        const lbl = root.querySelector('.review-rating-label');
        if (lbl) lbl.textContent = `${selectedRating} / 5`;
      });
    });

    // Bind filter pills in feed column
    const feedCol = root.querySelector('.product-reviews-feed-col');
    if (feedCol) {
      feedCol.querySelectorAll('.review-filter-pill').forEach((pill) => {
        pill.addEventListener('click', () => {
          activeFilter = pill.getAttribute('data-filter') || 'all';
          renderFeedColumn();
        });
      });
    }

    // Name input user-typing tracking
    const nameInput = document.getElementById('review-author-name');
    if (nameInput) {
      nameInput.addEventListener('input', () => {
        nameInput.dataset.autofilled = 'false';
        const hint = document.getElementById('review-name-hint');
        if (hint) hint.style.display = 'none';
      });
    }

    // Bind form submission
    const form = document.getElementById('product-review-form');
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const occasionInput = document.getElementById('review-occasion');
        const commentInput = document.getElementById('review-comment-text');
        const submitBtn = form.querySelector('.review-submit-btn');

        const name = (nameInput?.value || '').trim();
        const occasion = (occasionInput?.value || '').trim();
        const comment = (commentInput?.value || '').trim();

        if (!name || !comment) {
          if (typeof showToast === 'function') {
            showToast('Please enter your name and feedback comment.');
          }
          return;
        }

        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Posting...';
        }

        const created = await submitProductReview(productId, {
          name,
          occasion,
          rating: selectedRating,
          comment,
          email: activeCustomer?.email || '',
          customerId: activeCustomer?.id || '',
          isVerified: Boolean(activeCustomer),
        });

        reviews = mergeReviews([created], reviews);
        activeFilter = 'all';

        // Clear comment and occasion, keep name pre-filled
        if (commentInput) commentInput.value = '';
        if (occasionInput) occasionInput.value = '';

        renderFeedColumn();

        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Post Feedback';
        }

        if (typeof showToast === 'function') {
          showToast('Thank you! Your feedback has been posted.');
        }
      });
    }

    // Background verify active server session to ensure fresh state
    fetchCustomerSessionRemote().then((remoteCustomer) => {
      if (remoteCustomer) {
        activeCustomer = remoteCustomer;
        if (nameInput && (!nameInput.value || nameInput.dataset.autofilled === 'true')) {
          nameInput.value = remoteCustomer.name || '';
          nameInput.dataset.autofilled = 'true';
        }
        renderAuthSlot();
      }
    });

    // Cross-tab sync if customer logs in or out in another tab/window
    window.addEventListener('storage', (e) => {
      if (e.key === 'odd_customer_session') {
        activeCustomer = getCustomerSessionLocal();
        if (nameInput && (!nameInput.value || nameInput.dataset.autofilled === 'true')) {
          nameInput.value = activeCustomer?.name || '';
          if (activeCustomer?.name) nameInput.dataset.autofilled = 'true';
        }
        renderAuthSlot();
      }
    });
  }

  document.addEventListener('DOMContentLoaded', mountProductReviews);
})();

# ODD Perfume — Developer Handoff

**Environment:** https://testing.oddperfume.com/ (WordPress staging)  
**Purpose:** Give the developer a map of ODD’s public storefront and the backend features visible during inspection. This is a browser-based visual/structural inventory; it is not a source-code or complete backend audit.

## 1. Brand and storefront summary

ODD is a direct-to-consumer perfume brand based in Mumbai, India. The storefront presents three everyday fragrances at ₹899 each (shown against ₹1,199; 25% off), with free shipping, COD, 20–25% perfume oil, and a stated 8–10 hour wear time. Core tone: playful, confident, unconventional; recurring line: “It’s good to be ODD.”

### Products

| Product    | Scent notes                      | Positioning / occasion                                | Displayed price |
| ---------- | -------------------------------- | ----------------------------------------------------- | --------------: |
| Phantom    | Oud · Amber · Smoky Woods        | Unseen. Unforgotten. Dominant. Evenings / late nights |            ₹899 |
| Lucid      | Citrus · Black Tea · Clean Woods | Clear Mind. Sharp Presence. Daytime / office          |            ₹899 |
| First Move | Pineapple · Woods · Smoky Musk   | Start First. Stay Ahead. Dates / going out            |            ₹899 |

Product detail routes: `/products/odd-phantom/`, `/products/odd-lucid/`, `/products/odd-first-move/`.

## 2. Public information architecture

- `/` — Home: launch offer strip, hero, product doors/cards, time-of-day picker, campaign gallery, brand principles, comparison table, scent quiz CTA, interactive “spot the odd one” game, USPs, email signup, full footer.
- `/shop/` — All perfumes / shop the three.
- `/products/odd-phantom/` — Phantom product detail.
- `/products/odd-lucid/` — Lucid product detail.
- `/products/odd-first-move/` — First Move product detail.
- `/find-your-scent/` — Five-question scent quiz / “Find your ODD”.
- `/story/` — Brand story (“How ODD started”).
- `/cart/` — Bag/cart.
- `/checkout` — Checkout (linked from cart; observed without trailing slash).
- `/my-account/` — Customer account.
- `/order-tracking/` — Track an order.
- `/faq/` — FAQ.
- `/contact/` — Contact.
- `/shipping-policy/` — Shipping terms.
- `/refund-policy/` — Returns and refunds.
- `/privacy-policy/` — Privacy policy.
- `/terms/` — Terms of service.

Global header: expandable Menu, ODD home logo, Search, Track your order, My account, bag/cart count. Global cart drawer: “Your Bag”, close, empty-state and Continue Shopping (plus checkout when populated). Global footer groups Shop, Help, Say Hi, payment methods, and legal/policy links. Contact shown: `hello@oddperfume.com`, Mon–Sat, 10am–7pm IST. Payments listed: UPI, cards, netbanking, COD; secure payments by Razorpay.

## 3. Home page section order and behavior

1. **Launch offer:** “We’re Live. Here’s 20% Off.”, code `LAUNCH20`, countdown, launch-week note; dismiss control and copy-code button.
2. **Hero:** “NORMAL DULLS SENSE. It’s good to be ODD.” Short positioning copy; links to scent quiz and shop; featured pick (observed Lucid at ₹899).
3. **Value ticker:** Free shipping, COD, 20–25% perfume oil, 8–10 hour wear.
4. **The perfumes:** Three product cards / opening-door interactions; prices, crossed-out original price, discount, add-to-bag and details links. One product can be marked pick of day.
5. **When to wear what:** Time slider, reset-to-now action, recommendation and add-to-bag CTA. Recommendation changes by time (observed 6:00 PM → First Move).
6. **From our shoots:** Eight campaign/story tiles: Monday 9am, out after work, two sprays, dinner plans, no occasion needed, weekend, late again, still up.
7. **Brand beliefs:** Five paired statements (wear what you like; perfume on a Tuesday; smell before buying; two sprays; be ODD), signed by the ODD team; story link.
8. **Comparison:** Table for Phantom, Lucid and First Move, with intensity, warmth, freshness, sweetness (five-point scales), notes, and occasions; quiz CTA.
9. **Scent quiz:** Five questions; helps choose one of the three.
10. **Mini-game:** Forty dot buttons, “Spot the odd one”, “Show me” action.
11. **Proof points:** 20–25% perfume oil; 8–10 hour wear; three focused fragrances; ₹0 shipping anywhere in India and COD.
12. **Email signup:** Monthly-ish new scents/offers; email field and Join.
13. **Footer:** Navigation, contact, payments, Razorpay, copyright and policies.

## 4. Key journeys to preserve

- Discover → product detail → add to bag → cart drawer/cart → checkout.
- Unsure → five-question quiz → recommended fragrance → product/bag.
- Choose by schedule → time slider → recommendation → add to bag.
- Existing buyer → order tracking or account.
- Support → FAQ/contact/shipping/refund policy.
- Launch offer → copy `LAUNCH20` and apply during purchase (confirm actual discount application rules in commerce configuration).

## 5. Content and merchandising facts visible on staging

Comparison values shown:

| Attribute | Phantom | Lucid | First Move |
| --------- | ------: | ----: | ---------: |
| Intensity |     5/5 |   2/5 |        4/5 |
| Warmth    |     4/5 |   1/5 |        4/5 |
| Freshness |     1/5 |   5/5 |        2/5 |
| Sweetness |     2/5 |   1/5 |        3/5 |

Home page says “Strong enough that two sprays last most of the day”; ticker says 8–10 hours on skin, dependent on weather. Marketing statements should be treated as content, not independently verified product specifications.

## 6. WordPress editor / implementation map

The logged-in staging view shows a WordPress admin bar and a custom **ODD Experience** panel. Its visible configuration tabs are:

- Everywhere (global)
- Home
- Shop
- Product page
- Quiz
- Story
- Contact & FAQ
- Policies
- Experiences
- Design

The home page also exposes “Edit this page” / an ODD page editor entry. WordPress “New” menu includes Page, Perfume (`odd_product`), and Order (`odd_order`), indicating custom Perfume and Order content types. A separate open admin tab showed **Barcode Labels** under Perfume administration (`post_type=odd_product`, page `odd-barcode-labels`). This confirms a barcode-label admin screen exists, but the available inspection did not reveal its controls, label format, barcode source, printing/export behavior, or how it ties to product inventory and fulfillment. Do not assume those workflow details from the screen name alone.

### Backend and operations map (what was actually observed)

- WordPress staging at `testing.oddperfume.com`; the inspected browser session was authenticated as an administrator (admin toolbar visible).
- Custom ODD Experience configuration interface with the ten sections listed above, plus an ODD page editor entry on the homepage.
- Custom content types named Perfume (`odd_product`) and Order (`odd_order`) in the WordPress creation menu.
- Perfume admin includes a Barcode Labels page (`edit.php?post_type=odd_product&page=odd-barcode-labels`). Its existence is verified; its end-to-end operation remains uninspected.
- WordPress admin toolbar reported 3 updates available and 0 comments in moderation at inspection time.
- Homepage front end exposes cart, checkout link, customer account, order tracking, email signup, Razorpay/payment-method copy, and COD. This verifies customer-facing entry points, not the backend integrations, credentials, automations or order lifecycle.
- The separate hosting panel tab was titled “Staging | Hostinger” and linked to the WordPress staging setup. Hosting configuration and deployment process were not inspected.

### Backend areas still requiring direct review

The following are **not verified** by the current browser inventory: barcode creation/assignment/printing, inventory and SKU model, order status transitions, fulfillment and shipping integrations, WooCommerce configuration, payment gateway settings/webhooks, COD validation, customer/order data access rules, email/CRM integrations, plugin/theme inventory, backups, staging-to-production deployment, database schema, APIs, scheduled jobs, and server-side security controls. Inspect the relevant admin screens and implementation before treating any of these as present or complete.

The public home appears to use custom structured sections and dynamic behaviors (cart drawer, clock recommendation, quiz progress, mini-game, modal/editor affordances). The visual inspection does not establish whether these are custom theme, plugin, or block implementations. Inspect the ODD Experience settings, theme/plugin code and WooCommerce/custom post type registrations before editing.

## 7. Developer review checklist

- Capture full-page screenshots at desktop and mobile widths; validate all menu, cart, search, quiz, clock slider, gallery and game interactions.
- Verify each listed route resolves and has intentional empty, loading, error and success states.
- Confirm product data (SKUs, sizes, inventory, variants, image galleries, price/sale schedule) against the Perfume records; only scent copy and displayed ₹899/₹1,199 were visible here.
- Confirm launch coupon configuration, eligible products, stacking, expiry, checkout application and countdown source.
- Check cart persistence, quantity updates, checkout/Razorpay flow, COD rules, order tracking, account and email signup integrations.
- Verify copy, policy/legal text, shipping thresholds, service geography, tax and fulfillment details with the owner.
- Check accessibility: keyboard operation, labels, focus states, contrast, reduced motion, heading structure and meaningful image alt text.
- Check SEO metadata, canonical URLs, analytics/consent behavior, caching and staging-vs-production settings.

## 8. Scope and caveats

This is a map of the visible staging storefront and the limited WordPress controls observed on 5 Oct 2026. It does not include a source-code review, API contracts, plugin inventory, payment credentials, a complete barcode workflow review, or a backend security/operations audit. Some individual destination pages and workflows were not opened. Confirm these directly in WordPress and the developer environment before implementation.

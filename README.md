# ODD Perfume

A storefront and staff operations portal for ODD Perfume. The original brand palette, perfume names, existing campaign copy, and bottle imagery are retained. The site uses a Node.js server with SQLite for authoritative stock, staff sessions, orders, coupons, barcode serials, scans, and admin settings.

## Run locally

**Requirement:** Node.js 22.5 or newer (the server uses Node's built-in `node:sqlite`; no external packages are required).

1. Open this project folder in a terminal.
2. Create the first admin account before starting the server.

**Windows PowerShell:**

```powershell
$env:ODD_ADMIN_EMAIL = "you@example.com"
$env:ODD_ADMIN_NAME = "Store Admin"
$env:ODD_ADMIN_PASSWORD = "replace-this-with-a-unique-long-passphrase"
npm run create-admin
Remove-Item Env:ODD_ADMIN_PASSWORD
npm start
```

**macOS/Linux:**

```bash
export ODD_ADMIN_EMAIL="you@example.com"
export ODD_ADMIN_NAME="Store Admin"
export ODD_ADMIN_PASSWORD="replace-this-with-a-unique-long-passphrase"
npm run create-admin
unset ODD_ADMIN_PASSWORD
npm start
```

Then open `http://127.0.0.1:5500/`. Sign in to the staff portal at `http://127.0.0.1:5500/admin-login.html`. **There is no default admin password.** If port 5500 is already in use, stop the other local server or set another `PORT` before starting this app.

Do not open the pages through VS Code Live Server or by double-clicking the HTML files when testing checkout/admin. Those static previews cannot perform authenticated API calls. Use the Node server URL above.

## What's functional in this build

- Shared server-owned inventory and prices. Storefront, product detail, collection, search, and checkout stock state come from one API when the server is online. First Move starts at **0 units**, and the server rejects checkout while it remains out of stock. Restock it from the admin Inventory tab when real stock is received.
- Cart drawer and checkout order summary show product, unit price, quantity, line total, coupon discount, and total. COD orders are validated and written to SQLite on the server. Stock is reduced in the same transaction. Canceling an order before dispatch restores stock.
- Staff sign-in uses hashed passwords, HttpOnly SameSite session cookies, CSRF tokens for writes, login throttling, server-side role checks, and audit events.
- Separate roles: Admin, Warehouse, Orders, Finance, and Marketing. Admin can create/disable staff accounts; the server prevents disabling the last active admin.
- Inventory edits, order status updates, coupon management, announcement settings, and scanner events update shared database state rather than browser-only demo data.
- Barcode batches allocate unique serials on the server, store them in SQLite with a uniqueness constraint, and produce printable Code 128 labels. Generate a new batch for new physical labels; never copy/paste a label serial onto another item.
- Order tracking looks up a real order with its secure tracking token or the order ID plus the checkout phone number.
- Mobile styles handle the product pages, cart/search overlays, checkout, admin navigation, and barcode sheet at narrow widths.

## Important limitations before production

- **Online Razorpay is deliberately disabled.** This build does not have a verified server-side Razorpay order-creation, callback/signature validation, payment reconciliation, and webhook workflow. The checkout will not fake a payment success. COD is the only enabled checkout method.
- The email signup/marketing form is still a storefront interaction; it is not connected to a mailing-list provider.
- The order tracking endpoint supports secure order-token URLs and order ID plus phone lookup. Do not publish tracking tokens in social or support messages.
- Before putting this on a public domain, deploy behind HTTPS with a reverse proxy, set `NODE_ENV=production`, configure private persistent storage/backups, restrict host and network exposure, add operational monitoring, and exercise the real fulfilment workflow. Back up the SQLite database securely. Do not place a live database under a public downloads directory.
- This is an app implementation, not a claim of third-party security certification. Run a full deployment review and test real devices/browser versions before accepting live orders.

## Staff roles

| Role | Access |
|---|---|
| Admin | All operations, staff accounts, store settings |
| Warehouse | Read/update stock, receive/dispatch scans, generate barcode batches |
| Orders | Read orders and update fulfilment status |
| Finance | Read payment dashboard and orders |
| Marketing | Manage coupons and the announcement banner |

## Data files

At first server start, the app creates `storage/odd-perfume.sqlite` and seeds inventory and launch coupons if they do not already exist. The database is deliberately excluded from the ZIP. Do not delete or replace it after going live unless you intend to reset the store's operational data.

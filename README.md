# FoodVista — Restaurant Management System

**Tagline:** *Good Food • Good Mood*

FoodVista is a full-stack, mobile-first, PWA-enabled restaurant ordering, QR dine-in, reservation, and admin management platform built for restaurant operations in Bangladesh (`৳ BDT` currency, `Asia/Dhaka` timezone).

## Features

- **Customer Public Website**: Dynamic hero & special offers, category/price/availability filtering, dish details modal (sizes, addons, notes), persistent slide-over cart drawer, 3-mode checkout (Home Delivery, Pickup, Verified QR Dine-in), Google Sign-In, saved delivery addresses, real-time order tracking, table reservations with conflict detection, and customer reviews.
- **Daily Food Availability**: Date-keyed (`productId_YYYY-MM-DD`) availability in `Asia/Dhaka` time with bulk selection, custom Bangla/English unavailable messages, daily open/close hours, and strict checkout blocking.
- **QR Table Ordering**: Cryptographically signed (`HMAC-SHA256`) table QR tokens (`fvqr.<tableId>.<version>.<signature>`), QR PNG generation/printing, instant token revocation, and automatic table occupancy sync.
- **Admin Dashboard**: KPI overview & Recharts analytics, Order Management with thermal receipt printing, real-time Kitchen Display System (KDS), Inventory & single-pass Recipe auto-deduction, Expenses & P&L, Coupons & Review moderation, Staff RBAC, Audit Logs, and Dynamic Website Settings CMS.

## Local Development

```bash
npm install
npm run dev
```

The Express + Vite server runs on port `3000`.

## Testing & Verification

```bash
npm test
npm run lint
npm run build
```

## Production Deployment

1. Configure environment variables based on `.env.example`.
2. Build client assets: `npm run build`
3. Start production server: `npm start` (`node server.ts`)
4. Put behind Nginx reverse proxy (see `docs/nginx.conf`) with SSL/TLS and PM2 or Docker process supervision.

import crypto from 'node:crypto';
import express from 'express';
import { createServer } from 'node:http';
import { Server as SocketIOServer } from 'socket.io';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  DEFAULT_PRODUCTS,
  DEFAULT_RECIPES,
  DEFAULT_TABLES,
  DEFAULT_WEBSITE_SETTINGS,
} from '../src/data/seedDefaults.ts';
import { createApiRouter } from '../src/server/routes/api.ts';
import { signTableQrToken, verifyTableQrToken } from '../src/server/utils/qrToken.ts';
import { checkProductAvailability } from '../src/shared/availability.ts';
import { computeRecipeDeductions } from '../src/shared/inventory.ts';
import { calculateOrderTotals } from '../src/shared/pricing.ts';
import { findAvailableTablesForSlot, hasReservationConflict } from '../src/shared/reservations.ts';
import { formatBDT, getDhakaDateString, isWithinTimeWindow } from '../src/shared/timezone.ts';
import type { Coupon, FoodAvailability, Reservation } from '../src/shared/types.ts';

describe('FoodVista Core Business Logic', () => {
  it('evaluates daily food availability with custom Bangla message and Asia/Dhaka time windows', () => {
    const beefBurger = DEFAULT_PRODUCTS.find((p) => p.id === 'prod_beef_burger')!;
    const chickenBurger = DEFAULT_PRODUCTS.find((p) => p.id === 'prod_chicken_burger')!;
    const today = '2026-11-24';

    const availabilityList: FoodAvailability[] = [
      {
        id: `${beefBurger.id}_${today}`,
        productId: beefBurger.id,
        date: today,
        isAvailable: false,
        unavailableMessage: 'আজ Beef Burger পাওয়া যাচ্ছে না।',
        openTime: '11:00',
        closeTime: '23:30',
      },
      {
        id: `${chickenBurger.id}_${today}`,
        productId: chickenBurger.id,
        date: today,
        isAvailable: true,
        unavailableMessage: '',
        openTime: '11:00',
        closeTime: '23:00',
      },
    ];

    const beefRes = checkProductAvailability(beefBurger, availabilityList, today, '14:00');
    expect(beefRes.available).toBe(false);
    expect(beefRes.message).toBe('আজ Beef Burger পাওয়া যাচ্ছে না।');

    const chickenOpen = checkProductAvailability(chickenBurger, availabilityList, today, '14:00');
    expect(chickenOpen.available).toBe(true);

    const chickenAfterHours = checkProductAvailability(chickenBurger, availabilityList, today, '23:45');
    expect(chickenAfterHours.available).toBe(false);
    expect(isWithinTimeWindow('11:00', '23:00', '12:00')).toBe(true);
  });

  it('calculates cart totals, discounts, coupons, and Dhaka delivery fees accurately', () => {
    const chickenBurger = DEFAULT_PRODUCTS.find((p) => p.id === 'prod_chicken_burger')!;
    const coupon: Coupon = {
      id: 'c1',
      code: 'WELCOME10',
      discountType: 'percentage',
      discountValue: 10,
      minOrderValue: 400,
      maxUses: 100,
      usedCount: 0,
      expiresAt: '2028-12-31',
      isActive: true,
    };

    // Discounted unit price for chicken burger is 295; + Double Crunch (+130) + Extra Cheddar Slice (+45) = 470 * 2 = 940
    const res = calculateOrderTotals({
      lines: [
        {
          productId: chickenBurger.id,
          sizeName: 'Double Crunch',
          addons: [{ name: 'Extra Cheddar Slice', price: 45 }],
          quantity: 2,
        },
      ],
      products: DEFAULT_PRODUCTS,
      orderType: 'delivery',
      deliveryArea: 'Banani',
      coupon,
      settings: DEFAULT_WEBSITE_SETTINGS,
      todayDate: '2026-11-24',
    });

    expect(res.subtotal).toBe(940);
    expect(res.discountAmount).toBe(94);
    expect(res.deliveryCharge).toBe(60); // 940 - 94 = 846 < 1500 threshold
    expect(res.totalAmount).toBe(906);
    expect(res.appliedCouponCode).toBe('WELCOME10');
    expect(formatBDT(906)).toContain('৳');
  });

  it('signs, verifies, and revokes cryptographic QR table tokens', () => {
    const signed = signTableQrToken('table_01', 1);
    expect(signed.token.startsWith('fvqr.table_01.1.')).toBe(true);

    const valid = verifyTableQrToken(signed.token, signed.signature, 1);
    expect(valid.valid).toBe(true);
    expect(valid.tableId).toBe('table_01');

    // Tampered token must fail
    const tampered = `${signed.token.slice(0, -4)}dead`;
    const tamperedRes = verifyTableQrToken(tampered, signed.signature, 1);
    expect(tamperedRes.valid).toBe(false);

    // Revoked version (table rotated to v2) must reject v1 QR
    const revokedRes = verifyTableQrToken(signed.token, signed.signature, 2);
    expect(revokedRes.valid).toBe(false);
    expect(revokedRes.reason).toContain('revoked');
  });

  it('detects table reservation conflicts and filters available tables by guest count', () => {
    const existing: Reservation[] = [
      {
        id: 'res_1',
        userId: 'u1',
        customerName: 'Nadia',
        customerPhone: '01711111111',
        date: '2026-12-01',
        timeSlot: '08:00 PM',
        guestCount: 2,
        tableId: 'table_01',
        tableNumber: '01',
        status: 'confirmed',
      },
    ];

    expect(hasReservationConflict(existing, 'table_01', '2026-12-01', '08:00 PM')).toBe(true);
    expect(hasReservationConflict(existing, 'table_01', '2026-12-01', '06:30 PM')).toBe(false);

    const freeFor4 = findAvailableTablesForSlot(
      DEFAULT_TABLES,
      existing,
      '2026-12-01',
      '08:00 PM',
      4,
    );
    expect(freeFor4.some((t) => t.id === 'table_01')).toBe(false);
    expect(freeFor4.every((t) => t.capacity >= 4)).toBe(true);
  });

  it('computes recipe deductions once and prevents duplicate deductions on repeated calls', () => {
    const order = {
      items: [
        {
          productId: 'prod_chicken_burger',
          productName: 'Crispy Chicken Burger',
          imageUrl: '',
          addons: [],
          quantity: 3,
          unitPrice: 295,
          lineTotal: 885,
        },
      ],
      inventoryDeducted: false,
    };

    const firstPass = computeRecipeDeductions(order, DEFAULT_RECIPES);
    expect(firstPass.length).toBeGreaterThan(0);
    const chickenDed = firstPass.find((d) => d.inventoryItemId === 'inv_chicken_breast');
    expect(chickenDed?.quantityToDeduct).toBe(0.54);

    // Duplicate pass after flag flips must deduct zero
    const secondPass = computeRecipeDeductions(
      { ...order, inventoryDeducted: true },
      DEFAULT_RECIPES,
    );
    expect(secondPass).toEqual([]);
  });
});

describe('FoodVista Express API Endpoints', () => {
  let baseUrl = '';
  let server: ReturnType<typeof createServer>;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    const httpServer = createServer(app);
    const io = new SocketIOServer(httpServer);
    app.use('/api/v1', createApiRouter(io));
    server = httpServer;

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          baseUrl = `http://127.0.0.1:${addr.port}/api/v1`;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('GET /health reports Asia/Dhaka timezone and ok status', async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { status: string; timezone: string };
    expect(data.status).toBe('ok');
    expect(data.timezone).toBe('Asia/Dhaka');
  });

  it('POST /orders/calculate rejects unavailable food items with 409', async () => {
    const today = getDhakaDateString();
    const res = await fetch(`${baseUrl}/orders/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderType: 'delivery',
        deliveryArea: 'Banani',
        lines: [{ productId: 'prod_beef_burger', quantity: 1 }],
        products: DEFAULT_PRODUCTS,
        availabilityList: [
          {
            id: `prod_beef_burger_${today}`,
            productId: 'prod_beef_burger',
            date: today,
            isAvailable: false,
            unavailableMessage: 'আজ Beef Burger পাওয়া যাচ্ছে না।',
            openTime: '00:00',
            closeTime: '23:59',
          },
        ],
        settings: {
          deliveryChargeInsideDhaka: 60,
          deliveryChargeOutsideDhaka: 120,
          freeDeliveryThreshold: 1200,
        },
      }),
    });

    expect(res.status).toBe(409);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain('আজ Beef Burger পাওয়া যাচ্ছে না।');
  });

  it('POST /table-qr/verify validates authentic token and rejects tampered token', async () => {
    const signed = signTableQrToken('table_02', 3);

    const okRes = await fetch(`${baseUrl}/table-qr/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: signed.token,
        expectedSignature: signed.signature,
        expectedVersion: 3,
      }),
    });
    expect(okRes.status).toBe(200);

    const badRes = await fetch(`${baseUrl}/table-qr/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: signed.token,
        expectedSignature: signed.signature,
        expectedVersion: 4,
      }),
    });
    expect(badRes.status).toBe(403);
  });

  it('POST /payments/webhook verifies HMAC signature', async () => {
    const secret = 'test-webhook-secret';
    process.env.PAYMENT_WEBHOOK_SECRET = secret;
    const payload = { orderId: 'ord_123', status: 'paid' };
    const sig = crypto.createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');

    const bad = await fetch(`${baseUrl}/payments/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-foodvista-signature': 'invalid' },
      body: JSON.stringify(payload),
    });
    expect(bad.status).toBe(401);

    const ok = await fetch(`${baseUrl}/payments/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-foodvista-signature': sig },
      body: JSON.stringify(payload),
    });
    expect(ok.status).toBe(200);
  });
});

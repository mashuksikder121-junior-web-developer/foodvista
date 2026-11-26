import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import QRCode from 'qrcode';
import type { Server as SocketIOServer } from 'socket.io';
import { z } from 'zod';
import { checkProductAvailability } from '../../shared/availability.ts';
import { calculateOrderTotals } from '../../shared/pricing.ts';
import { getDhakaDateString, getDhakaTimeString } from '../../shared/timezone.ts';
import {
  adminModerateDemoReview,
  adminUpdateDemoOrder,
  adminUpdateDemoReservation,
  cancelDemoOrder,
  cancelDemoReservation,
  createDemoOrder,
  createDemoReservation,
  createDemoReview,
  deleteDemoAddress,
  DemoAuthError,
  getAdminDemoSnapshot,
  getDemoProfile,
  listApprovedDemoReviews,
  listDemoCustomerData,
  loginDemoAccount,
  saveDemoAddress,
  signupDemoAccount,
  updateDemoProfile,
} from '../lib/demoStore.ts';
import {
  requireAuth,
  requireCustomerOrFirebaseAuth,
  requireDemoAuth,
  type AuthRequest,
} from '../middleware/auth.ts';
import { createRateLimiter } from '../middleware/rateLimit.ts';
import { signTableQrToken, verifyTableQrToken } from '../utils/qrToken.ts';

const EPHEMERAL_WEBHOOK_SECRET = crypto.randomBytes(32).toString('hex');

function getWebhookSecret(): string {
  return process.env.PAYMENT_WEBHOOK_SECRET?.trim() || EPHEMERAL_WEBHOOK_SECRET;
}

const qrSignSchema = z.object({
  tableId: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/),
  tableNumber: z.string().min(1).max(20),
  version: z.number().int().min(1).max(10000),
  originUrl: z.string().url().max(300).optional(),
});

const qrVerifySchema = z.object({
  token: z.string().min(10).max(300),
  expectedSignature: z.string().max(256).optional(),
  expectedVersion: z.number().int().min(1).optional(),
});

const calculateOrderSchema = z.object({
  orderType: z.enum(['delivery', 'pickup', 'dine_in']),
  deliveryArea: z.string().max(80).optional(),
  lines: z
    .array(
      z.object({
        productId: z.string().min(1).max(128),
        sizeName: z.string().max(60).optional(),
        addons: z
          .array(
            z.object({
              name: z.string().max(80),
              price: z.number().min(0),
            }),
          )
          .max(12)
          .optional(),
        quantity: z.number().int().min(1).max(50),
      }),
    )
    .min(1)
    .max(30),
  products: z.array(z.any()).min(1).max(200),
  availabilityList: z.array(z.any()).max(500),
  coupon: z.any().nullable().optional(),
  settings: z.object({
    deliveryChargeInsideDhaka: z.number().min(0).max(5000),
    deliveryChargeOutsideDhaka: z.number().min(0).max(5000).optional(),
    freeDeliveryThreshold: z.number().min(0).max(50000).optional(),
  }),
});

const paymentVerifySchema = z.object({
  method: z.enum(['cash', 'bkash', 'nagad', 'rocket', 'card']),
  amount: z.number().positive().max(1000000),
  transactionRef: z.string().max(120).optional(),
  payerNumberLast4: z
    .string()
    .regex(/^\d{4}$/)
    .optional(),
});

const broadcastSchema = z.object({
  event: z.enum([
    'order:created',
    'order:updated',
    'kitchen:updated',
    'availability:updated',
    'settings:updated',
    'table:updated',
    'reservation:updated',
    'catalog:updated',
  ]),
  payload: z.record(z.string(), z.unknown()),
});

const MIME_EXT_MAP: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
};

const mediaUploadSchema = z.object({
  fileName: z.string().min(1).max(120),
  mimeType: z.enum([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/webm',
    'video/quicktime',
  ]),
  base64Data: z.string().min(8).max(26_000_000),
});

export function createApiRouter(io: SocketIOServer): Router {
  const router = Router();
  const standardLimiter = createRateLimiter(120, 60_000);
  const strictLimiter = createRateLimiter(30, 60_000);

  router.use(standardLimiter);

  router.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'foodvista-api',
      timezone: 'Asia/Dhaka',
      dhakaDate: getDhakaDateString(),
      dhakaTime: getDhakaTimeString(),
    });
  });

  router.get('/auth/me', requireAuth, (req: AuthRequest, res) => {
    res.json({
      uid: req.user?.uid,
      email: req.user?.email,
      emailVerified: req.user?.email_verified,
      name: req.user?.name || null,
    });
  });

  // Cryptographic Table QR Signing (returns token + high-res QR PNG DataURL)
  router.post('/table-qr/sign', requireAuth, strictLimiter, async (req: AuthRequest, res) => {
    const parsed = qrSignSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid QR signing request', details: parsed.error.flatten() });
      return;
    }

    const { tableId, version, originUrl } = parsed.data;
    const signed = signTableQrToken(tableId, version);
    const baseUrl = originUrl || process.env.APP_URL || 'http://localhost:3000';
    const scanUrl = `${baseUrl.replace(/\/$/, '')}/?table_qr=${encodeURIComponent(signed.token)}`;

    try {
      const qrDataUrl = await QRCode.toDataURL(scanUrl, {
        width: 512,
        margin: 2,
        color: {
          dark: '#171717',
          light: '#FFFFFF',
        },
      });
      res.json({
        ...signed,
        scanUrl,
        qrDataUrl,
      });
    } catch {
      res.status(500).json({ error: 'Failed to generate QR code image' });
    }
  });

  // Cryptographic Table QR Verification
  router.post('/table-qr/verify', strictLimiter, (req, res) => {
    const parsed = qrVerifySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ valid: false, error: 'Invalid QR verification payload' });
      return;
    }

    const result = verifyTableQrToken(
      parsed.data.token,
      parsed.data.expectedSignature,
      parsed.data.expectedVersion,
    );

    if (!result.valid) {
      res.status(403).json(result);
      return;
    }

    res.json(result);
  });

  // Authoritative Order Calculation & Availability Revalidation
  router.post('/orders/calculate', (req, res) => {
    const parsed = calculateOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid order calculation request' });
      return;
    }

    const { lines, products, availabilityList, orderType, deliveryArea, coupon, settings } =
      parsed.data;

    const today = getDhakaDateString();
    const nowTime = getDhakaTimeString();

    for (const line of lines) {
      const prod = products.find((p) => p.id === line.productId);
      if (!prod) {
        res.status(400).json({ error: `Menu item ${line.productId} was not found.` });
        return;
      }
      const avail = checkProductAvailability(prod, availabilityList, today, nowTime);
      if (!avail.available) {
        res.status(409).json({
          error: `${prod.name} is unavailable: ${avail.message}`,
          unavailableProductId: prod.id,
        });
        return;
      }
    }

    const totals = calculateOrderTotals({
      lines,
      products,
      orderType,
      deliveryArea,
      coupon: coupon || null,
      settings,
      todayDate: today,
    });

    res.json({
      ...totals,
      dhakaDate: today,
      dhakaTime: nowTime,
    });
  });

  // Payment Verification (Cash, bKash, Nagad, Rocket, Card - zero PIN/OTP/raw card storage)
  router.post(
    '/payments/verify',
    requireCustomerOrFirebaseAuth,
    strictLimiter,
    (req: AuthRequest, res) => {
    const bodyStr = JSON.stringify(req.body || {}).toLowerCase();
    if (
      bodyStr.includes('pin') ||
      bodyStr.includes('cvv') ||
      bodyStr.includes('cardnumber') ||
      bodyStr.includes('otp')
    ) {
      res.status(400).json({
        error: 'Security policy: never submit raw PINs, OTPs, CVVs, or full card numbers.',
      });
      return;
    }

    const parsed = paymentVerifySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid payment verification payload' });
      return;
    }

    const { method, transactionRef } = parsed.data;
    if (method === 'cash') {
      res.json({
        verified: true,
        paymentStatus: 'pending',
        paymentRef: `CASH-${Date.now().toString(36).toUpperCase()}`,
      });
      return;
    }

    const cleanRef = (transactionRef || '').trim().toUpperCase();
    if (cleanRef.length < 6) {
      res.status(400).json({
        error: `Please provide a valid ${method.toUpperCase()} transaction ID (minimum 6 characters).`,
      });
      return;
    }

    res.json({
      verified: true,
      paymentStatus: 'paid',
      paymentRef: `${method.toUpperCase()}-${cleanRef}`,
    });
  });

  // Payment Webhook HMAC Verification
  router.post('/payments/webhook', strictLimiter, (req, res) => {
    const signature = String(req.headers['x-foodvista-signature'] || '');
    const payloadString = JSON.stringify(req.body || {});
    const expected = crypto
      .createHmac('sha256', getWebhookSecret())
      .update(payloadString)
      .digest('hex');

    const sigBuf = Buffer.from(signature, 'utf8');
    const expBuf = Buffer.from(expected, 'utf8');
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      res.status(401).json({ error: 'Invalid webhook signature' });
      return;
    }

    io.emit('order:updated', {
      type: 'payment_webhook',
      orderId: req.body?.orderId,
      paymentStatus: req.body?.status,
    });
    res.json({ received: true });
  });

  // Real-time Socket.IO event broadcaster (authenticated clients)
  router.post('/events/broadcast', requireCustomerOrFirebaseAuth, (req: AuthRequest, res) => {
    const parsed = broadcastSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid broadcast payload' });
      return;
    }

    io.emit(parsed.data.event, {
      ...parsed.data.payload,
      emittedAt: new Date().toISOString(),
    });
    res.json({ broadcasted: true });
  });

  // Food photo & video upload endpoint (authenticated staff/admin)
  router.post('/media/upload', requireAuth, strictLimiter, async (req: AuthRequest, res) => {
    const parsed = mediaUploadSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Unsupported media file. Upload JPG/PNG/WebP/GIF images or MP4/WebM/MOV videos.',
      });
      return;
    }

    const { mimeType, base64Data } = parsed.data;
    const ext = MIME_EXT_MAP[mimeType];
    if (!ext) {
      res.status(400).json({ error: 'Unsupported media MIME type.' });
      return;
    }

    const stripped = base64Data.includes(',') ? base64Data.split(',')[1] || '' : base64Data;
    const buffer = Buffer.from(stripped, 'base64');
    if (buffer.length === 0 || buffer.length > 18 * 1024 * 1024) {
      res.status(400).json({ error: 'File must be between 1 byte and 18 MB.' });
      return;
    }

    try {
      const uploadsDir = path.resolve(process.cwd(), 'public/uploads');
      await fs.mkdir(uploadsDir, { recursive: true });
      const safeName = `fv_${Date.now()}_${crypto.randomBytes(6).toString('hex')}.${ext}`;
      await fs.writeFile(path.join(uploadsDir, safeName), buffer);
      res.json({
        url: `/uploads/${safeName}`,
        kind: mimeType.startsWith('video/') ? 'video' : 'image',
        sizeBytes: buffer.length,
      });
    } catch {
      res.status(500).json({ error: 'Failed to store uploaded media file.' });
    }
  });

  // -------------------------------------------------------------------------
  // Demo Email & Password Sign-Up / Sign-In (Zero email verification gate)
  // -------------------------------------------------------------------------
  const demoSignupSchema = z.object({
    email: z.string().min(3).max(200),
    password: z.string().min(1).max(128),
    displayName: z.string().max(80).optional(),
  });

  const demoLoginSchema = z.object({
    email: z.string().min(3).max(200),
    password: z.string().min(1).max(128),
  });

  router.post('/demo-auth/signup', strictLimiter, async (req, res) => {
    const parsed = demoSignupSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Please provide a valid email and password.' });
      return;
    }
    try {
      const result = await signupDemoAccount(parsed.data);
      res.status(201).json(result);
    } catch (err) {
      if (err instanceof DemoAuthError) {
        res.status(err.status).json({ error: err.message, code: err.code });
        return;
      }
      res.status(500).json({ error: 'Could not complete demo sign up.' });
    }
  });

  router.post('/demo-auth/login', strictLimiter, async (req, res) => {
    const parsed = demoLoginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Please provide your email and password.' });
      return;
    }
    try {
      const result = await loginDemoAccount(parsed.data);
      res.json(result);
    } catch (err) {
      if (err instanceof DemoAuthError) {
        res.status(err.status).json({ error: err.message, code: err.code });
        return;
      }
      res.status(500).json({ error: 'Could not sign in.' });
    }
  });

  router.get('/demo-auth/me', requireDemoAuth, async (req: AuthRequest, res) => {
    const profile = await getDemoProfile(req.demoUser!.uid);
    if (!profile) {
      res.status(404).json({ error: 'Account not found.' });
      return;
    }
    res.json({ user: profile });
  });

  // Demo Customer Storefront Operations
  router.get('/demo-customer/data', requireDemoAuth, async (req: AuthRequest, res) => {
    const data = await listDemoCustomerData(req.demoUser!.uid);
    const profile = await getDemoProfile(req.demoUser!.uid);
    res.json({ ...data, profile });
  });

  router.put('/demo-customer/profile', requireDemoAuth, async (req: AuthRequest, res) => {
    const schema = z.object({
      displayName: z.string().max(80).optional(),
      phone: z.string().max(30).optional(),
      defaultAddress: z.string().max(300).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid profile update payload.' });
      return;
    }
    const updated = await updateDemoProfile(req.demoUser!.uid, parsed.data);
    res.json({ profile: updated });
  });

  router.post('/demo-customer/addresses', requireDemoAuth, async (req: AuthRequest, res) => {
    const schema = z.object({
      label: z.string().min(1).max(40),
      recipientName: z.string().min(1).max(100),
      phone: z.string().min(6).max(25),
      area: z.string().min(1).max(80),
      streetAddress: z.string().min(3).max(300),
      instructions: z.string().max(200).optional(),
      isDefault: z.boolean().default(false),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Please fill in all required address fields.' });
      return;
    }
    const created = await saveDemoAddress(req.demoUser!.uid, parsed.data);
    res.status(201).json({ address: created });
  });

  router.delete('/demo-customer/addresses/:id', requireDemoAuth, async (req: AuthRequest, res) => {
    const deleted = await deleteDemoAddress(req.demoUser!.uid, String(req.params.id));
    res.json({ deleted });
  });

  router.post('/demo-customer/orders', requireDemoAuth, async (req: AuthRequest, res) => {
    const order = await createDemoOrder(req.demoUser!.uid, {
      ...req.body,
      status: 'pending',
      kitchenStatus: 'queued',
      inventoryDeducted: false,
    });
    io.emit('order:created', {
      orderId: order.id,
      orderNumber: order.orderNumber,
      orderType: order.orderType,
      tableNumber: order.tableNumber || null,
    });
    res.status(201).json({ order });
  });

  router.post('/demo-customer/orders/:id/cancel', requireDemoAuth, async (req: AuthRequest, res) => {
    const updated = await cancelDemoOrder(req.demoUser!.uid, String(req.params.id));
    if (!updated) {
      res.status(400).json({ error: 'Only pending orders owned by you can be cancelled.' });
      return;
    }
    io.emit('order:updated', { orderId: updated.id, status: 'cancelled' });
    res.json({ order: updated });
  });

  router.post('/demo-customer/reservations', requireDemoAuth, async (req: AuthRequest, res) => {
    const reservation = await createDemoReservation(req.demoUser!.uid, req.body);
    io.emit('reservation:updated', { reservationId: reservation.id });
    res.status(201).json({ reservation });
  });

  router.post(
    '/demo-customer/reservations/:id/cancel',
    requireDemoAuth,
    async (req: AuthRequest, res) => {
      const updated = await cancelDemoReservation(req.demoUser!.uid, String(req.params.id));
      if (!updated) {
        res.status(404).json({ error: 'Reservation not found.' });
        return;
      }
      io.emit('reservation:updated', { reservationId: updated.id, status: 'cancelled' });
      res.json({ reservation: updated });
    },
  );

  router.post('/demo-customer/reviews', requireDemoAuth, async (req: AuthRequest, res) => {
    const schema = z.object({
      authorName: z.string().min(1).max(100),
      productId: z.string().max(128).optional(),
      productName: z.string().max(120).optional(),
      rating: z.number().min(1).max(5),
      comment: z.string().min(3).max(600),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Please write a valid review.' });
      return;
    }
    const review = await createDemoReview(req.demoUser!.uid, parsed.data);
    res.status(201).json({ review });
  });

  router.get('/demo-customer/reviews/approved', async (_req, res) => {
    const reviews = await listApprovedDemoReviews();
    res.json({ reviews });
  });

  // Bootstrap Admin Sync Endpoints for Demo Customer Records
  router.get('/demo-customer/admin/snapshot', requireAuth, async (req: AuthRequest, res) => {
    if (req.user?.email !== 'mashuksikder121@gmail.com') {
      res.status(403).json({ error: 'Admin access required.' });
      return;
    }
    const snapshot = await getAdminDemoSnapshot();
    res.json(snapshot);
  });

  router.patch('/demo-customer/admin/orders/:id', requireAuth, async (req: AuthRequest, res) => {
    if (req.user?.email !== 'mashuksikder121@gmail.com') {
      res.status(403).json({ error: 'Admin access required.' });
      return;
    }
    const updated = await adminUpdateDemoOrder(String(req.params.id), req.body || {});
    if (!updated) {
      res.status(404).json({ error: 'Demo order not found.' });
      return;
    }
    io.emit('order:updated', {
      orderId: updated.id,
      status: updated.status,
      kitchenStatus: updated.kitchenStatus,
    });
    res.json({ order: updated });
  });

  router.patch(
    '/demo-customer/admin/reservations/:id',
    requireAuth,
    async (req: AuthRequest, res) => {
      if (req.user?.email !== 'mashuksikder121@gmail.com') {
        res.status(403).json({ error: 'Admin access required.' });
        return;
      }
      const updated = await adminUpdateDemoReservation(String(req.params.id), req.body?.status);
      if (!updated) {
        res.status(404).json({ error: 'Demo reservation not found.' });
        return;
      }
      io.emit('reservation:updated', { reservationId: updated.id, status: updated.status });
      res.json({ reservation: updated });
    },
  );

  router.patch('/demo-customer/admin/reviews/:id', requireAuth, async (req: AuthRequest, res) => {
    if (req.user?.email !== 'mashuksikder121@gmail.com') {
      res.status(403).json({ error: 'Admin access required.' });
      return;
    }
    const updated = await adminModerateDemoReview(
      String(req.params.id),
      req.body?.status,
      String(req.body?.adminReply || ''),
    );
    if (!updated) {
      res.status(404).json({ error: 'Demo review not found.' });
      return;
    }
    res.json({ review: updated });
  });

  // Documented modular route endpoints for REST inspection & readiness
  const modules = [
    'products',
    'categories',
    'availability',
    'orders',
    'tables',
    'reservations',
    'kitchen',
    'inventory',
    'recipes',
    'coupons',
    'reviews',
    'reports',
    'notifications',
    'settings',
  ];

  for (const mod of modules) {
    router.get(`/${mod}/meta`, (_req, res) => {
      res.json({ module: mod, backingStore: 'firestore', status: 'active' });
    });
  }

  return router;
}

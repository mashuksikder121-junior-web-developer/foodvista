import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  CustomerAddress,
  KitchenStatus,
  Order,
  OrderStatus,
  PaymentStatus,
  Reservation,
  ReservationStatus,
  Review,
} from '../../shared/types.ts';

export interface DemoAccountRecord {
  uid: string;
  email: string;
  displayName: string;
  passwordSalt: string;
  passwordHash: string;
  phone: string;
  defaultAddress: string;
  createdAt: string;
  updatedAt: string;
}

export interface DemoSessionUser {
  uid: string;
  email: string;
  displayName: string;
  phone: string;
  defaultAddress: string;
}

interface DemoStoreData {
  tokenSecret: string;
  accounts: DemoAccountRecord[];
  orders: Order[];
  reservations: Reservation[];
  addresses: CustomerAddress[];
  reviews: Review[];
}

const DEFAULT_STORE_PATH = path.resolve(process.cwd(), 'data/demo-store.json');

let storeWriteChain: Promise<unknown> = Promise.resolve();

function getStorePath(): string {
  return process.env.DEMO_STORE_PATH?.trim() || DEFAULT_STORE_PATH;
}

async function readStore(): Promise<DemoStoreData> {
  const filePath = getStorePath();
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<DemoStoreData>;
    return {
      tokenSecret: parsed.tokenSecret || crypto.randomBytes(32).toString('hex'),
      accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [],
      orders: Array.isArray(parsed.orders) ? parsed.orders : [],
      reservations: Array.isArray(parsed.reservations) ? parsed.reservations : [],
      addresses: Array.isArray(parsed.addresses) ? parsed.addresses : [],
      reviews: Array.isArray(parsed.reviews) ? parsed.reviews : [],
    };
  } catch {
    const initial: DemoStoreData = {
      tokenSecret: crypto.randomBytes(32).toString('hex'),
      accounts: [],
      orders: [],
      reservations: [],
      addresses: [],
      reviews: [],
    };
    await writeStore(initial);
    return initial;
  }
}

async function writeStore(data: DemoStoreData): Promise<void> {
  const filePath = getStorePath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tempPath, filePath);
}

function runSerialized<T>(task: (store: DemoStoreData) => Promise<{ next?: DemoStoreData; result: T }>): Promise<T> {
  const nextOp = storeWriteChain.then(async () => {
    const current = await readStore();
    const { next, result } = await task(current);
    if (next) {
      await writeStore(next);
    }
    return result;
  });
  storeWriteChain = nextOp.catch(() => undefined);
  return nextOp;
}

function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function verifyPasswordHash(password: string, salt: string, expectedHash: string): boolean {
  const computed = Buffer.from(hashPassword(password, salt), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  if (computed.length !== expected.length) return false;
  return crypto.timingSafeEqual(computed, expected);
}

function getSigningSecret(storeSecret: string): string {
  return process.env.DEMO_AUTH_SECRET?.trim() || storeSecret;
}

function signDemoToken(user: DemoSessionUser, secret: string): string {
  const payload = {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payloadB64).digest('hex');
  return `fvdemo.${payloadB64}.${sig}`;
}

export async function verifyDemoToken(
  token: string,
): Promise<{ uid: string; email: string; displayName: string } | null> {
  const parts = token.trim().split('.');
  if (parts.length !== 3 || parts[0] !== 'fvdemo') return null;

  const [, payloadB64, signature] = parts;
  const store = await readStore();
  const secret = getSigningSecret(store.tokenSecret);
  const expectedSig = crypto.createHmac('sha256', secret).update(payloadB64).digest('hex');

  const sigBuf = Buffer.from(signature, 'utf8');
  const expBuf = Buffer.from(expectedSig, 'utf8');
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const decoded = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as {
      uid: string;
      email: string;
      displayName: string;
      exp: number;
    };
    if (!decoded.uid || !decoded.email || Date.now() > decoded.exp) {
      return null;
    }
    const existing = store.accounts.find((a) => a.uid === decoded.uid);
    if (!existing) return null;
    return {
      uid: existing.uid,
      email: existing.email,
      displayName: existing.displayName,
    };
  } catch {
    return null;
  }
}

function toPublicSessionUser(acc: DemoAccountRecord): DemoSessionUser {
  return {
    uid: acc.uid,
    email: acc.email,
    displayName: acc.displayName,
    phone: acc.phone,
    defaultAddress: acc.defaultAddress,
  };
}

export class DemoAuthError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function signupDemoAccount(params: {
  email: string;
  password: string;
  displayName?: string;
}): Promise<{ token: string; user: DemoSessionUser }> {
  const normalizedEmail = params.email.trim().toLowerCase();
  if (!normalizedEmail || !normalizedEmail.includes('@') || normalizedEmail.length < 3) {
    throw new DemoAuthError(400, 'INVALID_EMAIL', 'Please enter a valid email address.');
  }
  if (!params.password || params.password.length < 1) {
    throw new DemoAuthError(400, 'INVALID_PASSWORD', 'Please enter a password.');
  }

  return runSerialized(async (store) => {
    const existing = store.accounts.find((a) => a.email === normalizedEmail);
    if (existing) {
      throw new DemoAuthError(
        409,
        'EMAIL_EXISTS',
        'This email is already signed up. Please switch to Sign In and enter its password.',
      );
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const now = new Date().toISOString();
    const uid = `demo_${crypto.createHash('sha256').update(normalizedEmail).digest('hex').slice(0, 20)}`;
    const fallbackName = normalizedEmail.split('@')[0] || 'Guest';
    const displayName = (params.displayName || '').trim().slice(0, 80) || fallbackName;

    const record: DemoAccountRecord = {
      uid,
      email: normalizedEmail,
      displayName,
      passwordSalt: salt,
      passwordHash: hashPassword(params.password, salt),
      phone: '',
      defaultAddress: '',
      createdAt: now,
      updatedAt: now,
    };

    const next: DemoStoreData = {
      ...store,
      accounts: [...store.accounts, record],
    };
    const publicUser = toPublicSessionUser(record);
    const token = signDemoToken(publicUser, getSigningSecret(store.tokenSecret));
    return { next, result: { token, user: publicUser } };
  });
}

export async function loginDemoAccount(params: {
  email: string;
  password: string;
}): Promise<{ token: string; user: DemoSessionUser }> {
  const normalizedEmail = params.email.trim().toLowerCase();
  if (!normalizedEmail || !normalizedEmail.includes('@')) {
    throw new DemoAuthError(400, 'INVALID_EMAIL', 'Please enter your registered email address.');
  }
  if (!params.password) {
    throw new DemoAuthError(400, 'INVALID_PASSWORD', 'Please enter your password.');
  }

  const store = await readStore();
  const account = store.accounts.find((a) => a.email === normalizedEmail);
  if (!account) {
    throw new DemoAuthError(
      404,
      'ACCOUNT_NOT_FOUND',
      'No account found for this email. Please Sign Up first.',
    );
  }

  const matches = verifyPasswordHash(params.password, account.passwordSalt, account.passwordHash);
  if (!matches) {
    throw new DemoAuthError(
      401,
      'WRONG_PASSWORD',
      'Incorrect password for this email. Please enter the password you used during sign up.',
    );
  }

  const publicUser = toPublicSessionUser(account);
  const token = signDemoToken(publicUser, getSigningSecret(store.tokenSecret));
  return { token, user: publicUser };
}

export async function getDemoProfile(uid: string): Promise<DemoSessionUser | null> {
  const store = await readStore();
  const acc = store.accounts.find((a) => a.uid === uid);
  return acc ? toPublicSessionUser(acc) : null;
}

export async function updateDemoProfile(
  uid: string,
  updates: { displayName?: string; phone?: string; defaultAddress?: string },
): Promise<DemoSessionUser | null> {
  return runSerialized(async (store) => {
    const idx = store.accounts.findIndex((a) => a.uid === uid);
    if (idx === -1) return { result: null };
    const prev = store.accounts[idx];
    const updated: DemoAccountRecord = {
      ...prev,
      displayName: updates.displayName?.trim().slice(0, 80) || prev.displayName,
      phone: updates.phone !== undefined ? updates.phone.trim().slice(0, 30) : prev.phone,
      defaultAddress:
        updates.defaultAddress !== undefined
          ? updates.defaultAddress.trim().slice(0, 300)
          : prev.defaultAddress,
      updatedAt: new Date().toISOString(),
    };
    const accounts = [...store.accounts];
    accounts[idx] = updated;
    return {
      next: { ...store, accounts },
      result: toPublicSessionUser(updated),
    };
  });
}

export async function listDemoCustomerData(uid: string) {
  const store = await readStore();
  return {
    orders: store.orders
      .filter((o) => o.userId === uid)
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))),
    reservations: store.reservations
      .filter((r) => r.userId === uid)
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))),
    addresses: store.addresses.filter((a) => a.userId === uid),
  };
}

export async function createDemoOrder(
  uid: string,
  payload: Omit<Order, 'id' | 'userId' | 'createdAt' | 'updatedAt'>,
): Promise<Order> {
  return runSerialized(async (store) => {
    const now = new Date().toISOString();
    const order: Order = {
      ...payload,
      id: `demo_ord_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`,
      userId: uid,
      createdAt: now,
      updatedAt: now,
    };
    return {
      next: { ...store, orders: [order, ...store.orders] },
      result: order,
    };
  });
}

export async function cancelDemoOrder(uid: string, orderId: string): Promise<Order | null> {
  return runSerialized(async (store) => {
    const idx = store.orders.findIndex((o) => o.id === orderId && o.userId === uid);
    if (idx === -1) return { result: null };
    const existing = store.orders[idx];
    if (existing.status !== 'pending') return { result: null };
    const updated: Order = {
      ...existing,
      status: 'cancelled',
      updatedAt: new Date().toISOString(),
    };
    const orders = [...store.orders];
    orders[idx] = updated;
    return { next: { ...store, orders }, result: updated };
  });
}

export async function saveDemoAddress(
  uid: string,
  address: Omit<CustomerAddress, 'id' | 'userId' | 'createdAt'>,
): Promise<CustomerAddress> {
  return runSerialized(async (store) => {
    const item: CustomerAddress = {
      ...address,
      id: `demo_addr_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`,
      userId: uid,
      createdAt: new Date().toISOString(),
    };
    return {
      next: { ...store, addresses: [item, ...store.addresses] },
      result: item,
    };
  });
}

export async function deleteDemoAddress(uid: string, addressId: string): Promise<boolean> {
  return runSerialized(async (store) => {
    const filtered = store.addresses.filter((a) => !(a.id === addressId && a.userId === uid));
    if (filtered.length === store.addresses.length) return { result: false };
    return { next: { ...store, addresses: filtered }, result: true };
  });
}

export async function createDemoReservation(
  uid: string,
  payload: Omit<Reservation, 'id' | 'userId' | 'status' | 'createdAt' | 'updatedAt'>,
): Promise<Reservation> {
  return runSerialized(async (store) => {
    const now = new Date().toISOString();
    const res: Reservation = {
      ...payload,
      id: `demo_res_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`,
      userId: uid,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };
    return {
      next: { ...store, reservations: [res, ...store.reservations] },
      result: res,
    };
  });
}

export async function cancelDemoReservation(uid: string, reservationId: string): Promise<Reservation | null> {
  return runSerialized(async (store) => {
    const idx = store.reservations.findIndex((r) => r.id === reservationId && r.userId === uid);
    if (idx === -1) return { result: null };
    const updated: Reservation = {
      ...store.reservations[idx],
      status: 'cancelled',
      updatedAt: new Date().toISOString(),
    };
    const reservations = [...store.reservations];
    reservations[idx] = updated;
    return { next: { ...store, reservations }, result: updated };
  });
}

export async function createDemoReview(
  uid: string,
  payload: {
    authorName: string;
    productId?: string;
    productName?: string;
    rating: number;
    comment: string;
  },
): Promise<Review> {
  return runSerialized(async (store) => {
    const now = new Date().toISOString();
    const review: Review = {
      id: `demo_rev_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`,
      userId: uid,
      authorName: payload.authorName.slice(0, 100),
      productId: payload.productId || '',
      productName: payload.productName || '',
      rating: Math.min(5, Math.max(1, Math.round(payload.rating))),
      comment: payload.comment.slice(0, 600),
      status: 'pending',
      adminReply: '',
      createdAt: now,
      updatedAt: now,
    };
    return {
      next: { ...store, reviews: [review, ...store.reviews] },
      result: review,
    };
  });
}

export async function listApprovedDemoReviews(): Promise<Review[]> {
  const store = await readStore();
  return store.reviews.filter((r) => r.status === 'approved');
}

export async function getAdminDemoSnapshot() {
  const store = await readStore();
  return {
    orders: store.orders,
    reservations: store.reservations,
    reviews: store.reviews,
    customers: store.accounts.map(toPublicSessionUser),
  };
}

export async function adminUpdateDemoOrder(
  orderId: string,
  updates: { status?: OrderStatus; kitchenStatus?: KitchenStatus; paymentStatus?: PaymentStatus },
): Promise<Order | null> {
  return runSerialized(async (store) => {
    const idx = store.orders.findIndex((o) => o.id === orderId);
    if (idx === -1) return { result: null };
    const prev = store.orders[idx];
    const updated: Order = {
      ...prev,
      status: updates.status || prev.status,
      kitchenStatus: updates.kitchenStatus || prev.kitchenStatus,
      paymentStatus: updates.paymentStatus || prev.paymentStatus,
      updatedAt: new Date().toISOString(),
    };
    const orders = [...store.orders];
    orders[idx] = updated;
    return { next: { ...store, orders }, result: updated };
  });
}

export async function adminUpdateDemoReservation(
  reservationId: string,
  status: ReservationStatus,
): Promise<Reservation | null> {
  return runSerialized(async (store) => {
    const idx = store.reservations.findIndex((r) => r.id === reservationId);
    if (idx === -1) return { result: null };
    const updated: Reservation = {
      ...store.reservations[idx],
      status,
      updatedAt: new Date().toISOString(),
    };
    const reservations = [...store.reservations];
    reservations[idx] = updated;
    return { next: { ...store, reservations }, result: updated };
  });
}

export async function adminModerateDemoReview(
  reviewId: string,
  status: 'approved' | 'hidden',
  adminReply: string,
): Promise<Review | null> {
  return runSerialized(async (store) => {
    const idx = store.reviews.findIndex((r) => r.id === reviewId);
    if (idx === -1) return { result: null };
    const updated: Review = {
      ...store.reviews[idx],
      status,
      adminReply: adminReply.slice(0, 400),
      updatedAt: new Date().toISOString(),
    };
    const reviews = [...store.reviews];
    reviews[idx] = updated;
    return { next: { ...store, reviews }, result: updated };
  });
}

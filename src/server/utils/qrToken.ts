import crypto from 'node:crypto';

const EPHEMERAL_FALLBACK_SECRET = crypto.randomBytes(32).toString('hex');

function getQrSecret(): string {
  return process.env.QR_TOKEN_SECRET?.trim() || EPHEMERAL_FALLBACK_SECRET;
}

export interface SignedQrPayload {
  token: string;
  tableId: string;
  version: number;
  signature: string;
}

export function signTableQrToken(tableId: string, version: number): SignedQrPayload {
  const payload = `${tableId}.${version}`;
  const signature = crypto
    .createHmac('sha256', getQrSecret())
    .update(payload)
    .digest('hex')
    .slice(0, 32);

  return {
    token: `fvqr.${tableId}.${version}.${signature}`,
    tableId,
    version,
    signature,
  };
}

export function parseTableQrToken(token: string): {
  tableId: string;
  version: number;
  signature: string;
} | null {
  const parts = token.trim().split('.');
  if (parts.length !== 4 || parts[0] !== 'fvqr') {
    return null;
  }
  const [, tableId, versionStr, signature] = parts;
  const version = Number(versionStr);
  if (
    !tableId ||
    !/^[a-zA-Z0-9_-]{1,128}$/.test(tableId) ||
    !Number.isInteger(version) ||
    version < 1 ||
    !/^[a-f0-9]{16,64}$/.test(signature)
  ) {
    return null;
  }
  return { tableId, version, signature };
}

export function verifyTableQrToken(
  token: string,
  expectedSignature?: string,
  expectedVersion?: number,
): { valid: boolean; tableId?: string; version?: number; reason?: string } {
  const parsed = parseTableQrToken(token);
  if (!parsed) {
    return { valid: false, reason: 'Invalid QR token format.' };
  }

  if (expectedVersion !== undefined && parsed.version !== expectedVersion) {
    return { valid: false, reason: 'This QR code has been revoked or superseded.' };
  }

  const expectedHmac = crypto
    .createHmac('sha256', getQrSecret())
    .update(`${parsed.tableId}.${parsed.version}`)
    .digest('hex')
    .slice(0, 32);

  const sigBuf = Buffer.from(parsed.signature, 'utf8');
  const hmacBuf = Buffer.from(expectedHmac, 'utf8');

  const hmacValid = sigBuf.length === hmacBuf.length && crypto.timingSafeEqual(sigBuf, hmacBuf);

  if (!hmacValid && expectedSignature) {
    const storedBuf = Buffer.from(expectedSignature, 'utf8');
    const storedValid =
      sigBuf.length === storedBuf.length && crypto.timingSafeEqual(sigBuf, storedBuf);
    if (!storedValid) {
      return { valid: false, reason: 'QR token signature verification failed.' };
    }
  } else if (!hmacValid) {
    return { valid: false, reason: 'QR token signature verification failed.' };
  }

  return {
    valid: true,
    tableId: parsed.tableId,
    version: parsed.version,
  };
}

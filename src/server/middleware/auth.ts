import type { NextFunction, Request, Response } from 'express';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { verifyDemoToken } from '../lib/demoStore.ts';
import { adminAuth } from '../lib/firebase-admin.ts';

export interface DemoAuthIdentity {
  uid: string;
  email: string;
  displayName: string;
}

export interface AuthRequest extends Request {
  user?: DecodedIdToken;
  demoUser?: DemoAuthIdentity;
}

function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  return token || null;
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const token = extractBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Unauthorized: Missing bearer token' });
    return;
  }

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    if (!decoded.email_verified) {
      res.status(403).json({ error: 'Forbidden: Verified email required' });
      return;
    }
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
  }
}

export async function requireDemoAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const token = extractBearerToken(req);
  if (!token || !token.startsWith('fvdemo.')) {
    res.status(401).json({ error: 'Unauthorized: Missing demo session token' });
    return;
  }
  const verified = await verifyDemoToken(token);
  if (!verified) {
    res.status(401).json({ error: 'Unauthorized: Invalid or expired demo session' });
    return;
  }
  req.demoUser = verified;
  next();
}

export async function requireCustomerOrFirebaseAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  const token = extractBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Unauthorized: Missing bearer token' });
    return;
  }

  if (token.startsWith('fvdemo.')) {
    const verified = await verifyDemoToken(token);
    if (!verified) {
      res.status(401).json({ error: 'Unauthorized: Invalid or expired demo session' });
      return;
    }
    req.demoUser = verified;
    next();
    return;
  }

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    if (!decoded.email_verified) {
      res.status(403).json({ error: 'Forbidden: Verified email required' });
      return;
    }
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
  }
}

export async function optionalAuth(req: AuthRequest, _res: Response, next: NextFunction) {
  const token = extractBearerToken(req);
  if (token) {
    if (token.startsWith('fvdemo.')) {
      const verified = await verifyDemoToken(token);
      if (verified) req.demoUser = verified;
    } else {
      try {
        req.user = await adminAuth.verifyIdToken(token);
      } catch {
        // Ignore invalid optional token
      }
    }
  }
  next();
}

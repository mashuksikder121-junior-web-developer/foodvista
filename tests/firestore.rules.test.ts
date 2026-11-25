import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Firestore Security Rules & Blueprint Invariants', () => {
  const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
  const blueprintPath = path.resolve(process.cwd(), 'firebase-blueprint.json');
  const rules = fs.readFileSync(rulesPath, 'utf8');
  const blueprint = JSON.parse(fs.readFileSync(blueprintPath, 'utf8')) as {
    firestore: Record<string, unknown>;
  };

  it('denies all reads and writes by default', () => {
    expect(rules).toContain('match /{document=**}');
    expect(rules).toContain('allow read, write: if false;');
  });

  it('enforces server-side email verification and owner/role checks', () => {
    expect(rules).toContain('request.auth != null && request.auth.token.email_verified == true');
    expect(rules).toContain('mashuksikder121@gmail.com');
  });

  it('protects orders, reservations, coupons, and reviews against privilege escalation', () => {
    // Customers must start orders in pending / queued / non-deducted / pending payment
    expect(rules).toContain("incoming().status == 'pending'");
    expect(rules).toContain("incoming().kitchenStatus == 'queued'");
    expect(rules).toContain('incoming().inventoryDeducted == false');
    expect(rules).toContain("incoming().paymentStatus == 'pending' || isStaffOperational()");

    // Terminal order states locked against non-admin mutations
    expect(rules).toContain("!(existing().status in ['completed', 'cancelled'] && !isAdmin())");

    // Dine-in orders and reservations verify active table exists
    expect(rules).toContain('tables/$(incoming().tableId)).data.isActive == true');

    // Reviews created pending without forged adminReply
    expect(rules).toContain("incoming().adminReply == ''");

    // Audit logs and stock movements are append-only
    expect(rules).toContain('allow update, delete: if false;');
  });

  it('supports product videoUrl and strict active staff/termination controls in rules', () => {
    expect(rules).toContain("'videoUrl'");
    expect(rules).toContain("isOptStr(data, 'videoUrl', 500)");
    expect(rules).toContain("data.status in ['active', 'suspended', 'terminated']");
    expect(rules).toContain("'permissions'");
    expect(rules).toContain("status == 'active'");
  });

  it('keeps firebase-blueprint.json synchronized with core collections', () => {
    const requiredPaths = [
      '/categories/{categoryId}',
      '/products/{productId}',
      '/availability/{availabilityId}',
      '/tables/{tableId}',
      '/orders/{orderId}',
      '/reservations/{reservationId}',
      '/inventory/{itemId}',
      '/recipes/{productId}',
      '/coupons/{couponId}',
      '/reviews/{reviewId}',
      '/settings/{settingId}',
      '/auditLogs/{logId}',
    ];
    for (const p of requiredPaths) {
      expect(blueprint.firestore).toHaveProperty(p);
    }
  });
});

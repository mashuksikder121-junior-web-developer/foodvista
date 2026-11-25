# FoodVista Security Specification (Phase 0 TDD)

## 1. Data Invariants

1. **Identity & Role Integrity**: Customers cannot self-assign `role: 'admin'`, `super_admin`, `manager`, `cashier`, `chef`, or `delivery` on `/users/{uid}`, `/staff/{uid}`, or `/admins/{uid}`.
2. **PII Isolation**: User phone, email, and saved delivery addresses live in `/users/{uid}/private/info` and `/users/{uid}/addresses/{addressId}` and are readable ONLY by the owning user or an active admin/manager. Orders containing `customerPhone` and `deliveryAddress` are readable ONLY by `resource.data.userId == request.auth.uid` or active staff.
3. **Order Immutability & Workflow Integrity**: Customers can only create orders for their own `userId` with initial `status == 'pending'`, `kitchenStatus == 'queued'`, and `inventoryDeducted == false`. Customers cannot alter `totalAmount`, `paymentStatus`, or jump order status to `completed` or `delivered`.
4. **Daily Availability & Catalog Protection**: Only Admin/Manager staff can write to `/categories`, `/products`, `/availability`, `/settings`, `/coupons`, `/tables`, `/inventory`, `/recipes`, `/expenses`.
5. **Temporal Integrity**: All `createdAt` and `updatedAt` timestamps on protected writes use `request.time` (`timestamp`) validation.
6. **Size & Type Bounds**: Every document ID matches `^[a-zA-Z0-9_\-]+$` (<= 128 chars), and every string and array has explicit upper length bounds to prevent Denial of Wallet attacks.
7. **Terminal State Locking**: Once an order reaches `completed` or `cancelled`, non-admin users cannot mutate it.
8. **Review Moderation**: Newly submitted customer reviews must start with `status == 'pending'` and `adminReply == ''`; only admin/manager can approve, hide, or reply.

## 2. The "Dirty Dozen" Adversarial Payloads

1. **Self-Admin Escalation**: Authenticated customer tries to create `/users/{uid}` with `role: "super_admin"`. -> **MUST DENY**.
2. **Shadow Ghost Field Injection**: Authenticated customer creates an order with an extra undeclared field `isVerifiedPaid: true` or `bypassAvailability: true`. -> **MUST DENY**.
3. **Order Price/Status Spoofing**: Authenticated customer creates an order with `status: "completed"`, `paymentStatus: "paid"`, or `inventoryDeducted: true`. -> **MUST DENY**.
4. **Cross-Tenant Order Read / List**: Customer A attempts `get` or `list` on `/orders` without `where('userId', '==', customerA.uid)` or tries reading Customer B's order. -> **MUST DENY**.
5. **Cross-Tenant PII Read**: Customer A attempts to read `/users/{customerB}/private/info` or `/users/{customerB}/addresses/{addrId}`. -> **MUST DENY**.
6. **Unverified Email Spoofing**: User with `email: "mashuksikder121@gmail.com"` but `email_verified: false` attempts admin write to `/products`. -> **MUST DENY**.
7. **ID Poisoning Attack**: Attacker attempts to create `/orders/{1500_char_junk_id}`. -> **MUST DENY**.
8. **Catalog Tampering by Customer**: Authenticated customer attempts to update price in `/products/{id}` or toggle `/availability/{id}` to `isAvailable: true`. -> **MUST DENY**.
9. **Coupon Counter Tampering**: Authenticated customer attempts to increment/reset `/coupons/{id}` `usedCount` or modify `discountValue`. -> **MUST DENY**.
10. **Review Auto-Approval Bypass**: Authenticated customer creates `/reviews/{id}` with `status: "approved"` or `rating: 99`. -> **MUST DENY**.
11. **Terminal Order Mutation**: Customer attempts to cancel or edit `/orders/{id}` after status is `'delivered'` or `'completed'`. -> **MUST DENY**.
12. **Audit Log Deletion / Forgery**: Staff or customer attempts to `delete` or `update` an entry in `/auditLogs/{logId}` or `/stockMovements/{movementId}`. -> **MUST DENY**.

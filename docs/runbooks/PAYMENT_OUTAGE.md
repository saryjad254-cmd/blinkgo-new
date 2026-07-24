# Payment Provider Outage Runbook

> **When to use**: Stripe webhook failures, API errors, or complete Stripe outage.

## Symptoms

- Stripe webhooks returning 5xx
- Customer payments failing
- Dashboard shows increased payment errors
- Stripe status page: https://status.stripe.com

## Immediate Actions (T+0 to T+5)

### 1. Verify the Outage
```bash
# Test Stripe API
curl -H "Authorization: Bearer $STRIPE_SECRET_KEY" \
  https://api.stripe.com/v1/charges?limit=1 | jq '.data | length'

# Check Stripe status
curl https://status.stripe.com/api/v2/summary.json | jq '.incidents'

# Check our error rate
curl http://localhost:3000/api/metrics | grep stripe_errors
```

### 2. Enable Cash-Only Fallback
```bash
# Switch all restaurants to cash-only mode
# Via admin endpoint:
curl -X POST https://app.blinkgo.com/api/admin/payment-modes \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"mode": "cash_only", "reason": "Stripe outage"}'

# Or via DB:
psql "$DATABASE_URL" -c "
  UPDATE restaurants
  SET accepts_online_payment = false
  WHERE accepts_online_payment = true;
"
```

### 3. Notify Customers
```bash
# Post status page update
curl -X POST https://status.blinkgo.com/api/incidents \
  -H "Authorization: Bearer $STATUS_PAGE_TOKEN" \
  -d '{
    "name": "Online payments temporarily unavailable",
    "status": "investigating",
    "message": "We are experiencing issues with our payment provider. Cash on delivery is still available.",
    "components": ["payments"]
  }'
```

## During Outage

### Customer-Facing
- Show banner: "Online payments temporarily unavailable. Please choose cash on delivery."
- Add payment method 'cash_on_delivery' as default selected
- Allow customers to retry online payment (don't auto-fail)

### Order Processing
- Continue accepting orders with cash payment
- Hold online-payment orders in `awaiting_payment` status
- Retry queue: every 60s for 10 minutes, then 5min for 1 hour

```typescript
// In payment retry queue
async function retryFailedPayments() {
  const pending = await db.orders.findAll({
    where: {
      payment_status: 'pending',
      payment_method: 'card',
      created_at: { $lt: new Date(Date.now() - 60_000) }
    }
  });

  for (const order of pending) {
    try {
      await stripe.charges.create({
        amount: order.total * 100,
        currency: 'eur',
        source: order.payment_intent_id,
      });
      await db.orders.update(order.id, { payment_status: 'paid' });
    } catch (e) {
      // Continue retrying
    }
  }
}
```

## Stripe Webhook Recovery

### Replay Failed Webhooks
```bash
# List failed webhook deliveries
stripe events list --type checkout.session.completed --limit 100

# Replay specific event
stripe events resend evt_xxxxx
```

### Verify Webhook Endpoint
```bash
# Send test webhook
stripe trigger checkout.session.completed

# Check our endpoint received it
tail -f /var/log/blinkgo/app.log | grep "stripe"
```

## Recovery (Stripe Back Online)

### 1. Verify Connectivity
```bash
curl -H "Authorization: Bearer $STRIPE_SECRET_KEY" \
  https://api.stripe.com/v1/charges?limit=1
```

### 2. Process Held Orders
```bash
# Manually retry held orders
psql "$DATABASE_URL" -c "
  SELECT id, total, created_at
  FROM orders
  WHERE payment_status = 'pending'
  ORDER BY created_at ASC;
"
# (then trigger retry for each)
```

### 3. Re-enable Online Payments
```bash
curl -X POST https://app.blinkgo.com/api/admin/payment-modes \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"mode": "all", "reason": "Stripe recovered"}'
```

### 4. Update Status Page
```bash
curl -X PATCH https://status.blinkgo.com/api/incidents/$INCIDENT_ID \
  -H "Authorization: Bearer $STATUS_PAGE_TOKEN" \
  -d '{"status": "resolved", "message": "Online payments restored."}'
```

## Post-Outage

- [ ] Verify all held orders completed
- [ ] Reconcile payments with Stripe Dashboard
- [ ] Issue refunds for duplicate charges (if any)
- [ ] Customer support outreach for affected orders
- [ ] Post-mortem and improvement items

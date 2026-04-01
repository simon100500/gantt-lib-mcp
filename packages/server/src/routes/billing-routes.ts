/**
 * Billing REST routes — YooKassa payment integration
 *
 * Endpoints:
 * - POST /api/billing/create   — create embedded payment (D-03, D-04)
 * - GET  /api/billing/status   — poll payment status from YooKassa
 * - POST /api/billing/webhook  — YooKassa webhook (no auth)
 * - GET  /api/billing/subscription — current plan & usage
 * - GET  /api/billing/payments — payment history
 */

import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth-middleware.js';
import { BillingService } from '../services/billing-service.js';
import { PLAN_CONFIG, getPlanPricing, type PlanKey } from '../services/plan-config.js';

const YOOKASSA_BASE_URL = 'https://api.yookassa.ru/v3';

const VALID_BILLING_PLANS: PlanKey[] = ['start', 'team']; // D-02: no free or enterprise

function getPeriodDisplay(period: string): string {
  return period === 'monthly' ? '1 месяц' : '1 год';
}

function getShopCredentials(): { shopId: string; secretKey: string } {
  const shopId = process.env.YOOKASSA_SHOP_ID ?? '';
  const secretKey = process.env.YOOKASSA_SECRET_KEY ?? '';
  return { shopId, secretKey };
}

function yookassaHeaders(shopId: string, secretKey: string, idempotenceKey: string): Record<string, string> {
  return {
    'Authorization': 'Basic ' + Buffer.from(`${shopId}:${secretKey}`).toString('base64'),
    'Idempotence-Key': idempotenceKey,
    'Content-Type': 'application/json',
  };
}

export async function registerBillingRoutes(fastify: FastifyInstance): Promise<void> {
  const billingService = new BillingService();

  // ---------------------------------------------------------------------------
  // POST /api/billing/create — create YooKassa embedded payment (D-03, D-04)
  // ---------------------------------------------------------------------------
  fastify.post('/api/billing/create', { preHandler: [authMiddleware] }, async (req, reply) => {
    const body = req.body as { plan?: string; period?: string };
    const plan = body?.plan as PlanKey | undefined;
    const period = body?.period as 'monthly' | 'yearly' | undefined;

    // Validate plan
    if (!plan || !VALID_BILLING_PLANS.includes(plan)) {
      return reply.status(400).send({ error: 'Invalid plan. Available: start, team' });
    }
    if (!period || !['monthly', 'yearly'].includes(period)) {
      return reply.status(400).send({ error: 'Invalid period. Available: monthly, yearly' });
    }

    // Check YooKassa credentials
    const { shopId, secretKey } = getShopCredentials();
    if (!shopId || !secretKey) {
      return reply.status(500).send({ error: 'Payment provider not configured' });
    }

    // Get price
    const price = getPlanPricing(plan, period);
    if (price <= 0) {
      return reply.status(400).send({ error: 'Invalid price for plan' });
    }

    const periodDisplay = getPeriodDisplay(period);
    const baseDescription = PLAN_CONFIG[plan]?.pricing.description ?? 'Сервис ГетГант';
    const description = `${baseDescription}, ${periodDisplay}`;
    const priceStr = `${price}.00`;
    const idempotenceKey = crypto.randomUUID();

    // Create YooKassa payment via REST API v3
    try {
      const yooResponse = await fetch(`${YOOKASSA_BASE_URL}/payments`, {
        method: 'POST',
        headers: yookassaHeaders(shopId, secretKey, idempotenceKey),
        body: JSON.stringify({
          amount: { value: priceStr, currency: 'RUB' },
          capture: true,
          description,
          confirmation: { type: 'embedded' },
          metadata: {
            userId: req.user!.userId,
            plan,
            period,
          },
          receipt: {
            customer: { email: req.user!.email },
            items: [{
              description,
              quantity: 1,
              amount: { value: priceStr, currency: 'RUB' },
              vat_code: 1,
              payment_mode: 'full_payment',
              payment_subject: 'service',
            }],
          },
        }),
      });

      if (!yooResponse.ok) {
        const errorText = await yooResponse.text();
        fastify.log.error({ status: yooResponse.status, body: errorText }, 'YooKassa create payment failed');
        return reply.status(502).send({ error: 'Payment creation failed' });
      }

      const yooData = await yooResponse.json() as {
        id: string;
        confirmation?: { confirmation_token?: string };
        status: string;
      };

      const yookassaPaymentId = yooData.id;
      const confirmationToken = yooData.confirmation?.confirmation_token;

      if (!confirmationToken) {
        fastify.log.error({ yooData }, 'No confirmation_token in YooKassa response');
        return reply.status(502).send({ error: 'No confirmation token received' });
      }

      // Save payment to DB
      await billingService.createPaymentRecord(
        req.user!.userId,
        plan,
        period,
        price,
        yookassaPaymentId,
      );

      return reply.send({
        paymentId: yookassaPaymentId,
        confirmationToken,
      });
    } catch (err) {
      fastify.log.error(err, 'YooKassa payment creation error');
      return reply.status(502).send({ error: 'Payment creation failed' });
    }
  });

  // ---------------------------------------------------------------------------
  // GET /api/billing/status?paymentId=xxx — poll payment status
  // ---------------------------------------------------------------------------
  fastify.get('/api/billing/status', async (req, reply) => {
    const query = req.query as { paymentId?: string };
    const paymentId = query.paymentId;

    if (!paymentId) {
      return reply.status(400).send({ error: 'paymentId required' });
    }

    const { shopId, secretKey } = getShopCredentials();
    if (!shopId || !secretKey) {
      return reply.status(500).send({ error: 'Payment provider not configured' });
    }

    try {
      const yooResponse = await fetch(`${YOOKASSA_BASE_URL}/payments/${paymentId}`, {
        method: 'GET',
        headers: yookassaHeaders(shopId, secretKey, crypto.randomUUID()),
      });

      if (!yooResponse.ok) {
        return reply.status(502).send({ error: 'Failed to fetch payment status' });
      }

      const yooData = await yooResponse.json() as {
        status: string;
        paid: boolean;
        metadata?: { plan?: string };
      };

      if (yooData.paid && yooData.status === 'succeeded') {
        const alreadyProcessed = await billingService.isPaymentProcessed(paymentId);
        if (!alreadyProcessed) {
          const payment = await billingService.getPaymentByYookassaPaymentId(paymentId);
          if (payment) {
            await billingService.applyPlan(
              payment.user_id,
              payment.plan as PlanKey,
              payment.period as 'monthly' | 'yearly',
            );
            await billingService.markPaymentSucceeded(paymentId);
          }
        }
      }

      return reply.send({
        status: yooData.status,
        paid: yooData.paid,
        plan: yooData.metadata?.plan ?? null,
      });
    } catch (err) {
      fastify.log.error(err, 'YooKassa status fetch error');
      return reply.status(502).send({ error: 'Failed to fetch payment status' });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /api/billing/webhook — YooKassa webhook (no auth, per homeopapa pattern)
  // ---------------------------------------------------------------------------
  fastify.post('/api/billing/webhook', async (req, reply) => {
    const payload = req.body as { event?: string; object?: { id?: string; paid?: boolean; status?: string; metadata?: Record<string, string> } };
    const paymentObj = payload.object ?? {};
    const paymentId = paymentObj.id;

    if (!paymentId) {
      return reply.status(400).send({ error: 'Invalid webhook: no payment id' });
    }

    // Idempotency check
    const alreadyProcessed = await billingService.isPaymentProcessed(paymentId);
    if (alreadyProcessed) {
      return reply.send({ ok: true });
    }

    const { shopId, secretKey } = getShopCredentials();
    if (!shopId || !secretKey) {
      return reply.status(500).send({ error: 'Payment provider not configured' });
    }

    // Fetch payment details from YooKassa to verify
    try {
      const yooResponse = await fetch(`${YOOKASSA_BASE_URL}/payments/${paymentId}`, {
        method: 'GET',
        headers: yookassaHeaders(shopId, secretKey, crypto.randomUUID()),
      });

      if (!yooResponse.ok) {
        fastify.log.error({ paymentId, status: yooResponse.status }, 'Webhook: failed to fetch payment from YooKassa');
        return reply.send({ ok: true }); // Don't fail — YooKassa will retry
      }

      const yooData = await yooResponse.json() as {
        id: string;
        paid: boolean;
        status: string;
        metadata?: { userId?: string; plan?: string; period?: string };
      };

      // Only process succeeded payments
      if (!yooData.paid || yooData.status !== 'succeeded') {
        return reply.send({ ok: true, status: yooData.status });
      }

      const { userId, plan, period } = yooData.metadata ?? {};
      if (!userId || !plan || !period) {
        fastify.log.warn({ paymentId }, 'Webhook: missing metadata in payment');
        return reply.send({ ok: true });
      }

      // Apply plan to user
      await billingService.applyPlan(userId, plan as PlanKey, period as 'monthly' | 'yearly');

      // Mark payment as succeeded
      await billingService.markPaymentSucceeded(paymentId);

      fastify.log.info({ paymentId, userId, plan, period }, 'Webhook: payment succeeded, plan applied');
      return reply.send({ ok: true });
    } catch (err) {
      fastify.log.error(err, 'Webhook: error processing payment');
      return reply.send({ ok: true }); // Don't fail — YooKassa will retry
    }
  });

  // ---------------------------------------------------------------------------
  // GET /api/billing/subscription — current plan and usage (D-10)
  // ---------------------------------------------------------------------------
  fastify.get('/api/billing/subscription', { preHandler: [authMiddleware] }, async (req, reply) => {
    const status = await billingService.getSubscriptionStatus(req.user!.userId);
    const limits = PLAN_CONFIG[status.plan]?.limits;

    return reply.send({
      plan: status.plan,
      periodEnd: status.periodEnd,
      aiUsed: status.aiUsed,
      aiLimit: status.aiLimit,
      isActive: status.isActive,
      limits,
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/billing/payments — payment history (D-10)
  // ---------------------------------------------------------------------------
  fastify.get('/api/billing/payments', { preHandler: [authMiddleware] }, async (req, reply) => {
    const payments = await billingService.getPaymentHistory(req.user!.userId);
    return reply.send(payments);
  });
}

const express = require('express');
const supabase = require('../supabase');
const axios = require('axios');
const auth = require('../middleware/auth');
const router = express.Router();

const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
const MP_BASE_URL = 'https://api.mercadopago.com';

const PLANS = {
  starter: { name: 'Starter', price: 97, plan_id: null },
  pro:     { name: 'Pro',     price: 197, plan_id: null },
  business:{ name: 'Business',price: 397, plan_id: null }
};

// Crear suscripción en Mercado Pago
router.post('/subscribe', auth, async (req, res) => {
  try {
    const { plan } = req.body;
    if (!PLANS[plan]) return res.status(400).json({ error: 'Plan inválido' });

    const planInfo = PLANS[plan];
    const tenant = req.tenant;
    const backUrl = process.env.FRONTEND_URL || 'https://flowai-frontend-gray.vercel.app';

    // Crear preferencia de assinatura no Mercado Pago
    const response = await axios.post(`${MP_BASE_URL}/preapproval`, {
      reason: `NexaAI CRM — Plan ${planInfo.name}`,
      auto_recurring: {
        frequency: 1,
        frequency_type: 'months',
        transaction_amount: planInfo.price,
        currency_id: 'BRL'
      },
      back_url: `${backUrl}?payment=success&plan=${plan}`,
      payer_email: tenant.email,
      external_reference: `${tenant.id}|${plan}`,
      status: 'pending'
    }, {
      headers: {
        'Authorization': `Bearer ${MP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    const { id, init_point } = response.data;

    // Guardar suscripción en Supabase
    await supabase.from('subscriptions').upsert([{
      tenant_id: tenant.id,
      plan,
      mp_subscription_id: id,
      status: 'pending',
      updated_at: new Date()
    }], { onConflict: 'tenant_id' });

    res.json({ init_point, subscription_id: id });
  } catch(e) {
    console.error('Payment error:', e.response?.data || e.message);
    res.status(500).json({ error: e.message });
  }
});

// Webhook de Mercado Pago — confirmar pago
router.post('/webhook', async (req, res) => {
  res.sendStatus(200);
  try {
    const { type, data } = req.body;
    if (type !== 'subscription_preapproval') return;

    const subId = data?.id;
    if (!subId) return;

    // Buscar detalles de la suscripción en MP
    const { data: mpSub } = await axios.get(`${MP_BASE_URL}/preapproval/${subId}`, {
      headers: { 'Authorization': `Bearer ${MP_ACCESS_TOKEN}` }
    });

    const externalRef = mpSub.external_reference;
    if (!externalRef) return;

    const [tenantId, plan] = externalRef.split('|');
    const status = mpSub.status;

    // Actualizar suscripción en Supabase
    await supabase.from('subscriptions').upsert([{
      tenant_id: tenantId,
      plan,
      mp_subscription_id: subId,
      status,
      updated_at: new Date()
    }], { onConflict: 'tenant_id' });

    // Si pago aprobado, activar plan del tenant
    if (status === 'authorized') {
      await supabase.from('tenants').update({
        plan,
        tokens_used: 0,
        trial_ends_at: null
      }).eq('id', tenantId);
      console.log(`✅ Plan ${plan} activado para tenant ${tenantId}`);
    }

    // Si cancelado, bajar a free
    if (status === 'cancelled') {
      await supabase.from('tenants').update({ plan: 'free' }).eq('id', tenantId);
    }
  } catch(e) {
    console.error('Webhook MP error:', e.message);
  }
});

// Obtener estado de suscripción actual
router.get('/status', auth, async (req, res) => {
  const { data } = await supabase.from('subscriptions')
    .select('*').eq('tenant_id', req.tenant.id).single();
  res.json(data || { status: 'none', plan: req.tenant.plan });
});

// Cancelar suscripción
router.post('/cancel', auth, async (req, res) => {
  try {
    const { data: sub } = await supabase.from('subscriptions')
      .select('*').eq('tenant_id', req.tenant.id).single();

    if (sub?.mp_subscription_id) {
      await axios.put(`${MP_BASE_URL}/preapproval/${sub.mp_subscription_id}`,
        { status: 'cancelled' },
        { headers: { 'Authorization': `Bearer ${MP_ACCESS_TOKEN}` } }
      );
    }

    await supabase.from('subscriptions')
      .update({ status: 'cancelled' }).eq('tenant_id', req.tenant.id);
    await supabase.from('tenants')
      .update({ plan: 'free' }).eq('id', req.tenant.id);

    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;

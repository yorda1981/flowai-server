const express = require('express');
const supabase = require('../supabase');
const axios = require('axios');
const auth = require('../middleware/auth');
const router = express.Router();

const EVOLUTION_URL = process.env.EVOLUTION_URL || 'https://evolution-api-production-6c0d.up.railway.app';
const EVOLUTION_KEY = process.env.EVOLUTION_KEY || 'flowai2024secretkey';
const evoHeaders = { 'apikey': EVOLUTION_KEY, 'Content-Type': 'application/json' };
const EVO_TIMEOUT = 15000; // ms — nunca dejar una llamada a Evolution colgada indefinidamente
// URL pública de este mismo backend, para decirle a Evolution adónde mandar los mensajes entrantes.
const BACKEND_PUBLIC_URL = process.env.BACKEND_PUBLIC_URL || 'https://flowai-server-production.up.railway.app';

// Le dice a Evolution a qué URL debe mandar los eventos de mensajes (webhook).
// Sin esto, WhatsApp puede quedar "Conectado" pero el bot nunca recibe ni
// responde nada — esto fue justo lo que pasó al recrear la base de datos de
// Evolution: la configuración de webhook por instancia se perdió y nada la
// volvía a poner, así que la agregamos aquí, en cada creación/uso de instancia.
async function ensureWebhook(instanceName, tenantId) {
  try {
    await axios.post(`${EVOLUTION_URL}/webhook/set/${instanceName}`, {
      webhook: {
        enabled: true,
        url: `${BACKEND_PUBLIC_URL}/webhook/evolution/${tenantId}`,
        events: ['MESSAGES_UPSERT'],
        webhookByEvents: false,
        webhookBase64: false
      }
    }, { headers: evoHeaders, timeout: EVO_TIMEOUT });
  } catch (e) {
    console.log('Webhook config error:', e.response?.data || e.message);
    // No bloqueamos la generación del QR si esto falla, pero queda registrado en logs.
  }
}

// Lock en memoria: evita que dos solicitudes de QR para el mismo agente
// (ej. doble clic en el frontend) corran en paralelo y se pisen entre sí.
const qrLocks = new Set();

// Espera activa a que Evolution entregue el QR real, en vez de adivinar
// un tiempo fijo de sleep. Reintenta cada `intervalMs` hasta `maxTries` veces.
async function waitForQr(instanceName, maxTries = 8, intervalMs = 1000) {
  let lastErr = null;
  for (let i = 0; i < maxTries; i++) {
    try {
      const qrRes = await axios.get(`${EVOLUTION_URL}/instance/connect/${instanceName}`, {
        headers: evoHeaders, timeout: EVO_TIMEOUT
      });
      const qrData = qrRes.data;
      const base64 = qrData?.base64 || qrData?.qrcode?.base64 || qrData?.qr?.base64;
      const code = qrData?.code || qrData?.qrcode?.code || qrData?.qr?.code;
      if (base64 || code) return { base64, code };
    } catch (e) {
      lastErr = e;
    }
    await new Promise(r => setTimeout(r, intervalMs));
  }
  if (lastErr) throw lastErr;
  return null; // Evolution respondió pero aún no tenía QR listo tras todos los intentos
}

router.get('/', auth, async (req, res) => {
  const { data, error } = await supabase.from('agents').select('*').eq('tenant_id', req.tenant.id);
  if (error) return res.status(500).json({ error });
  res.json(data);
});

router.post('/', auth, async (req, res) => {
  const { name, channel } = req.body;
  const instanceName = `fi${req.tenant.id.substring(0,6)}${Date.now().toString().slice(-6)}`;
  const { data, error } = await supabase.from('agents')
    .insert([{ tenant_id: req.tenant.id, name, channel: channel||'whatsapp', evolution_instance: instanceName, status: 'disconnected' }])
    .select().single();
  if (error) return res.status(500).json({ error });
  res.json(data);
});

router.get('/:id/qrcode', auth, async (req, res) => {
  const { data: agent } = await supabase.from('agents')
    .select('*').eq('id', req.params.id).eq('tenant_id', req.tenant.id).single();
  if (!agent) return res.status(404).json({ error: 'Agente no encontrado' });

  // Si ya hay una generación de QR en curso para este agente, no arrancar otra en paralelo.
  if (qrLocks.has(agent.id)) {
    return res.status(409).json({ error: 'Ya se está generando un QR para este agente, espera unos segundos.' });
  }
  qrLocks.add(agent.id);

  try {
    let instanceName = agent.evolution_instance;
    // ?force=1 permite forzar el borrado/recreación manual si de verdad hace falta
    // (ej. la instancia quedó en un estado corrupto). En el flujo normal NO recreamos
    // la instancia en cada solicitud: eso es lo que causaba la demora de varios segundos.
    const forceRecreate = req.query.force === '1';
    let needsCreate = !instanceName;

    if (instanceName && forceRecreate) {
      try {
        await axios.delete(`${EVOLUTION_URL}/instance/delete/${instanceName}`, { headers: evoHeaders, timeout: EVO_TIMEOUT });
      } catch (e) { /* no importa si no existe */ }
      needsCreate = true;
    } else if (instanceName) {
      // Verificamos que la instancia siga existiendo en Evolution antes de reutilizarla.
      try {
        await axios.get(`${EVOLUTION_URL}/instance/connectionState/${instanceName}`, {
          headers: evoHeaders, timeout: EVO_TIMEOUT
        });
        // Existe → no hace falta borrar/crear, solo pedimos el QR de nuevo sobre la misma instancia.
        // Reafirmamos el webhook por si acaso (no tiene costo si ya estaba bien configurado).
        await ensureWebhook(instanceName, agent.tenant_id);
      } catch (e) {
        needsCreate = true; // no existe o está rota en Evolution → hay que crearla de nuevo
      }
    }

    if (needsCreate) {
      instanceName = `fi${agent.tenant_id.substring(0,6)}${Date.now().toString().slice(-6)}`;
      try {
        await axios.post(`${EVOLUTION_URL}/instance/create`, {
          instanceName,
          qrcode: true,
          integration: 'WHATSAPP-BAILEYS'
        }, { headers: evoHeaders, timeout: EVO_TIMEOUT });
        await supabase.from('agents').update({ evolution_instance: instanceName }).eq('id', agent.id);
        await ensureWebhook(instanceName, agent.tenant_id);
      } catch (e) {
        console.log('Create error:', e.response?.data || e.message);
        return res.status(500).json({ error: 'Error creando instancia: ' + (e.response?.data?.message || e.message) });
      }
    }

    // En vez de dormir un tiempo fijo "a ciegas", consultamos activamente hasta que
    // el QR esté listo (o hasta agotar los intentos).
    try {
      const qr = await waitForQr(instanceName);
      if (qr) return res.json(qr);
      // Evolution todavía no tenía el QR listo tras el poll: el frontend puede
      // reintentar llamando de nuevo a este mismo endpoint (reutilizará la instancia,
      // no la recreará, así que el próximo intento es mucho más rápido).
      return res.status(202).json({ message: 'QR generándose, intenta de nuevo en unos segundos' });
    } catch (e) {
      console.log('QR error:', e.response?.data || e.message);
      return res.status(500).json({ error: e.response?.data?.message || e.message });
    }
  } finally {
    qrLocks.delete(agent.id);
  }
});

router.get('/:id/status', auth, async (req, res) => {
  const { data: agent } = await supabase.from('agents')
    .select('*').eq('id', req.params.id).eq('tenant_id', req.tenant.id).single();
  if (!agent) return res.status(404).json({ error: 'No encontrado' });
  try {
    const r = await axios.get(`${EVOLUTION_URL}/instance/connectionState/${agent.evolution_instance}`, { headers: evoHeaders, timeout: EVO_TIMEOUT });
    const state = r.data?.instance?.state || r.data?.state;
    const status = state === 'open' ? 'connected' : 'disconnected';
    await supabase.from('agents').update({ status }).eq('id', req.params.id);
    res.json({ status });
  } catch(e) { res.json({ status: 'disconnected' }); }
});

router.post('/:id/disconnect', auth, async (req, res) => {
  const { data: agent } = await supabase.from('agents')
    .select('*').eq('id', req.params.id).eq('tenant_id', req.tenant.id).single();
  if (agent?.evolution_instance) {
    try { await axios.delete(`${EVOLUTION_URL}/instance/delete/${agent.evolution_instance}`, { headers: evoHeaders, timeout: EVO_TIMEOUT }); } catch(e) {}
  }
  await supabase.from('agents').update({ status: 'disconnected' }).eq('id', req.params.id);
  res.json({ success: true });
});

router.delete('/:id', auth, async (req, res) => {
  const { data: agent } = await supabase.from('agents')
    .select('*').eq('id', req.params.id).eq('tenant_id', req.tenant.id).single();
  if (agent?.evolution_instance) {
    try { await axios.delete(`${EVOLUTION_URL}/instance/delete/${agent.evolution_instance}`, { headers: evoHeaders, timeout: EVO_TIMEOUT }); } catch(e) {}
  }
  await supabase.from('agents').delete().eq('id', req.params.id).eq('tenant_id', req.tenant.id);
  res.json({ success: true });
});

module.exports = router;

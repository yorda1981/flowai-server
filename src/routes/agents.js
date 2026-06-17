const express = require('express');
const supabase = require('../supabase');
const axios = require('axios');
const auth = require('../middleware/auth');
const router = express.Router();

const EVOLUTION_URL = process.env.EVOLUTION_URL || 'https://evolution-api-production-6c0d.up.railway.app';
const EVOLUTION_KEY = process.env.EVOLUTION_KEY || 'flowai2024secretkey';
const evoHeaders = { 'apikey': EVOLUTION_KEY, 'Content-Type': 'application/json' };

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
  
  let instanceName = agent.evolution_instance;
  if (!instanceName) return res.status(400).json({ error: 'Sin instancia' });

  // Eliminar instancia vieja si existe y recrear
  try {
    await axios.delete(`${EVOLUTION_URL}/instance/delete/${instanceName}`, { headers: evoHeaders });
    await new Promise(r => setTimeout(r, 1000));
  } catch(e) { /* no importa si no existe */ }

  // Crear instancia nueva con timestamp fresco
  const newInstanceName = `fi${agent.tenant_id.substring(0,6)}${Date.now().toString().slice(-6)}`;
  try {
    await axios.post(`${EVOLUTION_URL}/instance/create`, {
      instanceName: newInstanceName,
      qrcode: true,
      integration: 'WHATSAPP-BAILEYS'
    }, { headers: evoHeaders });
    
    // Actualizar nombre en BD
    await supabase.from('agents').update({ evolution_instance: newInstanceName }).eq('id', agent.id);
    instanceName = newInstanceName;
    
    await new Promise(r => setTimeout(r, 3000));
  } catch(e) {
    console.log('Create error:', e.response?.data || e.message);
    return res.status(500).json({ error: 'Error creando instancia: ' + (e.response?.data?.message || e.message) });
  }

  // Obtener QR
  try {
    const qrRes = await axios.get(`${EVOLUTION_URL}/instance/connect/${instanceName}`, { headers: evoHeaders });
    const qrData = qrRes.data;
    console.log('QR data:', JSON.stringify(qrData).substring(0, 300));
    
    const base64 = qrData?.base64 || qrData?.qrcode?.base64 || qrData?.qr?.base64;
    const code = qrData?.code || qrData?.qrcode?.code || qrData?.qr?.code;
    
    if (base64 || code) {
      return res.json({ base64, code });
    }
    return res.json({ message: 'QR generándose', raw: qrData });
  } catch(e) {
    console.log('QR error:', e.response?.data || e.message);
    return res.status(500).json({ error: e.response?.data?.message || e.message });
  }
});

router.get('/:id/status', auth, async (req, res) => {
  const { data: agent } = await supabase.from('agents')
    .select('*').eq('id', req.params.id).eq('tenant_id', req.tenant.id).single();
  if (!agent) return res.status(404).json({ error: 'No encontrado' });
  try {
    const r = await axios.get(`${EVOLUTION_URL}/instance/connectionState/${agent.evolution_instance}`, { headers: evoHeaders });
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
    try { await axios.delete(`${EVOLUTION_URL}/instance/delete/${agent.evolution_instance}`, { headers: evoHeaders }); } catch(e) {}
  }
  await supabase.from('agents').update({ status: 'disconnected' }).eq('id', req.params.id);
  res.json({ success: true });
});

router.delete('/:id', auth, async (req, res) => {
  const { data: agent } = await supabase.from('agents')
    .select('*').eq('id', req.params.id).eq('tenant_id', req.tenant.id).single();
  if (agent?.evolution_instance) {
    try { await axios.delete(`${EVOLUTION_URL}/instance/delete/${agent.evolution_instance}`, { headers: evoHeaders }); } catch(e) {}
  }
  await supabase.from('agents').delete().eq('id', req.params.id).eq('tenant_id', req.tenant.id);
  res.json({ success: true });
});

module.exports = router;

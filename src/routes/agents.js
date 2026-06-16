const express = require('express');
const supabase = require('../supabase');
const axios = require('axios');
const auth = require('../middleware/auth');
const router = express.Router();

const EVOLUTION_URL = process.env.EVOLUTION_URL || 'https://evolution-api-production-6c0d.up.railway.app';
const EVOLUTION_KEY = process.env.EVOLUTION_KEY || 'flowai2024secretkey';

const evoHeaders = {
  'apikey': EVOLUTION_KEY,
  'Content-Type': 'application/json'
};

// Listar agentes
router.get('/', auth, async (req, res) => {
  const { data, error } = await supabase.from('agents').select('*').eq('tenant_id', req.tenant.id);
  if (error) return res.status(500).json({ error });
  res.json(data);
});

// Crear agente y generar instancia en Evolution API
router.post('/', auth, async (req, res) => {
  const { name, channel } = req.body;
  
  // Crear en base de datos
  const instanceName = `flowai_${req.tenant.id.substring(0,8)}_${Date.now()}`;
  const { data, error } = await supabase.from('agents')
    .insert([{ 
      tenant_id: req.tenant.id, 
      name, 
      channel: channel || 'whatsapp',
      evolution_instance: instanceName,
      status: 'disconnected'
    }]).select().single();
  
  if (error) return res.status(500).json({ error });

  // Crear instancia en Evolution API
  if (channel === 'whatsapp' || !channel) {
    try {
      await axios.post(`${EVOLUTION_URL}/instance/create`, {
        instanceName,
        qrcode: true,
        integration: 'WHATSAPP-BAILEYS'
      }, { headers: evoHeaders });
    } catch(e) {
      console.log('Evolution create error:', e.message);
    }
  }

  res.json(data);
});

// Obtener QR code de una instancia
router.get('/:id/qrcode', auth, async (req, res) => {
  const { data: agent } = await supabase.from('agents')
    .select('*').eq('id', req.params.id).eq('tenant_id', req.tenant.id).single();
  
  if (!agent) return res.status(404).json({ error: 'Agente no encontrado' });
  if (!agent.evolution_instance) return res.status(400).json({ error: 'Sin instancia Evolution' });

  try {
    const response = await axios.get(
      `${EVOLUTION_URL}/instance/connect/${agent.evolution_instance}`,
      { headers: evoHeaders }
    );
    res.json(response.data);
  } catch(e) {
    res.status(500).json({ error: 'No se pudo obtener QR: ' + e.message });
  }
});

// Verificar estado de conexión
router.get('/:id/status', auth, async (req, res) => {
  const { data: agent } = await supabase.from('agents')
    .select('*').eq('id', req.params.id).eq('tenant_id', req.tenant.id).single();
  
  if (!agent) return res.status(404).json({ error: 'Agente no encontrado' });

  try {
    const response = await axios.get(
      `${EVOLUTION_URL}/instance/fetchInstances?instanceName=${agent.evolution_instance}`,
      { headers: evoHeaders }
    );
    const instance = response.data?.[0];
    const status = instance?.instance?.state === 'open' ? 'connected' : 'disconnected';
    
    // Actualizar estado en BD
    await supabase.from('agents').update({ status }).eq('id', req.params.id);
    
    res.json({ status, instance: instance?.instance });
  } catch(e) {
    res.json({ status: 'disconnected' });
  }
});

// Desconectar agente
router.post('/:id/disconnect', auth, async (req, res) => {
  const { data: agent } = await supabase.from('agents')
    .select('*').eq('id', req.params.id).eq('tenant_id', req.tenant.id).single();
  
  if (!agent) return res.status(404).json({ error: 'Agente no encontrado' });

  try {
    await axios.delete(
      `${EVOLUTION_URL}/instance/delete/${agent.evolution_instance}`,
      { headers: evoHeaders }
    );
  } catch(e) { console.log('Disconnect error:', e.message); }

  await supabase.from('agents').update({ status: 'disconnected' }).eq('id', req.params.id);
  res.json({ success: true });
});

// Eliminar agente
router.delete('/:id', auth, async (req, res) => {
  const { data: agent } = await supabase.from('agents')
    .select('*').eq('id', req.params.id).eq('tenant_id', req.tenant.id).single();
  
  if (agent?.evolution_instance) {
    try {
      await axios.delete(`${EVOLUTION_URL}/instance/delete/${agent.evolution_instance}`, { headers: evoHeaders });
    } catch(e) {}
  }

  await supabase.from('agents').delete().eq('id', req.params.id).eq('tenant_id', req.tenant.id);
  res.json({ success: true });
});

module.exports = router;

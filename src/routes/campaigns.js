const express = require('express');
const supabase = require('../supabase');
const axios = require('axios');
const auth = require('../middleware/auth');
const router = express.Router();

router.post('/send', auth, async (req, res) => {
  try {
    const { phone, message } = req.body;
    if (!phone || !message) return res.status(400).json({ error: 'phone y message requeridos' });

    const { data: agent } = await supabase.from('agents')
      .select('*').eq('tenant_id', req.tenant.id).eq('channel', 'whatsapp').single();

    if (!agent?.evolution_instance) return res.status(400).json({ error: 'No hay agente WhatsApp configurado' });

    const evolutionUrl = process.env.EVOLUTION_URL;
    const evolutionKey = process.env.EVOLUTION_KEY;

    await axios.post(
      `${evolutionUrl}/message/sendText/${agent.evolution_instance}`,
      { number: phone, text: message },
      { headers: { 'apikey': evolutionKey } }
    );

    res.json({ success: true });
  } catch(e) {
    console.error('Campaign send error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;

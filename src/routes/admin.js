const express = require('express');
const supabase = require('../supabase');
const router = express.Router();

const ADMIN_KEY = process.env.ADMIN_SECRET_KEY || 'flowai_admin_2024_super_secreto';

// Middleware de autenticación admin
function adminAuth(req, res, next) {
  const key = req.headers['x-admin-key'];
  if (!key || key !== ADMIN_KEY) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  next();
}

// Listar todos los clientes
router.get('/tenants', adminAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('tenants')
    .select('id, name, email, plan, tokens_used, active, created_at')
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error });
  res.json(data);
});

// Estadísticas de un cliente
router.get('/tenants/:id/stats', adminAuth, async (req, res) => {
  const { id } = req.params;
  const [contacts, messages, agents, conversations] = await Promise.all([
    supabase.from('contacts').select('id', { count: 'exact' }).eq('tenant_id', id),
    supabase.from('messages').select('id', { count: 'exact' }).eq('tenant_id', id),
    supabase.from('agents').select('*').eq('tenant_id', id),
    supabase.from('conversations').select('id', { count: 'exact' }).eq('tenant_id', id)
  ]);
  res.json({
    contacts: contacts.count || 0,
    messages: messages.count || 0,
    agents: agents.data || [],
    conversations: conversations.count || 0
  });
});

// Activar/desactivar cliente
router.post('/tenants/:id/toggle', adminAuth, async (req, res) => {
  const { id } = req.params;
  const { active } = req.body;
  const { data, error } = await supabase
    .from('tenants')
    .update({ active })
    .eq('id', id)
    .select()
    .single();
  if (error) return res.status(500).json({ error });
  res.json({ success: true, tenant: data });
});

// Cambiar plan de cliente
router.post('/tenants/:id/plan', adminAuth, async (req, res) => {
  const { id } = req.params;
  const { plan } = req.body;
  const { data, error } = await supabase
    .from('tenants')
    .update({ plan })
    .eq('id', id)
    .select()
    .single();
  if (error) return res.status(500).json({ error });
  res.json({ success: true, tenant: data });
});

// Resetear tokens de cliente
router.post('/tenants/:id/reset-tokens', adminAuth, async (req, res) => {
  const { id } = req.params;
  const { data, error } = await supabase
    .from('tenants')
    .update({ tokens_used: 0 })
    .eq('id', id)
    .select()
    .single();
  if (error) return res.status(500).json({ error });
  res.json({ success: true });
});

// Estadísticas globales
router.get('/stats', adminAuth, async (req, res) => {
  const [tenants, messages, contacts, agents] = await Promise.all([
    supabase.from('tenants').select('id', { count: 'exact' }),
    supabase.from('messages').select('id', { count: 'exact' }),
    supabase.from('contacts').select('id', { count: 'exact' }),
    supabase.from('agents').select('id', { count: 'exact' }).eq('status', 'connected')
  ]);
  res.json({
    total_tenants: tenants.count || 0,
    total_messages: messages.count || 0,
    total_contacts: contacts.count || 0,
    active_agents: agents.count || 0
  });
});

module.exports = router;

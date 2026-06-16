const express = require('express');
const supabase = require('../supabase');
const auth = require('../middleware/auth');
const router = express.Router();

router.get('/', auth, async (req, res) => {
  const tenantId = req.tenant.id;

  const [contacts, messages, flows, conversations] = await Promise.all([
    supabase.from('contacts').select('id', { count: 'exact' }).eq('tenant_id', tenantId),
    supabase.from('messages').select('id', { count: 'exact' }).eq('tenant_id', tenantId),
    supabase.from('flows').select('id,name,executions,status').eq('tenant_id', tenantId),
    supabase.from('conversations').select('id', { count: 'exact' }).eq('tenant_id', tenantId)
  ]);

  res.json({
    total_contacts: contacts.count || 0,
    total_messages: messages.count || 0,
    total_conversations: conversations.count || 0,
    flows: flows.data || []
  });
});

module.exports = router;

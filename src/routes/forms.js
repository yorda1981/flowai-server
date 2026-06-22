// NexaAI CRM — routes/forms.js
const express  = require('express');
const supabase = require('../supabase');
const auth     = require('../middleware/auth');
const router   = express.Router();

// ── GET /api/forms — listar formulários do tenant
router.get('/', auth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('forms').select('*')
      .eq('tenant_id', req.tenant.id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/forms — criar formulário
router.post('/', auth, async (req, res) => {
  try {
    const { name, description, fields, color, thank_you_msg, redirect_url } = req.body;
    if (!name) return res.status(400).json({ error: 'Nome obrigatório' });
    const { data, error } = await supabase.from('forms').insert([{
      tenant_id:    req.tenant.id,
      name:         name.trim(),
      description:  description || '',
      fields:       fields || [],
      color:        color || '#185FA5',
      thank_you_msg: thank_you_msg || 'Obrigado! Entraremos em contato em breve.',
      redirect_url: redirect_url || '',
    }]).select().single();
    if (error) throw error;
    res.json(data);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── PATCH /api/forms/:id — atualizar formulário
router.patch('/:id', auth, async (req, res) => {
  try {
    const fields = ['name','description','fields','color','thank_you_msg','redirect_url','active'];
    const updates = {};
    fields.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
    const { data, error } = await supabase.from('forms')
      .update(updates).eq('id', req.params.id).eq('tenant_id', req.tenant.id)
      .select().single();
    if (error) throw error;
    res.json(data);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── DELETE /api/forms/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    await supabase.from('forms').delete()
      .eq('id', req.params.id).eq('tenant_id', req.tenant.id);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/forms/public/:tenantId/:formId — formulário público (sem auth)
router.get('/public/:tenantId/:formId', async (req, res) => {
  try {
    const { data, error } = await supabase.from('forms')
      .select('id,name,description,fields,color,thank_you_msg,redirect_url,active')
      .eq('id', req.params.formId)
      .eq('tenant_id', req.params.tenantId)
      .eq('active', true)
      .single();
    if (error || !data) return res.status(404).json({ error: 'Formulário não encontrado' });
    res.json(data);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/forms/submit/:tenantId/:formId — submissão pública
router.post('/submit/:tenantId/:formId', async (req, res) => {
  try {
    const { tenantId, formId } = req.params;

    // Buscar formulário
    const { data: form, error: formErr } = await supabase.from('forms')
      .select('*').eq('id', formId).eq('tenant_id', tenantId).eq('active', true).single();
    if (formErr || !form) return res.status(404).json({ error: 'Formulário não encontrado' });

    const body = req.body;

    // Extrair nome, phone, email dos campos
    let name  = body.name  || body.nome  || '';
    let phone = body.phone || body.whatsapp || body.telefone || '';
    let email = body.email || '';

    // Buscar nos campos do formulário
    (form.fields || []).forEach(f => {
      const val = body[f.id] || '';
      if (!name  && (f.type === 'name'  || f.label?.toLowerCase().includes('nome')))  name  = val;
      if (!phone && (f.type === 'phone' || f.label?.toLowerCase().includes('whatsapp') || f.label?.toLowerCase().includes('telefone'))) phone = val;
      if (!email && (f.type === 'email' || f.label?.toLowerCase().includes('email')))  email = val;
    });

    // Limpar telefone
    phone = phone.replace(/\D/g, '');

    // Criar ou atualizar contato
    let contact = null;
    if (phone) {
      const { data: existing } = await supabase.from('contacts')
        .select('*').eq('tenant_id', tenantId).eq('phone', phone).single();

      if (existing) {
        const { data: updated } = await supabase.from('contacts')
          .update({ name: name || existing.name, email: email || existing.email })
          .eq('id', existing.id).select().single();
        contact = updated;
      } else {
        const { data: created } = await supabase.from('contacts').insert([{
          tenant_id:      tenantId,
          name:           name || phone,
          phone,
          email:          email || '',
          channel:        'webchat',
          pipeline_stage: 'lead',
          custom_data:    { ...body, form_id: formId, form_name: form.name, submitted_at: new Date().toISOString() }
        }]).select().single();
        contact = created;
      }
    }

    // Incrementar contador
    await supabase.from('forms').update({ submissions: (form.submissions||0) + 1 }).eq('id', formId);

    res.json({
      success:      true,
      thank_you_msg: form.thank_you_msg,
      redirect_url:  form.redirect_url || null,
      contact_id:    contact?.id || null
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

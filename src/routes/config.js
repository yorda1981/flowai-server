// NexaAI CRM — routes/config.js
const express  = require('express');
const supabase = require('../supabase');
const auth     = require('../middleware/auth');
const multer   = require('multer');
const router   = express.Router();

// Multer em memória — sem salvar em disco
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 }, // 10MB máx
  fileFilter: (req, file, cb) => {
    const allowed = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/plain',
      'text/csv',
    ];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Tipo de arquivo não suportado'));
  }
});

// ── Extratores de texto ──────────────────────────────────────────────────────

async function extractPDF(buffer) {
  const pdfParse = require('pdf-parse');
  const data = await pdfParse(buffer);
  return data.text || '';
}

async function extractDOCX(buffer) {
  const mammoth = require('mammoth');
  const result  = await mammoth.extractRawText({ buffer });
  return result.value || '';
}

async function extractExcel(buffer) {
  const XLSX    = require('xlsx');
  const wb      = XLSX.read(buffer, { type: 'buffer' });
  const lines   = [];
  wb.SheetNames.forEach(name => {
    const ws   = wb.Sheets[name];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    lines.push(`=== ${name} ===`);
    rows.forEach(row => {
      const line = row.filter(c => c !== '').join(' | ');
      if (line.trim()) lines.push(line);
    });
  });
  return lines.join('\n');
}

async function extractText(buffer, mimetype, originalname) {
  const ext = (originalname || '').split('.').pop().toLowerCase();
  try {
    if (mimetype === 'application/pdf' || ext === 'pdf') {
      return await extractPDF(buffer);
    }
    if (mimetype.includes('wordprocessingml') || mimetype.includes('msword') || ext === 'docx' || ext === 'doc') {
      return await extractDOCX(buffer);
    }
    if (mimetype.includes('spreadsheetml') || mimetype.includes('ms-excel') || ext === 'xlsx' || ext === 'xls') {
      return await extractExcel(buffer);
    }
    if (mimetype === 'text/plain' || mimetype === 'text/csv' || ext === 'txt' || ext === 'csv') {
      return buffer.toString('utf-8');
    }
    return '';
  } catch(e) {
    console.error('Erro ao extrair texto:', e.message);
    throw new Error('Não foi possível ler o arquivo: ' + e.message);
  }
}

// ── Rotas ────────────────────────────────────────────────────────────────────

// GET /api/config/knowledge-base
router.get('/knowledge-base', auth, async (req, res) => {
  const { data, error } = await supabase.from('tenants')
    .select('knowledge_base').eq('id', req.tenant.id).single();
  if (error) return res.status(500).json({ error });
  res.json({ knowledge_base: data?.knowledge_base || '' });
});

// POST /api/config/knowledge-base — salvar texto manual
router.post('/knowledge-base', auth, async (req, res) => {
  const { knowledge_base } = req.body;
  const { error } = await supabase.from('tenants')
    .update({ knowledge_base }).eq('id', req.tenant.id);
  if (error) return res.status(500).json({ error });
  res.json({ success: true });
});

// POST /api/config/upload-doc — upload de arquivo
router.post('/upload-doc', auth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });

    const text = await extractText(req.file.buffer, req.file.mimetype, req.file.originalname);

    if (!text.trim()) {
      return res.status(400).json({ error: 'Não foi possível extrair texto do arquivo. Verifique se o PDF não é uma imagem escaneada.' });
    }

    // Limitar a 8000 chars para não explodir o prompt
    const MAX_CHARS = 8000;
    const truncated = text.length > MAX_CHARS;
    const finalText = text.trim().substring(0, MAX_CHARS);

    // Buscar knowledge_base atual e append
    const { data: tenant } = await supabase.from('tenants')
      .select('knowledge_base').eq('id', req.tenant.id).single();

    const existing = (tenant?.knowledge_base || '').trim();
    const fileName = req.file.originalname;
    const separator = `\n\n--- ARQUIVO: ${fileName} ---\n`;
    const combined = existing
      ? existing + separator + finalText
      : `--- ARQUIVO: ${fileName} ---\n` + finalText;

    // Salvar
    await supabase.from('tenants')
      .update({ knowledge_base: combined.substring(0, 12000) })
      .eq('id', req.tenant.id);

    res.json({
      success:   true,
      chars:     finalText.length,
      truncated,
      preview:   finalText.substring(0, 200) + (finalText.length > 200 ? '...' : ''),
      filename:  fileName,
    });

  } catch(e) {
    console.error('Upload doc error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;

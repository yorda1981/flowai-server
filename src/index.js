require('dotenv').config();
const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth');
const contactsRoutes = require('./routes/contacts');
const flowsRoutes = require('./routes/flows');
const messagesRoutes = require('./routes/messages');
const agentsRoutes = require('./routes/agents');
const aiRoutes = require('./routes/ai');
const webhookRoutes = require('./routes/webhook');
const statsRoutes = require('./routes/stats');
const campaignsRoutes = require('./routes/campaigns');
const labelsRoutes = require('./routes/labels');
const adminRoutes = require('./routes/admin');
const configRoutes = require('./routes/config');

const app = express();
app.use(cors({
  origin: '*',
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization']
}));
app.use(express.json());

// ─── Rutas ───
app.use('/api/auth', authRoutes);
app.use('/api/contacts', contactsRoutes);
app.use('/api/flows', flowsRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/agents', agentsRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/campaigns', campaignsRoutes);
app.use('/api/labels', labelsRoutes);
app.use('/api/config', configRoutes);
app.use('/webhook', webhookRoutes);
app.use('/api/webhook', webhookRoutes); // rutas de bloqueados y gestión

// ─── Health check ───
app.get('/', (req, res) => {
  res.json({ status: 'FlowAI server funcionando ✅', version: '1.0.0' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅ FlowAI Server corriendo en puerto ${PORT}`);
});

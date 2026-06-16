# FlowAI Server

Backend completo para la plataforma FlowAI CRM.

## Variables de entorno (configura en Railway)

| Variable | Valor |
|----------|-------|
| SUPABASE_URL | https://oeosjqvtflthizquiixo.supabase.co |
| SUPABASE_SECRET_KEY | tu_secret_key |
| JWT_SECRET | cualquier_texto_secreto |
| ANTHROPIC_API_KEY | tu_clave_anthropic |
| ZAPI_BASE_URL | https://api.z-api.io/instances |

## Endpoints principales

- POST /api/auth/login — Login
- POST /api/auth/register — Registro
- GET  /api/contacts — Lista de contactos
- POST /api/contacts — Crear contacto
- GET  /api/flows — Lista de flujos
- POST /api/flows — Crear flujo
- GET  /api/agents — Lista de agentes
- POST /api/agents — Crear agente
- POST /api/ai/chat — Chat con IA
- GET  /api/stats — Estadísticas
- POST /webhook/whatsapp/:tenantId — Webhook WhatsApp

## Cuenta demo
- Email: admin@demo.com
- Password: 123456

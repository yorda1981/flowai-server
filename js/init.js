// NexaAI CRM — init.js (variáveis globais)

const API = 'https://flowai-server-production.up.railway.app';
let TOKEN = localStorage.getItem('nexaai_token');
let USER = JSON.parse(localStorage.getItem('nexaai_user') || 'null');
let selectedPlan = 'starter';
const aiHistory = [];








if (TOKEN && USER) showApp();
else showScreen('login');







const TUTORIAL_FLOWS = {"clinica": {"name": "Cl\u00ednica - Agendamento", "nodes": [{"id": "n1", "type": "start", "x": 100, "y": 100, "label": "In\u00edcio", "sub": ""}, {"id": "n2", "type": "message", "x": 280, "y": 100, "label": "Boas-vindas", "sub": "Ol\u00e1! Bem-vindo \u00e0 nossa cl\u00ednica \ud83c\udfe5 Como posso ajudar voc\u00ea hoje?"}, {"id": "n3", "type": "capture", "x": 460, "y": 100, "label": "Capturar nome", "sub": "Qual \u00e9 o seu nome?", "field": "name"}, {"id": "n4", "type": "ai", "x": 640, "y": 100, "label": "Assistente IA", "sub": "Voc\u00ea \u00e9 um assistente am\u00e1vel de uma cl\u00ednica m\u00e9dica. Responda d\u00favidas sobre procedimentos, pre\u00e7os e hor\u00e1rios. Se o paciente quiser agendar, diga que vai ajud\u00e1-lo."}, {"id": "n5", "type": "end", "x": 820, "y": 100, "label": "Fim", "sub": "Obrigado pelo contato! Em caso de d\u00favidas estamos aqui. \ud83d\ude0a"}]}, "salao": {"name": "Sal\u00e3o - Agendamento", "nodes": [{"id": "n1", "type": "start", "x": 100, "y": 100, "label": "In\u00edcio", "sub": ""}, {"id": "n2", "type": "message", "x": 280, "y": 100, "label": "Boas-vindas", "sub": "Ol\u00e1! \ud83d\udc88 Quer agendar um hor\u00e1rio no nosso sal\u00e3o? Ser\u00e1 um prazer te atender!"}, {"id": "n3", "type": "capture", "x": 460, "y": 100, "label": "Capturar nome", "sub": "Qual \u00e9 o seu nome?", "field": "name"}, {"id": "n4", "type": "ai", "x": 640, "y": 100, "label": "Assistente IA", "sub": "Voc\u00ea \u00e9 um assistente de um sal\u00e3o de beleza. Ajude o cliente a escolher o servi\u00e7o, informe pre\u00e7os e hor\u00e1rios dispon\u00edveis. Seja simp\u00e1tico e use emojis."}, {"id": "n5", "type": "end", "x": 820, "y": 100, "label": "Fim", "sub": "Hor\u00e1rio confirmado! Te esperamos com carinho \u2728"}]}, "restaurante": {"name": "Restaurante - Pedidos", "nodes": [{"id": "n1", "type": "start", "x": 100, "y": 100, "label": "In\u00edcio", "sub": ""}, {"id": "n2", "type": "message", "x": 280, "y": 100, "label": "Boas-vindas", "sub": "Ol\u00e1! \ud83c\udf55 Bem-vindo ao nosso restaurante! Qual ser\u00e1 o seu pedido hoje?"}, {"id": "n3", "type": "ai", "x": 460, "y": 100, "label": "Assistente IA", "sub": "Voc\u00ea \u00e9 um atendente de restaurante. Ajude o cliente com o card\u00e1pio, pre\u00e7os e pedidos. Ap\u00f3s o pedido, pergunte o endere\u00e7o de entrega."}, {"id": "n4", "type": "capture", "x": 640, "y": 100, "label": "Capturar endere\u00e7o", "sub": "Qual \u00e9 o endere\u00e7o de entrega?", "field": "endereco"}, {"id": "n5", "type": "end", "x": 820, "y": 100, "label": "Fim", "sub": "Pedido recebido! \u2705 Tempo estimado de entrega: 40 minutos. Obrigado!"}]}, "imobiliaria": {"name": "Imobili\u00e1ria - Leads", "nodes": [{"id": "n1", "type": "start", "x": 100, "y": 100, "label": "In\u00edcio", "sub": ""}, {"id": "n2", "type": "message", "x": 280, "y": 100, "label": "Boas-vindas", "sub": "Ol\u00e1! \ud83c\udfe0 Bem-vindo. Estamos aqui para ajudar voc\u00ea a encontrar o im\u00f3vel ideal!"}, {"id": "n3", "type": "capture", "x": 460, "y": 100, "label": "Capturar nome", "sub": "Qual \u00e9 o seu nome?", "field": "name"}, {"id": "n4", "type": "ai", "x": 640, "y": 100, "label": "Assistente IA", "sub": "Voc\u00ea \u00e9 um corretor de im\u00f3veis virtual. Qualifique o lead perguntando: tipo de im\u00f3vel (compra/aluguel), bairro preferido, or\u00e7amento e n\u00famero de quartos. Seja profissional."}, {"id": "n5", "type": "end", "x": 820, "y": 100, "label": "Fim", "sub": "Obrigado! Um de nossos corretores entrar\u00e1 em contato em breve. \ud83c\udfe1"}]}, "oficina": {"name": "Oficina - Or\u00e7amentos", "nodes": [{"id": "n1", "type": "start", "x": 100, "y": 100, "label": "In\u00edcio", "sub": ""}, {"id": "n2", "type": "message", "x": 280, "y": 100, "label": "Boas-vindas", "sub": "Ol\u00e1! \ud83d\udd27 Bem-vindo \u00e0 nossa oficina. Qual servi\u00e7o voc\u00ea precisa?"}, {"id": "n3", "type": "capture", "x": 460, "y": 100, "label": "Capturar carro", "sub": "Qual \u00e9 o modelo e ano do seu carro?", "field": "carro"}, {"id": "n4", "type": "ai", "x": 640, "y": 100, "label": "Assistente IA", "sub": "Voc\u00ea \u00e9 um mec\u00e2nico virtual. Colete informa\u00e7\u00f5es sobre o problema do carro, d\u00ea estimativas de pre\u00e7o e prazo. Seja t\u00e9cnico mas acess\u00edvel."}, {"id": "n5", "type": "end", "x": 820, "y": 100, "label": "Fim", "sub": "Agendamento confirmado! Te esperamos na oficina \ud83d\ude97"}]}, "estetica": {"name": "Est\u00e9tica - Agenda", "nodes": [{"id": "n1", "type": "start", "x": 100, "y": 100, "label": "In\u00edcio", "sub": ""}, {"id": "n2", "type": "message", "x": 280, "y": 100, "label": "Boas-vindas", "sub": "Ol\u00e1! \u2728 Bem-vinda ao nosso studio de est\u00e9tica. Qual procedimento voc\u00ea deseja?"}, {"id": "n3", "type": "ai", "x": 460, "y": 100, "label": "Assistente IA", "sub": "Voc\u00ea \u00e9 um assistente de um studio de est\u00e9tica. Explique os procedimentos dispon\u00edveis, pre\u00e7os e cuidados. Seja simp\u00e1tico e use emojis de beleza."}, {"id": "n4", "type": "capture", "x": 640, "y": 100, "label": "Capturar nome", "sub": "Qual \u00e9 o seu nome?", "field": "name"}, {"id": "n5", "type": "end", "x": 820, "y": 100, "label": "Fim", "sub": "Agendamento confirmado! Te esperamos com carinho \ud83d\udc86\u200d\u2640\ufe0f"}]}, "loja": {"name": "Loja - Atendimento", "nodes": [{"id": "n1", "type": "start", "x": 100, "y": 100, "label": "In\u00edcio", "sub": ""}, {"id": "n2", "type": "message", "x": 280, "y": 100, "label": "Boas-vindas", "sub": "Ol\u00e1! \ud83d\udecd\ufe0f Bem-vindo \u00e0 nossa loja! Como posso ajudar voc\u00ea hoje?"}, {"id": "n3", "type": "ai", "x": 460, "y": 100, "label": "Assistente IA", "sub": "Voc\u00ea \u00e9 um vendedor virtual de uma loja. Ajude o cliente com informa\u00e7\u00f5es sobre produtos, tamanhos, cores e pre\u00e7os. Seja amig\u00e1vel e incentive a compra."}, {"id": "n4", "type": "capture", "x": 640, "y": 100, "label": "Capturar email", "sub": "Qual \u00e9 o seu email para receber nossas promo\u00e7\u00f5es?", "field": "email"}, {"id": "n5", "type": "end", "x": 820, "y": 100, "label": "Fim", "sub": "Obrigado! Voc\u00ea receber\u00e1 nossas ofertas exclusivas em breve \ud83c\udf81"}]}, "servicos": {"name": "Servi\u00e7os - Or\u00e7amento", "nodes": [{"id": "n1", "type": "start", "x": 100, "y": 100, "label": "In\u00edcio", "sub": ""}, {"id": "n2", "type": "message", "x": 280, "y": 100, "label": "Boas-vindas", "sub": "Ol\u00e1! \ud83d\udd27 Bem-vindo. Qual servi\u00e7o voc\u00ea precisa?"}, {"id": "n3", "type": "capture", "x": 460, "y": 100, "label": "Capturar nome", "sub": "Qual \u00e9 o seu nome?", "field": "name"}, {"id": "n4", "type": "capture", "x": 640, "y": 100, "label": "Capturar endere\u00e7o", "sub": "Qual \u00e9 o seu endere\u00e7o?", "field": "endereco"}, {"id": "n5", "type": "ai", "x": 820, "y": 100, "label": "Assistente IA", "sub": "Voc\u00ea \u00e9 um prestador de servi\u00e7os. Colete detalhes do servi\u00e7o necess\u00e1rio e d\u00ea uma estimativa de prazo. Seja profissional."}, {"id": "n6", "type": "end", "x": 1000, "y": 100, "label": "Fim", "sub": "Or\u00e7amento enviado em breve! \u2705 Obrigado pelo contato."}]}};



let allContacts=[];
let allLabels=[];

let contactView = 'list';










let allFlows=[];

const nodeColors={start:'#E1F5EE',message:'#E6F1FB',button:'#FAEEDA',ai:'#EEEDFE',condition:'#FCEBEB',end:'#f3f4f6',wait:'#f3f4f6',api:'#EEEDFE'};
const nodeTypeLabel={start:'Inicio',message:'Mensaje',button:'Botones',ai:'Acción IA',condition:'Condición',end:'Final',wait:'Espera',api:'API ext.',capture:'Capturar dato'};
const nodeTypeColor={start:'#0F6E56',message:'#185FA5',button:'#854F0B',ai:'#534AB7',condition:'#A32D2D',end:'#6b7280',wait:'#6b7280',api:'#534AB7',capture:'#0F6E56'};
let flowNodes=[],flowEdges=[],selectedNodeId=null,currentFlowId=null;
const defaultFlow=[{id:0,type:'start',x:30,y:110,label:'Inicio',sub:'Mensaje entrante'},{id:1,type:'message',x:220,y:50,label:'Bienvenida',sub:'Hola, ¿en qué te ayudo?'},{id:2,type:'ai',x:420,y:50,label:'Respuesta IA',sub:'Eres un asistente amable. Responde brevemente.'},{id:3,type:'end',x:610,y:50,label:'Fin',sub:'Conversación cerrada'}];
const defaultEdges=[[0,1],[1,2],[2,3]];



document.getElementById('flow-canvas').addEventListener('dragover',e=>e.preventDefault());
document.getElementById('flow-canvas').addEventListener('drop',e=>{
  e.preventDefault();const type=e.dataTransfer.getData('text/plain');if(!type)return;
  const rect=document.getElementById('flow-canvas').getBoundingClientRect();const id=Date.now();
  flowNodes.push({id:String(id),type,x:e.clientX-rect.left-75,y:e.clientY-rect.top-35,label:nodeTypeLabel[type],sub:'Configura este nodo'});
  renderCanvas();showToast('Nodo añadido');
});
document.querySelectorAll('.node-tpl').forEach(t=>t.addEventListener('dragstart',e=>e.dataTransfer.setData('text/plain',t.dataset.type)));


// ─── AGENTS (MODIFICADO: botón Verificar siempre visible) ───






let allConvs = [];
let activeConvId = null;
let activePhone = null;
let activeStatus = null;














// ── CAMPAÑAS ──
let campContacts = [];
let campSelected = new Set();
let campAllLabels = [];
let campActiveLabel = 'all';



















// ─── AGENDA ───────────────────────────────────────
let agendaView = 'week';
let agendaDate = new Date();
let allAppointments = [];
let editingAppointmentId = null;
















// ─── PAGAMENTOS ───────────────────────────────────





// Init preferences on load
(function(){
  if(localStorage.getItem('nexaai-dark')==='1'){
    document.body.classList.add('dark');
    document.addEventListener('DOMContentLoaded',()=>{
      const icon=document.getElementById('dark-icon');
      if(icon) icon.className='ti ti-sun';
    });
  }
  const lang=localStorage.getItem('nexaai-lang');
  if(lang){
    document.addEventListener('DOMContentLoaded',()=>{
      const sel=document.getElementById('lang-select');
      if(sel) sel.value=lang;
    });
  }
})();

// NexaAI CRM — agenda.js

async function loadAgenda() {
  const data = await api('/api/appointments') || [];
  allAppointments = data;
  renderAgenda();
  const dl = document.getElementById('contacts-datalist');
  if (dl && allContacts.length === 0) await loadContacts();
  if (dl) dl.innerHTML = allContacts.map(c => `<option value="${c.name||''}">${c.name} — ${c.phone}</option>`).join('');
}

function changeAgendaView(view) {
  agendaView = view;
  ['day','week','month'].forEach(v => {
    const btn = document.getElementById('view-' + v + '-btn');
    if (btn) { btn.style.background = v===view?'var(--blue)':''; btn.style.color = v===view?'#fff':''; btn.style.borderColor = v===view?'var(--blue)':'var(--border2)'; }
  });
  renderAgenda();
}

function agendaNavDate(dir) {
  if (agendaView==='day') agendaDate.setDate(agendaDate.getDate() + dir);
  else if (agendaView==='week') agendaDate.setDate(agendaDate.getDate() + dir*7);
  else agendaDate.setMonth(agendaDate.getMonth() + dir);
  agendaDate = new Date(agendaDate);
  renderAgenda();
}

function agendaGoToday() { agendaDate = new Date(); renderAgenda(); }

function renderAgenda() {
  const container = document.getElementById('agenda-container');
  const label = document.getElementById('agenda-date-label');
  if (!container) return;
  if (agendaView === 'week') renderWeekView(container, label);
  else if (agendaView === 'day') renderDayView(container, label);
  else renderMonthView(container, label);
}

function getWeekDays(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day===0?-6:1);
  d.setDate(diff);
  return Array.from({length:7}, (_, i) => { const x = new Date(d); x.setDate(d.getDate()+i); return x; });
}

function aptsForDate(date) {
  const ds = date.toISOString().split('T')[0];
  return allAppointments.filter(a => a.date === ds);
}

function aptColor(status) {
  if (status==='confirmada') return 'green';
  if (status==='cancelada') return 'red';
  return '';
}

function renderWeekView(container, label) {
  const days = getWeekDays(agendaDate);
  const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  label.textContent = `${days[0].getDate()} ${months[days[0].getMonth()]} — ${days[6].getDate()} ${months[days[6].getMonth()]} ${days[6].getFullYear()}`;
  const today = new Date().toISOString().split('T')[0];
  const hours = Array.from({length:14}, (_,i)=>i+7);
  container.innerHTML = `
    <div style="display:grid;grid-template-columns:56px repeat(7,1fr);border-bottom:1px solid var(--border)">
      <div style="padding:8px;border-right:1px solid var(--border)"></div>
      ${days.map(d=>{
        const ds=d.toISOString().split('T')[0];
        const isToday=ds===today;
        return `<div style="padding:8px;text-align:center;border-right:1px solid var(--border);font-size:12px;${isToday?'background:var(--blue-light);color:var(--blue);font-weight:600':''}">
          <div>${['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'][d.getDay()]}</div>
          <div style="font-size:18px;font-weight:700">${d.getDate()}</div>
        </div>`;
      }).join('')}
    </div>
    <div style="overflow-y:auto;max-height:520px">
      ${hours.map(h=>`
        <div style="display:grid;grid-template-columns:56px repeat(7,1fr);border-bottom:1px solid var(--border);min-height:56px">
          <div class="agenda-hour-label">${h}:00</div>
          ${days.map(d=>{
            const apts = aptsForDate(d).filter(a=>a.time && parseInt(a.time.split(':')[0])===h);
            return `<div class="agenda-hour-slot" style="border-right:1px solid var(--border)">
              ${apts.map(a=>`<div class="apt-chip ${aptColor(a.status)}" onclick="openEditAppointment('${a.id}')" title="${a.service||''}">
                <div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${a.time} ${a.contact_name||''}</div>
                <div style="font-size:10px;opacity:.8">${a.service||''}</div>
              </div>`).join('')}
            </div>`;
          }).join('')}
        </div>`).join('')}
    </div>`;
}

function renderDayView(container, label) {
  const months = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  label.textContent = `${agendaDate.getDate()} de ${months[agendaDate.getMonth()]} ${agendaDate.getFullYear()}`;
  const hours = Array.from({length:14}, (_,i)=>i+7);
  const apts = aptsForDate(agendaDate);
  container.innerHTML = `<div style="overflow-y:auto;max-height:580px">
    ${hours.map(h=>{
      const hapts = apts.filter(a=>a.time && parseInt(a.time.split(':')[0])===h);
      return `<div class="agenda-hour">
        <div class="agenda-hour-label">${h}:00</div>
        <div class="agenda-hour-slot">
          ${hapts.map(a=>`<div class="apt-chip ${aptColor(a.status)}" onclick="openEditAppointment('${a.id}')" style="padding:6px 10px">
            <div style="font-weight:600">${a.time} — ${a.contact_name||'Sin nombre'}</div>
            <div style="font-size:11px">${a.service||''} ${a.duration?'('+a.duration+'min)':''}</div>
            ${a.notes?`<div style="font-size:11px;opacity:.7">${a.notes}</div>`:''}
          </div>`).join('')}
        </div>
      </div>`;
    }).join('')}
  </div>`;
}

function renderMonthView(container, label) {
  const months = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const year = agendaDate.getFullYear();
  const month = agendaDate.getMonth();
  label.textContent = `${months[month]} ${year}`;
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month+1, 0);
  const startDay = firstDay.getDay()===0?6:firstDay.getDay()-1;
  const today = new Date().toISOString().split('T')[0];
  let cells = [];
  for(let i=0;i<startDay;i++) cells.push(null);
  for(let i=1;i<=lastDay.getDate();i++) cells.push(new Date(year,month,i));
  while(cells.length%7!==0) cells.push(null);
  container.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(7,1fr);border-bottom:1px solid var(--border)">
      ${['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map(d=>`<div style="padding:8px;text-align:center;font-size:12px;font-weight:600;color:var(--text2);border-right:1px solid var(--border)">${d}</div>`).join('')}
    </div>
    <div style="display:grid;grid-template-columns:repeat(7,1fr)">
      ${cells.map(d=>{
        if(!d) return `<div style="border-right:1px solid var(--border);border-bottom:1px solid var(--border);min-height:90px;background:var(--bg)"></div>`;
        const ds = d.toISOString().split('T')[0];
        const isToday = ds===today;
        const apts = aptsForDate(d);
        return `<div style="border-right:1px solid var(--border);border-bottom:1px solid var(--border);min-height:90px;padding:4px;${isToday?'background:var(--blue-light)':''}">
          <div style="font-size:12px;font-weight:${isToday?'700':'400'};color:${isToday?'var(--blue)':'var(--text)'};margin-bottom:4px">${d.getDate()}</div>
          ${apts.slice(0,3).map(a=>`<div class="apt-chip ${aptColor(a.status)}" onclick="openEditAppointment('${a.id}')" style="font-size:10px;padding:2px 5px">${a.time||''} ${a.contact_name||''}</div>`).join('')}
          ${apts.length>3?`<div style="font-size:10px;color:var(--text3)">+${apts.length-3} más</div>`:''}
        </div>`;
      }).join('')}
    </div>`;
}

function openNewAppointment() {
  editingAppointmentId = null;
  document.getElementById('apt-contact').value = '';
  document.getElementById('apt-phone').value = '';
  document.getElementById('apt-service').value = '';
  document.getElementById('apt-date').value = agendaDate.toISOString().split('T')[0];
  document.getElementById('apt-time').value = '09:00';
  document.getElementById('apt-duration').value = '60';
  document.getElementById('apt-notes').value = '';
  document.getElementById('modal-appointment').style.display = 'flex';
}

function openEditAppointment(id) {
  const a = allAppointments.find(x=>x.id===id);
  if (!a) return;
  editingAppointmentId = id;
  document.getElementById('apt-contact').value = a.contact_name||'';
  document.getElementById('apt-phone').value = a.phone||'';
  document.getElementById('apt-service').value = a.service||'';
  document.getElementById('apt-date').value = a.date||'';
  document.getElementById('apt-time').value = a.time||'';
  document.getElementById('apt-duration').value = a.duration||60;
  document.getElementById('apt-notes').value = a.notes||'';
  document.getElementById('modal-appointment').style.display = 'flex';
}

function closeAppointmentModal() {
  document.getElementById('modal-appointment').style.display = 'none';
}

async function saveAppointment() {
  const payload = {
    contact_name: document.getElementById('apt-contact').value.trim(),
    phone: document.getElementById('apt-phone').value.trim(),
    service: document.getElementById('apt-service').value.trim(),
    date: document.getElementById('apt-date').value,
    time: document.getElementById('apt-time').value,
    duration: parseInt(document.getElementById('apt-duration').value),
    notes: document.getElementById('apt-notes').value.trim(),
    status: 'pendiente'
  };
  if (!payload.contact_name || !payload.date || !payload.time) {
    showToast('❌ Nombre, fecha y hora son requeridos'); return;
  }
  if (editingAppointmentId) {
    await api(`/api/appointments/${editingAppointmentId}`, 'PATCH', payload);
    showToast('✅ Cita actualizada');
  } else {
    await api('/api/appointments', 'POST', payload);
    showToast('✅ Cita creada');
  }
  closeAppointmentModal();
  loadAgenda();
}

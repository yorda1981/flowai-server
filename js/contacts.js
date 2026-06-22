// NexaAI CRM — contacts.js

async function loadContacts(){
  const [data, labelsData]=await Promise.all([api('/api/contacts'), api('/api/labels')]);
allContacts=data||[]; allLabels=labelsData||[]; renderContacts(allContacts);
}

function renderContacts(list){
  const chColors={whatsapp:'green',telegram:'blue',webchat:'amber'};
  const labelColorMap=Object.fromEntries(allLabels.map(l=>[l.name, l.color||'gray']));
  document.getElementById('contacts-body').innerHTML=list.length===0
    ?'<tr><td colspan="6" style="text-align:center;color:var(--text2);padding:20px">No hay contactos. Añade el primero.</td></tr>'
    :list.map(c=>`<tr>
      <td><div style="display:flex;align-items:center;gap:8px"><div class="avatar" style="width:28px;height:28px;font-size:11px">${(c.name||'?').substring(0,2).toUpperCase()}</div>${c.name||'Sin nombre'}</div></td>
      <td style="color:var(--text2)">${c.phone||'—'}</td>
      <td><span class="badge ${chColors[c.channel]||'gray'}">${c.channel||'—'}</span></td>
      <td>
        <div style="display:flex;flex-wrap:wrap;gap:4px;align-items:center">
          ${(c.tags||[]).map(t=>`<span class="badge ${labelColorMap[t]||'gray'}" style="cursor:pointer" onclick="removeTag('${c.id}','${t}','${(c.tags||[]).join(',')}')">${t} ×</span>`).join('')}
          <span class="badge blue" style="cursor:pointer;font-size:11px" onclick="addTag('${c.id}','${(c.tags||[]).join(',')}')"><i class="ti ti-plus" style="font-size:10px"></i> etiqueta</span>
        </div>
      </td>
      <td>
        <select style="font-size:12px;padding:3px 6px;border:1px solid var(--border2);border-radius:var(--radius);background:var(--surface);color:var(--text);outline:none;cursor:pointer" onchange="updateStage('${c.id}',this.value)">
          <option value="" ${!c.pipeline_stage?'selected':''}>— Sin etapa —</option>
          <option value="lead" ${c.pipeline_stage==='lead'?'selected':''}>🎯 Lead</option>
          <option value="interesado" ${c.pipeline_stage==='interesado'?'selected':''}>⭐ Interesado</option>
          <option value="negociacion" ${c.pipeline_stage==='negociacion'?'selected':''}>🤝 Negociación</option>
          <option value="cliente" ${c.pipeline_stage==='cliente'?'selected':''}>🏆 Cliente</option>
        </select>
      </td>
      <td><button class="btn" style="padding:3px 8px;font-size:12px" onclick="deleteContact('${c.id}')"><i class="ti ti-trash"></i></button></td>
    </tr>`).join('');
}

function setContactView(view) {
  contactView = view;
  document.getElementById('contacts-list-view').style.display = view === 'list' ? '' : 'none';
  document.getElementById('contacts-kanban-view').style.display = view === 'kanban' ? '' : 'none';
  document.getElementById('view-list-btn').style.background = view === 'list' ? 'var(--blue)' : '';
  document.getElementById('view-list-btn').style.color = view === 'list' ? '#fff' : '';
  document.getElementById('view-kanban-btn').style.background = view === 'kanban' ? 'var(--blue)' : '';
  document.getElementById('view-kanban-btn').style.color = view === 'kanban' ? '#fff' : '';
  if (view === 'kanban') renderKanban(allContacts);
}

function renderKanban(list) {
  const stages = ['lead','interesado','negociacion','cliente'];
  const stageColors = {lead:'var(--blue)',interesado:'var(--amber)',negociacion:'var(--purple)',cliente:'var(--green)'};
  stages.forEach(stage => {
    const contacts = list.filter(c => c.pipeline_stage === stage);
    document.getElementById('count-' + stage).textContent = contacts.length;
    document.getElementById('kanban-' + stage).innerHTML = contacts.length === 0
      ? `<div style="text-align:center;color:var(--text3);font-size:12px;padding:20px 0">Sin contactos</div>`
      : contacts.map(c => `
        <div class="kanban-card" onclick="openKanbanContact('${c.id}','${(c.name||'').replace(/'/g,"\\'")}','${c.pipeline_stage||''}')">
          <div class="kc-name">${c.name||'Sin nombre'}</div>
          <div class="kc-phone">${c.phone||'—'}</div>
          ${(c.tags||[]).length > 0 ? `<div class="kc-stage">${(c.tags||[]).slice(0,2).map(t=>`<span class="badge gray" style="font-size:10px">${t}</span>`).join('')}</div>` : ''}
          <div style="display:flex;gap:4px;margin-top:6px">
            ${stages.filter(s=>s!==stage).map(s=>`<button class="btn" style="padding:2px 6px;font-size:10px" onclick="event.stopPropagation();moveStage('${c.id}','${s}')" title="Mover a ${s}">→${s.substring(0,3)}</button>`).join('')}
          </div>
        </div>`).join('');
  });
}

async function updateStage(contactId, stage) {
  await api(`/api/contacts/${contactId}`, 'PATCH', { pipeline_stage: stage });
  const c = allContacts.find(x => x.id === contactId);
  if (c) c.pipeline_stage = stage;
  if (contactView === 'kanban') renderKanban(allContacts);
  showToast('Etapa actualizada ✓');
}

async function moveStage(contactId, stage) {
  await updateStage(contactId, stage);
}

function openKanbanContact(id, name, stage) {
  showToast(`${name} — ${stage}`);
}

async function addTag(contactId, currentTagsStr) {
  const currentTags = currentTagsStr ? currentTagsStr.split(',').filter(Boolean) : [];
  // Cargar etiquetas del tenant
  const labels = await api('/api/labels') || [];
  showLabelModal(contactId, currentTags, labels);
}

async function removeTag(contactId, tag, currentTagsStr) {
  const currentTags = currentTagsStr ? currentTagsStr.split(',').filter(Boolean) : [];
  const newTags = currentTags.filter(t => t !== tag);
  await api(`/api/contacts/${contactId}`, 'PATCH', { tags: newTags });
  showToast('Etiqueta eliminada');
  loadContacts();
}

function showLabelModal(contactId, currentTags, labels) {
  // Eliminar modal anterior si existe
  document.getElementById('label-modal')?.remove();

  const modal = document.createElement('div');
  modal.id = 'label-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:9999;display:flex;align-items:center;justify-content:center';
  modal.innerHTML = `
    <div style="background:var(--surface);border-radius:var(--radius-lg);padding:24px;width:360px;box-shadow:0 8px 32px rgba(0,0,0,.2)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <div style="font-weight:600;font-size:15px">Etiquetas del contacto</div>
        <i class="ti ti-x" style="cursor:pointer;font-size:18px;color:var(--text2)" onclick="document.getElementById('label-modal').remove()"></i>
      </div>
      <div id="label-list" style="display:flex;flex-direction:column;gap:8px;max-height:280px;overflow-y:auto;margin-bottom:16px">
        ${labels.length === 0 
          ? '<div style="color:var(--text2);font-size:13px;padding:10px 0">No tienes etiquetas. Crea una abajo.</div>'
          : labels.map(l => `
            <label style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:var(--radius);cursor:pointer;border:1px solid var(--border);hover:background:#f5f5f5">
              <input type="checkbox" value="${l.name}" ${currentTags.includes(l.name)?'checked':''} style="width:16px;height:16px;cursor:pointer;accent-color:var(--blue)">
              <span class="badge ${l.color||'gray'}" style="font-size:12px">${l.name}</span>
            </label>`).join('')
        }
      </div>
      <div style="border-top:1px solid var(--border);padding-top:14px;margin-bottom:14px">
        <div style="font-size:12px;color:var(--text2);margin-bottom:8px;font-weight:500">+ Nueva etiqueta</div>
        <div style="display:flex;gap:8px">
          <input id="new-label-input" type="text" placeholder="Nombre de etiqueta..." style="flex:1;padding:7px 10px;border:1px solid var(--border2);border-radius:var(--radius);font-size:13px;font-family:inherit;outline:none">
          <select id="new-label-color" style="padding:7px;border:1px solid var(--border2);border-radius:var(--radius);font-size:13px;outline:none">
            <option value="gray">Gris</option>
            <option value="blue">Azul</option>
            <option value="green">Verde</option>
            <option value="amber">Naranja</option>
            <option value="red">Rojo</option>
          </select>
          <button class="btn primary" style="padding:7px 12px" onclick="createLabelAndReload('${contactId}','${currentTags.join(',')}')"><i class="ti ti-plus"></i></button>
        </div>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn" onclick="document.getElementById('label-modal').remove()">Cancelar</button>
        <button class="btn primary" onclick="saveLabelModal('${contactId}')"><i class="ti ti-check"></i>Guardar</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if(e.target===modal) modal.remove(); });
}

async function saveLabelModal(contactId) {
  const checks = document.querySelectorAll('#label-list input[type=checkbox]');
  const newTags = Array.from(checks).filter(c => c.checked).map(c => c.value);
  await api(`/api/contacts/${contactId}`, 'PATCH', { tags: newTags });
  document.getElementById('label-modal').remove();
  showToast('Etiquetas actualizadas ✓');
  loadContacts();
}

async function createLabelAndReload(contactId, currentTagsStr) {
  const name = document.getElementById('new-label-input').value.trim();
  const color = document.getElementById('new-label-color').value;
  if (!name) { showToast('Ingresa el nombre'); return; }
  await api('/api/labels', 'POST', { name, color });
  showToast('Etiqueta creada ✓');
  const currentTags = currentTagsStr ? currentTagsStr.split(',').filter(Boolean) : [];
  const labels = await api('/api/labels') || [];
  showLabelModal(contactId, currentTags, labels);
}

function searchContacts(q){const f=q.toLowerCase();renderContacts(allContacts.filter(c=>(c.name||'').toLowerCase().includes(f)||(c.phone||'').includes(f)));}

async function showAddContact(){
  const name=prompt('Nombre del contacto:'); if(!name)return;
  const phone=prompt('Número de teléfono:'); if(!phone)return;
  const channel=prompt('Canal (whatsapp/telegram/webchat):')||'whatsapp';
  await api('/api/contacts','POST',{name,phone,channel});
  showToast('Contacto añadido ✓'); loadContacts();
}

async function deleteContact(id){
  if(!confirm('¿Eliminar este contacto?'))return;
  await api(`/api/contacts/${id}`,'DELETE');
  showToast('Contacto eliminado'); loadContacts();
}

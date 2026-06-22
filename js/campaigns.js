// NexaAI CRM — campaigns.js

function importCampCSV(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    const lines = e.target.result.split('\n').filter(l => l.trim());
    if (!lines.length) { showToast('CSV vazio'); return; }
    
    // Detect header
    const firstLine = lines[0].toLowerCase();
    const hasHeader = firstLine.includes('nome') || firstLine.includes('telefone') || firstLine.includes('phone') || firstLine.includes('name');
    const dataLines = hasHeader ? lines.slice(1) : lines;
    
    let imported = 0;
    let skipped = 0;
    
    dataLines.forEach(line => {
      const cols = line.split(/[,;\t]/).map(c => c.trim().replace(/"/g, ''));
      if (!cols.length) return;
      
      // Try to find phone and name
      let phone = '';
      let name = '';
      
      if (cols.length === 1) {
        // Only phone
        phone = cols[0].replace(/\D/g, '');
      } else if (cols.length >= 2) {
        // Check which column is phone (has digits)
        const col0digits = cols[0].replace(/\D/g, '');
        const col1digits = cols[1].replace(/\D/g, '');
        if (col0digits.length >= 8) {
          phone = col0digits;
          name = cols[1];
        } else if (col1digits.length >= 8) {
          phone = col1digits;
          name = cols[0];
        } else {
          phone = col0digits || col1digits;
          name = cols[0];
        }
      }
      
      if (!phone || phone.length < 8) { skipped++; return; }
      
      // Add to campContacts if not already there
      const exists = campContacts.find(c => c.phone.replace(/\D/g, '') === phone);
      if (!exists) {
        campContacts.push({ id: 'csv_' + phone, name: name || phone, phone });
        campSelected.add('csv_' + phone);
        imported++;
      } else {
        campSelected.add(exists.id);
        imported++;
      }
    });
    
    renderCampContacts(campContacts);
    updateCampCount();
    
    const info = document.getElementById('csv-import-info');
    info.style.display = 'block';
    info.textContent = `✅ ${imported} contatos importados do CSV${skipped > 0 ? ` (${skipped} ignorados por telefone inválido)` : ''}`;
    
    input.value = '';
  };
  reader.readAsText(file);
}

async function loadCampaigns() {
  const data = await api('/api/contacts') || [];
  // Filtrar grupos y números inválidos
  campContacts = data.filter(c => c.phone && !c.phone.includes('@g.us') && !c.phone.includes('@lid') && !c.phone.includes('-'));
  // Extraer etiquetas únicas
  campAllLabels = [...new Set(campContacts.flatMap(c => c.tags || []))].filter(Boolean);
  renderLabelFilters();
}

function renderLabelFilters() {
  const wrap = document.getElementById('camp-label-filters');
  if (!wrap) return;
  const labels = ['all', ...campAllLabels];
  wrap.innerHTML = labels.map(l => `
    <span onclick="campFilterLabel('${l}')" id="camp-lbl-${l}"
      class="badge ${campActiveLabel===l?'blue':''}"
      style="cursor:pointer;padding:4px 12px;font-size:12px">
      ${l==='all'?'Todos los contactos':l}
    </span>`).join('');
}

function campFilterLabel(label) {
  campActiveLabel = label;
  renderLabelFilters();
  const filtered = label === 'all' ? campContacts : campContacts.filter(c => (c.tags||[]).includes(label));
  renderCampContacts(filtered);
}

function campStep2() {
  const name = document.getElementById('camp-name').value.trim();
  const msg = document.getElementById('camp-message').value.trim();
  if (!name) { showToast('Ingresa el nombre de la campaña'); return; }
  if (!msg) { showToast('Escribe el mensaje'); return; }
  document.getElementById('camp-step-1').style.display = 'none';
  document.getElementById('camp-step-2').style.display = 'block';
  campActiveLabel = 'all';
  renderLabelFilters();
  renderCampContacts(campContacts);
}

function renderCampContacts(list) {
  document.getElementById('camp-contacts-list').innerHTML = list.length === 0
    ? '<div style="padding:20px;text-align:center;color:var(--text2);font-size:13px">No hay contactos disponibles</div>'
    : list.map(c => `
    <div onclick="campToggle('${c.id}')" id="camp-c-${c.id}"
      style="padding:10px;border:2px solid ${campSelected.has(c.id)?'var(--blue)':'var(--border)'};border-radius:var(--radius);cursor:pointer;display:flex;align-items:center;gap:8px;background:${campSelected.has(c.id)?'var(--blue-light)':''}">
      <div class="avatar" style="width:28px;height:28px;font-size:11px;flex-shrink:0">${(c.name||'?').substring(0,2).toUpperCase()}</div>
      <div style="min-width:0">
        <div style="font-size:12px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.name||'Sin nombre'}</div>
        <div style="font-size:11px;color:var(--text2)">${c.phone||''}</div>
      </div>
      ${campSelected.has(c.id)?'<i class="ti ti-check" style="margin-left:auto;color:var(--blue);font-size:14px"></i>':''}
    </div>`).join('');
  document.getElementById('camp-count').textContent = campSelected.size + ' contactos seleccionados';
}

function campToggle(id) {
  if (campSelected.has(id)) campSelected.delete(id);
  else campSelected.add(id);
  renderCampContacts(campContacts);
}

function campSelectAll() {
  campContacts.forEach(c => campSelected.add(c.id));
  renderCampContacts(campContacts);
}

function campClearAll() {
  campSelected.clear();
  renderCampContacts(campContacts);
}

function campSearch(q) {
  const filtered = campContacts.filter(c =>
    (c.name||'').toLowerCase().includes(q.toLowerCase()) ||
    (c.phone||'').includes(q)
  );
  renderCampContacts(filtered);
}

function campBack1() {
  document.getElementById('camp-step-2').style.display = 'none';
  document.getElementById('camp-step-1').style.display = 'block';
}

function campStep3() {
  if (campSelected.size === 0) { showToast('Selecciona al menos un contacto'); return; }
  const name = document.getElementById('camp-name').value.trim();
  const msg = document.getElementById('camp-message').value.trim();
  const interval = parseInt(document.getElementById('camp-interval').value) || 5;
  const totalSecs = campSelected.size * interval;
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  document.getElementById('camp-rev-name').textContent = name;
  document.getElementById('camp-rev-count').textContent = campSelected.size + ' contactos';
  document.getElementById('camp-rev-interval').textContent = interval + ' segundos';
  document.getElementById('camp-rev-time').textContent = mins > 0 ? `~${mins}m ${secs}s` : `~${secs}s`;
  document.getElementById('camp-rev-msg').textContent = msg;
  document.getElementById('camp-step-2').style.display = 'none';
  document.getElementById('camp-step-3').style.display = 'block';
}

function campBack2() {
  document.getElementById('camp-step-3').style.display = 'none';
  document.getElementById('camp-step-2').style.display = 'block';
}

async function startCampaign() {
  const msg = document.getElementById('camp-message').value.trim();
  const interval = parseInt(document.getElementById('camp-interval').value) || 5;
  const selectedContacts = campContacts.filter(c => campSelected.has(c.id));

  document.getElementById('camp-send-btn').disabled = true;
  document.getElementById('camp-ready-msg').style.display = 'none';
  document.getElementById('camp-progress-wrap').style.display = 'block';
  document.getElementById('camp-action-btns').querySelector('.btn').style.display = 'none';

  const log = document.getElementById('camp-prog-log');
  let sent = 0;

  for (const contact of selectedContacts) {
    const text = msg.replace(/\{nombre\}/gi, contact.name || contact.phone);
    try {
      await api('/api/campaigns/send', 'POST', { phone: contact.phone, message: text });
      sent++;
      log.innerHTML += `<div style="color:var(--green)"><i class="ti ti-check"></i> ${contact.name||contact.phone}</div>`;
    } catch {
      log.innerHTML += `<div style="color:var(--red)"><i class="ti ti-x"></i> ${contact.name||contact.phone} — error</div>`;
    }
    log.scrollTop = log.scrollHeight;
    const pct = Math.round((sent / selectedContacts.length) * 100);
    document.getElementById('camp-prog-bar').style.width = pct + '%';
    document.getElementById('camp-prog-pct').textContent = pct + '%';
    document.getElementById('camp-prog-text').textContent = `Enviando ${sent} de ${selectedContacts.length}...`;
    if (sent < selectedContacts.length) await new Promise(r => setTimeout(r, interval * 1000));
  }

  document.getElementById('camp-prog-text').textContent = `✅ Campaña completada — ${sent} mensajes enviados`;
  document.getElementById('camp-send-btn').disabled = false;
  showToast(`✅ Campaña enviada a ${sent} contactos`);
}

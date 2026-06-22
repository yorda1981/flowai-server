// NexaAI CRM — blocked.js

async function loadBlocked() {
  const data = await api('/api/webhook/blocked/' + USER.id) || [];
  const tbody = document.getElementById('blocked-body');
  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4"><div style="padding:20px;text-align:center;color:var(--text2);font-size:13px">No hay números bloqueados</div></td></tr>';
    return;
  }
  tbody.innerHTML = data.map(b => `
    <tr>
      <td><span style="font-family:monospace;font-size:13px">${b.phone}</span></td>
      <td style="color:var(--text2)">${b.reason || '—'}</td>
      <td style="color:var(--text2);font-size:12px">${new Date(b.created_at).toLocaleDateString('pt-BR')}</td>
      <td><button class="btn" style="color:var(--red);border-color:var(--red-light)" onclick="removeBlocked('${b.id}')"><i class="ti ti-trash"></i>Desbloquear</button></td>
    </tr>`).join('');
}

async function addBlocked() {
  const phone = document.getElementById('block-phone-input').value.trim();
  const reason = document.getElementById('block-reason-input').value.trim();
  if (!phone) { showToast('Ingresa un número'); return; }
  const data = await api('/api/webhook/blocked/' + USER.id, 'POST', { phone, reason });
  if (data?.id) {
    showToast('✅ Número bloqueado');
    document.getElementById('block-phone-input').value = '';
    document.getElementById('block-reason-input').value = '';
    loadBlocked();
  } else {
    showToast('❌ Error al bloquear');
  }
}

async function removeBlocked(id) {
  if (!confirm('¿Desbloquear este número?')) return;
  await api('/api/webhook/blocked/' + USER.id + '/' + id, 'DELETE');
  showToast('Número desbloqueado');
  loadBlocked();
}

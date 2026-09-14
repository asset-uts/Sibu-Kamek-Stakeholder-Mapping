const TEMPLATE_ID = TEMPLATE_SESSION_ID;
const dashboardState = {
  sessions: [],
  stakeholdersBySession: {},
  linksBySession: {},
  selectedIds: new Set(),
  previewBlob: null,
  previewUrl: null
};

function relativeTime(value) { if (!value) return 'No edits yet'; const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000)); if (seconds < 60) return 'Edited just now'; if (seconds < 3600) return `Edited ${Math.floor(seconds / 60)}m ago`; if (seconds < 86400) return `Edited ${Math.floor(seconds / 3600)}h ago`; return `Edited ${Math.floor(seconds / 86400)}d ago`; }

function drawPreview(svg, items) {
  const NS = 'http://www.w3.org/2000/svg'; const W = 320; const H = 150; const pad = { l: 24, r: 14, t: 14, b: 20 }; const x0 = pad.l; const y0 = pad.t; const x1 = W - pad.r; const y1 = H - pad.b;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.innerHTML = `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="#F4F1E8" stroke="#DCD2BE"/><line x1="${(x0 + x1) / 2}" y1="${y0}" x2="${(x0 + x1) / 2}" y2="${y1}" stroke="#DCD2BE"/><line x1="${x0}" y1="${(y0 + y1) / 2}" x2="${x1}" y2="${(y0 + y1) / 2}" stroke="#DCD2BE"/>`;
  for (const item of items.filter(item => typeof item.x === 'number' && typeof item.y === 'number')) {
    const circle = document.createElementNS(NS, 'circle');
    circle.setAttribute('cx', x0 + (item.x - 110) / 850 * (x1 - x0));
    circle.setAttribute('cy', y0 + (item.y - 40) / 650 * (y1 - y0));
    circle.setAttribute('r', '3.5');
    circle.setAttribute('fill', CATS[item.category]?.[1] || '#24413A');
    svg.appendChild(circle);
  }
}

function getParticipantNames(session) {
  return Array.isArray(session?.participant_names) ? session.participant_names.filter(Boolean) : [];
}

function renderParticipantPills(container, names) {
  container.innerHTML = '';
  if (!names.length) {
    const empty = document.createElement('span');
    empty.className = 'participant-empty';
    empty.textContent = 'No prior participants';
    container.appendChild(empty);
    return;
  }
  const visible = names.slice(0, 5);
  visible.forEach(name => {
    const chip = document.createElement('span');
    chip.className = 'participant-chip';
    chip.textContent = name;
    container.appendChild(chip);
  });
  if (names.length > visible.length) {
    const more = document.createElement('span');
    more.className = 'participant-more';
    more.textContent = `+${names.length - visible.length} more`;
    container.appendChild(more);
  }
}

function closeCardDropdowns() {
  document.querySelectorAll('.card-dropdown').forEach(menu => menu.classList.add('hidden'));
}

function updateExportButton() {
  const button = document.getElementById('dashboardExportButton');
  const isActive = document.body.classList.contains('export-mode');
  const count = dashboardState.selectedIds.size;
  button.textContent = isActive ? (count ? `Export ${count} session${count === 1 ? '' : 's'}` : 'Select sessions') : 'Export sessions';
  button.setAttribute('aria-pressed', String(isActive));
}

function cancelExportSelection() {
  dashboardState.selectedIds.clear();
  document.body.classList.remove('export-mode');
  document.querySelectorAll('[data-role="session-select"]').forEach(input => { input.checked = false; });
  document.querySelectorAll('.session-card.export-selected').forEach(card => card.classList.remove('export-selected'));
  updateExportButton();
}

function buildSessionMapSvg(items, links) {
  const NS = 'http://www.w3.org/2000/svg';
  const W = 1000; const H = 780;
  const PAD = { l: 110, r: 40, t: 40, b: 90 };
  const GX0 = PAD.l; const GY0 = PAD.t; const GX1 = W - PAD.r; const GY1 = H - PAD.b;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('xmlns', NS);
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const rect = document.createElementNS(NS, 'rect');
  rect.setAttribute('x', GX0); rect.setAttribute('y', GY0);
  rect.setAttribute('width', GX1 - GX0); rect.setAttribute('height', GY1 - GY0);
  rect.setAttribute('fill', '#F4F1E8'); rect.setAttribute('stroke', '#DCD2BE');
  rect.setAttribute('stroke-width', 2);
  svg.appendChild(rect);
  const mx = (GX0 + GX1) / 2; const my = (GY0 + GY1) / 2;
  const axis1 = document.createElementNS(NS, 'line'); axis1.setAttribute('x1', mx); axis1.setAttribute('y1', GY0); axis1.setAttribute('x2', mx); axis1.setAttribute('y2', GY1); axis1.setAttribute('stroke', '#DCD2BE'); axis1.setAttribute('stroke-width', 1.5); svg.appendChild(axis1);
  const axis2 = document.createElementNS(NS, 'line'); axis2.setAttribute('x1', GX0); axis2.setAttribute('y1', my); axis2.setAttribute('x2', GX1); axis2.setAttribute('y2', my); axis2.setAttribute('stroke', '#DCD2BE'); axis2.setAttribute('stroke-width', 1.5); svg.appendChild(axis2);
  const labels = [ ['KEEP SATISFIED', GX0 + 18, GY0 + 30], ['MANAGE CLOSELY', mx + 18, GY0 + 30], ['MONITOR', GX0 + 18, my + 30], ['KEEP INFORMED', mx + 18, my + 30] ];
  labels.forEach(([text, x, y]) => { const el = document.createElementNS(NS, 'text'); el.setAttribute('x', x); el.setAttribute('y', y); el.setAttribute('font-family', 'Georgia,serif'); el.setAttribute('font-size', 13); el.setAttribute('font-weight', 'normal'); el.setAttribute('fill', '#B5AC97'); el.setAttribute('letter-spacing', 2); el.textContent = text; svg.appendChild(el); });
  const defs = document.createElementNS(NS, 'defs');
  const marker = document.createElementNS(NS, 'marker'); marker.setAttribute('id', 'exportArrow'); marker.setAttribute('viewBox', '0 0 10 10'); marker.setAttribute('refX', 9); marker.setAttribute('refY', 5); marker.setAttribute('markerWidth', 6); marker.setAttribute('markerHeight', 6); marker.setAttribute('orient', 'auto-start-reverse');
  const arrow = document.createElementNS(NS, 'path'); arrow.setAttribute('d', 'M0 1 L10 5 L0 9 z'); arrow.setAttribute('fill', '#6B6455'); marker.appendChild(arrow); defs.appendChild(marker); svg.appendChild(defs);
  const itemMap = new Map(items.map(item => [item.id, item]));
  (links || []).forEach(link => {
    const A = itemMap.get(link.a || link.source_id); const B = itemMap.get(link.b || link.target_id);
    if (!A || !B || typeof A.x !== 'number' || typeof B.x !== 'number') return;
    const line = document.createElementNS(NS, 'line');
    line.setAttribute('x1', A.x); line.setAttribute('y1', A.y); line.setAttribute('x2', B.x); line.setAttribute('y2', B.y);
    line.setAttribute('stroke', '#6B6455'); line.setAttribute('stroke-width', 1.6); line.setAttribute('opacity', 0.65); line.setAttribute('marker-end', 'url(#exportArrow)');
    svg.appendChild(line);
  });
  items.forEach(item => {
    if (typeof item.x !== 'number' || typeof item.y !== 'number') return;
    const g = document.createElementNS(NS, 'g');
    const circle = document.createElementNS(NS, 'circle');
    circle.setAttribute('cx', item.x); circle.setAttribute('cy', item.y); circle.setAttribute('r', 8); circle.setAttribute('fill', CATS[item.category]?.[1] || '#24413A'); circle.setAttribute('stroke', '#fff'); circle.setAttribute('stroke-width', 2); g.appendChild(circle);
    const text = document.createElementNS(NS, 'text');
    text.setAttribute('x', item.x + 14); text.setAttribute('y', item.y + 4); text.setAttribute('font-family', 'Georgia,serif'); text.setAttribute('font-size', 12.5); text.setAttribute('fill', '#24413A');
    text.textContent = (item.name || '').length > 34 ? `${(item.name || '').slice(0, 32)}…` : (item.name || '');
    g.appendChild(text); svg.appendChild(g);
  });
  return svg;
}

async function svgToPngDataUrl(svg) {
  return new Promise((resolve, reject) => {
    const source = new XMLSerializer().serializeToString(svg);
    const url = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml;charset=utf-8' }));
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 2000; canvas.height = 1500;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#FBF8F2';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/png'));
      URL.revokeObjectURL(url);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not render the session map.'));
    };
    image.src = url;
  });
}

function addMultilineText(pdf, text, x, y, maxWidth, lineHeight) {
  const lines = pdf.splitTextToSize(String(text || ''), maxWidth);
  pdf.text(lines, x, y, { baseline: 'top' });
  return (Array.isArray(lines) ? lines.length : 1) * lineHeight;
}

async function exportSelectedSessions() {
  const selectedIds = Array.from(dashboardState.selectedIds);
  if (!selectedIds.length) {
    notify('Select one or more sessions to export.');
    return;
  }
  if (!window.jspdf || !window.jspdf.jsPDF) {
    notify('Export preview is unavailable in this browser.');
    return;
  }

  const selectedSessions = dashboardState.sessions.filter(session => selectedIds.includes(session.id));
  const pdf = new window.jspdf.jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 42;
  const contentWidth = pageWidth - margin * 2;
  const startY = margin;
  let pageNumber = 1;

  const ensureSpace = (needed, y) => {
    if (y + needed > pageHeight - margin) {
      pdf.addPage();
      pageNumber += 1;
      return startY;
    }
    return y;
  };

  const sectionTitle = (label, y) => {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    pdf.setTextColor(36, 65, 58);
    pdf.setCharSpace(0);
    pdf.text(label, margin, y, { align: 'left', baseline: 'top' });
    pdf.setTextColor(0, 0, 0);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
  };

  const wrappedLines = text => pdf.splitTextToSize(String(text || ''), contentWidth);

  for (const [sessionIndex, session] of selectedSessions.entries()) {
    const allItems = dashboardState.stakeholdersBySession[session.id] || [];
    const placedItems = allItems.filter(item => typeof item.x === 'number' && typeof item.y === 'number');
    const participantNames = getParticipantNames(session);
    const itemMap = new Map(allItems.map(item => [item.id, item]));
    const placedLinks = (dashboardState.linksBySession[session.id] || []).filter(link => itemMap.has(link.source_id || link.a) && itemMap.has(link.target_id || link.b));

    if (sessionIndex > 0) {
      pdf.addPage();
      pageNumber += 1;
    }
    let y = startY;

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(18);
    pdf.setTextColor(36, 65, 58);
    pdf.text(session.name || 'Untitled session', margin, y);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.text(`Created ${new Date(session.created_at || Date.now()).toLocaleString()}`, margin, y + 18);
    pdf.text(`${placedItems.length} placed stakeholders · ${placedLinks.length} influence links`, margin, y + 32);
    y += 42;

    try {
      const svg = buildSessionMapSvg(placedItems, placedLinks);
      const imageData = await svgToPngDataUrl(svg);
      const imageProps = pdf.getImageProperties(imageData);
      const mapWidth = contentWidth;
      const mapHeight = (imageProps.height * mapWidth) / imageProps.width;
      y = ensureSpace(mapHeight + 18, y);
      pdf.addImage(imageData, 'PNG', margin, y, mapWidth, mapHeight, undefined, 'FAST');
      y += mapHeight + 18;
    } catch (error) {
      console.error(error);
      pdf.setTextColor(163, 59, 44);
      pdf.text('Map preview unavailable for this session.', margin, y);
      pdf.setTextColor(0, 0, 0);
      y += 18;
    }

    if (participantNames.length) {
      const participantsText = participantNames.join(', ');
      const participantHeight = wrappedLines(participantsText).length * 12;
      y = ensureSpace(16 + participantHeight + 12, y);
      sectionTitle('Participants', y);
      y += 16;
      y += addMultilineText(pdf, participantsText, margin, y, contentWidth, 12);
      y += 12;
    }

    y = ensureSpace(28, y);
    sectionTitle('Stakeholders on map', y);
    y += 16;
    if (placedItems.length) {
      const stakeholderEntries = placedItems.map(item => `• ${item.name || 'Unnamed stakeholder'} — ${CATS[item.category]?.[0] || 'Unknown category'}`);
      for (const entry of stakeholderEntries) {
        const wrapped = pdf.splitTextToSize(entry, contentWidth);
        y = ensureSpace(wrapped.length * 12 + 4, y);
        pdf.setCharSpace(0);
        pdf.text(wrapped, margin, y, { align: 'left', baseline: 'top' });
        y += wrapped.length * 12 + 4;
      }
    } else {
      y = ensureSpace(14, y);
      pdf.text('No placed stakeholders in this session.', margin, y);
      y += 14;
    }

    if (placedLinks.length) {
      y = ensureSpace(28, y);
      sectionTitle('Influence links', y);
      y += 16;
      const linkEntries = placedLinks.map(link => {
        const source = itemMap.get(link.source_id || link.a)?.name || 'Unknown';
        const target = itemMap.get(link.target_id || link.b)?.name || 'Unknown';
        return `- ${source} -> ${target}`;
      });
      for (const entry of linkEntries) {
        const wrapped = pdf.splitTextToSize(entry, contentWidth);
        y = ensureSpace(wrapped.length * 12 + 4, y);
        pdf.setCharSpace(0);
        pdf.text(wrapped, margin, y, { align: 'left', baseline: 'top' });
        y += wrapped.length * 12 + 4;
      }
    }
  }

  const blob = pdf.output('blob');
  const overlay = document.getElementById('exportPreviewOverlay');
  const iframe = document.getElementById('exportPreviewFrame');
  if (dashboardState.previewUrl) URL.revokeObjectURL(dashboardState.previewUrl);
  dashboardState.previewBlob = blob;
  dashboardState.previewUrl = URL.createObjectURL(blob);
  iframe.src = dashboardState.previewUrl;
  overlay.classList.remove('hidden');
}

async function loadDashboard() {
  const grid = document.getElementById('sessionGrid'); const errorBox = document.getElementById('dashboardError');
  grid.innerHTML = '<p class="hint">Loading sessions...</p>'; errorBox.textContent = '';
  const { data: sessions, error } = await supabaseClient.from('sessions').select('id,name,created_at,updated_at,join_code,participant_names,creator_type').neq('id', TEMPLATE_ID).eq('creator_type', 'admin').order('updated_at', { ascending: false });
  if (error) { errorBox.textContent = 'Could not load sessions.'; console.error(error); return; }
  const ids = (sessions || []).map(session => session.id);
  let stakeholders = [];
  let links = [];
  if (ids.length) {
    const stakeholderResult = await supabaseClient.from('stakeholders').select('*').in('session_id', ids);
    const linkResult = await supabaseClient.from('influence_links').select('*').in('session_id', ids);
    if (stakeholderResult.error) console.error(stakeholderResult.error); else stakeholders = stakeholderResult.data || [];
    if (linkResult.error) console.error(linkResult.error); else links = linkResult.data || [];
  }
  const bySession = {}; const linkBySession = {};
  stakeholders.forEach(item => (bySession[item.session_id] ||= []).push(item));
  links.forEach(link => (linkBySession[link.session_id] ||= []).push(link));
  dashboardState.sessions = sessions || [];
  dashboardState.stakeholdersBySession = bySession;
  dashboardState.linksBySession = linkBySession;
  grid.innerHTML = '';
  if (!dashboardState.sessions.length) { grid.innerHTML = '<p class="hint">No sessions yet. Create one to get started.</p>'; return; }

  dashboardState.sessions.forEach(session => {
    const card = document.createElement('article');
    card.className = 'session-card';
    const participants = getParticipantNames(session);
    const tagIds = Array.from(dashboardState.selectedIds);
    const isSelected = tagIds.includes(session.id);
    card.innerHTML = `
      <div class="session-card-main">
        <div class="session-card-top">
          <label class="session-select" title="Select this session for export">
            <input type="checkbox" ${isSelected ? 'checked' : ''} data-role="session-select" aria-label="Select session ${session.name || 'Untitled session'}">
          </label>
          <div class="session-card-head">
            <h2></h2>
            <div class="session-meta"></div>
          </div>
          <div class="card-menu-wrap">
            <button class="card-menu-trigger" data-action="menu" type="button" aria-label="Open session actions">⋮</button>
            <div class="card-dropdown hidden">
              <button data-action="rename" type="button">Rename</button>
              <button data-action="duplicate" type="button">Duplicate</button>
              <button data-action="copy" type="button">Copy share link</button>
              <button data-action="delete" type="button">Delete</button>
            </div>
          </div>
        </div>
        <svg class="preview" aria-label="Session preview"></svg>
        <div class="participant-list" data-role="participant-list"></div>
      </div>
    `;
    card.querySelector('h2').textContent = session.name || 'Untitled session';
    card.querySelector('.session-meta').textContent = `${relativeTime(session.updated_at)} · ${(bySession[session.id] || []).length} stakeholders · code ${session.join_code || '—'}`;
    drawPreview(card.querySelector('svg'), bySession[session.id] || []);
    renderParticipantPills(card.querySelector('[data-role="participant-list"]'), participants);

    const selectInput = card.querySelector('[data-role="session-select"]');
    const setSelected = selected => {
      selectInput.checked = selected;
      card.classList.toggle('export-selected', selected);
      if (selected) dashboardState.selectedIds.add(session.id); else dashboardState.selectedIds.delete(session.id);
      updateExportButton();
    };

    selectInput.addEventListener('change', event => {
      event.stopPropagation();
      setSelected(selectInput.checked);
    });

    card.classList.toggle('export-selected', isSelected);
    card.addEventListener('click', event => {
      if (event.target.closest('button, input')) return;
      if (document.body.classList.contains('export-mode')) {
        setSelected(!selectInput.checked);
        return;
      }
      window.location.href = `mapping.html?session=${encodeURIComponent(session.id)}`;
    });

    selectInput.closest('.session-select').addEventListener('click', event => event.stopPropagation());

    const menuTrigger = card.querySelector('.card-menu-trigger');
    const dropdown = card.querySelector('.card-dropdown');
    menuTrigger.addEventListener('click', event => {
      event.stopPropagation();
      closeCardDropdowns();
      dropdown.classList.toggle('hidden');
    });

    dropdown.querySelector('[data-action="copy"]').addEventListener('click', async event => {
      event.stopPropagation();
      dropdown.classList.add('hidden');
      try { await navigator.clipboard.writeText(shareUrl(session.id)); notify('Session URL copied to clipboard.'); } catch (copyError) { notify('Unable to copy the session URL.'); console.error(copyError); }
    });
    dropdown.querySelector('[data-action="rename"]').addEventListener('click', async event => {
      event.stopPropagation();
      dropdown.classList.add('hidden');
      const name = prompt('Session name', session.name || ''); if (name === null || !name.trim()) return; const result = await supabaseClient.from('sessions').update({ name: name.trim(), updated_at: new Date().toISOString() }).eq('id', session.id); if (result.error) errorBox.textContent = 'Could not rename the session.'; else loadDashboard();
    });
    dropdown.querySelector('[data-action="duplicate"]').addEventListener('click', async event => {
      event.stopPropagation();
      dropdown.classList.add('hidden');
      try { await cloneSession(session.id, `${session.name || 'Untitled session'} (copy)`); notify('Session duplicated.'); loadDashboard(); } catch (duplicateError) { errorBox.textContent = 'Could not duplicate the session.'; console.error(duplicateError); }
    });
    dropdown.querySelector('[data-action="delete"]').addEventListener('click', async event => {
      event.stopPropagation();
      dropdown.classList.add('hidden');
      if (!confirm(`Delete ${session.name || 'this session'}? This cannot be undone.`)) return;
      const links = await supabaseClient.from('influence_links').delete().eq('session_id', session.id);
      const items = await supabaseClient.from('stakeholders').delete().eq('session_id', session.id);
      const deleted = await supabaseClient.from('sessions').delete().eq('id', session.id);
      const failure = links.error || items.error || deleted.error;
      if (failure) { errorBox.textContent = 'Could not delete the session completely.'; console.error(failure); } else { dashboardState.selectedIds.delete(session.id); loadDashboard(); }
    });

    grid.appendChild(card);
  });
}

async function createSession() { const name = prompt('Session name', 'New Session'); if (name === null || !name.trim()) return; try { const session = await cloneSession(TEMPLATE_ID, name.trim()); window.location.href = `mapping.html?session=${encodeURIComponent(session.id)}`; } catch (error) { document.getElementById('dashboardError').textContent = 'Could not create the session.'; console.error(error); } }

document.getElementById('newSession').onclick = createSession;
document.getElementById('importSession').onclick = () => document.getElementById('importFile').click();
document.getElementById('importFile').onchange = async event => { const file = event.target.files[0]; event.target.value = ''; if (!file) return; try { const name = prompt('Name for imported session', file.name.replace(/\.json$/i, '') || 'Imported session'); if (name === null || !name.trim()) return; await importMapFile(file, name.trim()); notify('Session imported.'); loadDashboard(); } catch (error) { document.getElementById('dashboardError').textContent = error.message === 'Unexpected end of JSON input' ? 'The selected file is not valid JSON.' : error.message; console.error(error); } };
document.getElementById('dashboardSignOut').onclick = async () => { if (!confirm('Are you sure you want to sign out?')) return; clearDisplayName(); await supabaseClient.auth.signOut(); window.location.replace('index.html'); };
updateExportButton();
document.getElementById('dashboardExportButton').onclick = () => {
  const isActive = document.body.classList.contains('export-mode');
  if (!isActive) {
    document.body.classList.add('export-mode');
    updateExportButton();
    return;
  }

  if (dashboardState.selectedIds.size === 0) {
    notify('Select one or more sessions to export.');
    return;
  }

  document.body.classList.remove('export-mode');
  updateExportButton();
  exportSelectedSessions();
};
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || !document.body.classList.contains('export-mode')) return;
  cancelExportSelection();
});
document.getElementById('exportPreviewCancel').onclick = () => {
  const overlay = document.getElementById('exportPreviewOverlay');
  const iframe = document.getElementById('exportPreviewFrame');
  iframe.src = '';
  overlay.classList.add('hidden');
  if (dashboardState.previewUrl) URL.revokeObjectURL(dashboardState.previewUrl);
  dashboardState.previewUrl = null;
  dashboardState.previewBlob = null;
};
document.getElementById('exportPreviewDownload').onclick = () => {
  if (!dashboardState.previewBlob) return;
  const sessionNames = dashboardState.sessions.filter(session => dashboardState.selectedIds.has(session.id)).map(session => (session.name || 'Untitled session').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'session');
  const fileName = sessionNames.length ? `${sessionNames.slice(0, 2).join('_') || 'selected-sessions'}.pdf` : 'selected-sessions.pdf';
  downloadBlob(dashboardState.previewBlob, fileName);
  document.getElementById('exportPreviewOverlay').classList.add('hidden');
  if (dashboardState.previewUrl) URL.revokeObjectURL(dashboardState.previewUrl);
  dashboardState.previewUrl = null;
  dashboardState.previewBlob = null;
};
document.addEventListener('click', event => {
  if (document.body.classList.contains('export-mode') && !event.target.closest('#sessionGrid, #dashboardExportButton')) {
    cancelExportSelection();
  }
  if (!event.target.closest('.card-menu-trigger')) closeCardDropdowns();
});

(async () => { const { data } = await supabaseClient.auth.getSession(); if (!data.session || !isAdminSession(data.session)) { window.location.replace('index.html'); return; } await loadDashboard(); supabaseClient.auth.onAuthStateChange((event, session) => { if (!session || !isAdminSession(session)) window.location.replace('index.html'); }); })();

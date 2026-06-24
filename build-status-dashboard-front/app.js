(function () {
  const API = '/api/status';
  const REFRESH_MS = 30000;

  const $services = document.getElementById('services');
  const $active = document.getElementById('active-incidents');
  const $history = document.getElementById('incident-history');
  const $refresh = document.getElementById('refresh-info');

  function uptimeColor(pct) {
    if (pct >= 99.5) return '#3fb950';
    if (pct >= 95) return '#d29922';
    return '#f85149';
  }

  function statusClass(s) {
    if (s === 'operational') return 'operational';
    if (s === 'degraded') return 'degraded';
    return 'down';
  }

  function badgeClass(s) {
    if (s === 'active') return 'badge-active';
    if (s === 'monitoring') return 'badge-monitoring';
    return 'badge-resolved';
  }

  function fmtTime(ts) {
    return new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function renderServices(services) {
    if (!services || !services.length) { $services.innerHTML = '<div class="empty-state">No services configured</div>'; return; }
    $services.innerHTML = services.map(s => `
      <div class="service-card">
        <div style="flex:1;min-width:0">
          <div class="service-name">${esc(s.name)}</div>
          <div class="uptime-bar"><div class="uptime-fill" style="width:${s.uptime}%;background:${uptimeColor(s.uptime)}"></div></div>
          <div class="uptime-pct">${s.uptime.toFixed(2)}% uptime · ${esc(s.status)}</div>
        </div>
        <div class="status-dot ${statusClass(s.status)}"></div>
      </div>`).join('');
  }

  function renderIncidents(incidents, container, onlyActive) {
    const list = (incidents || []).filter(i => onlyActive ? i.status !== 'resolved' : i.status === 'resolved');
    if (!list.length) { container.innerHTML = `<div class="empty-state">${onlyActive ? 'All systems operational' : 'No past incidents'}</div>`; return; }
    if (onlyActive) {
      container.innerHTML = list.map(i => `
        <div class="incident">
          <div class="incident-header">
            <span class="incident-title">${esc(i.title)}</span>
            <span class="incident-badge ${badgeClass(i.status)}">${esc(i.status)}</span>
          </div>
          <div class="incident-time">Started ${fmtTime(i.started)}</div>
          <div class="incident-body">${esc(i.description)}</div>
        </div>`).join('');
    } else {
      container.innerHTML = list.slice(0, 20).map(i => `
        <div class="timeline-event resolved">
          <div class="timeline-time">${fmtTime(i.started)}${i.resolved ? ' → ' + fmtTime(i.resolved) : ''}</div>
          <div class="timeline-text"><strong>${esc(i.title)}</strong> — ${esc(i.description)}</div>
        </div>`).join('');
    }
  }

  function esc(s) { const d = document.createElement('span'); d.textContent = s; return d.innerHTML; }

  async function fetchStatus() {
    try {
      const res = await fetch(API);
      if (!res.ok) throw new Error(res.statusText);
      const data = await res.json();
      renderServices(data.services);
      renderIncidents(data.incidents, $active, true);
      renderIncidents(data.incidents, $history, false);
      $refresh.textContent = 'Last updated: ' + new Date().toLocaleTimeString();
    } catch (e) {
      console.error('Status fetch failed:', e);
      $refresh.textContent = 'Update failed — retrying…';
    }
  }

  fetchStatus();
  setInterval(fetchStatus, REFRESH_MS);
})();
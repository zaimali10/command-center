// System resource monitor — placeholder for future Hermes telemetry endpoint.
export function mountMonitor() {
  const el = document.getElementById('widget-monitor');
  if (!el) return;
  el.innerHTML = `
    <h2>System Monitor</h2>
    <div class="mon-grid">
      <div class="mon-cell">
        <div class="mon-k">CPU</div>
        <div class="mon-v">—</div>
        <div class="mon-bar"><span style="width:0%"></span></div>
      </div>
      <div class="mon-cell">
        <div class="mon-k">Memory</div>
        <div class="mon-v">—</div>
        <div class="mon-bar"><span style="width:0%"></span></div>
      </div>
      <div class="mon-cell">
        <div class="mon-k">Disk</div>
        <div class="mon-v">—</div>
        <div class="mon-bar"><span style="width:0%"></span></div>
      </div>
    </div>
    <div class="mon-foot">awaiting telemetry endpoint</div>
  `;
}

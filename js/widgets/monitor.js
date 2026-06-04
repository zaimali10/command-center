// System resource monitor — live telemetry from telemetry.py
let pollTimer = null;

export function mountMonitor() {
  const el = document.getElementById('widget-monitor');
  if (!el) return;
  el.innerHTML = `
    <h2>System Monitor</h2>
    <div class="mon-grid">
      <div class="mon-cell">
        <div class="mon-k">CPU</div>
        <div class="mon-v" id="mon-cpu">—</div>
        <div class="mon-bar"><span id="mon-cpu-bar" style="width:0%"></span></div>
      </div>
      <div class="mon-cell">
        <div class="mon-k">Memory</div>
        <div class="mon-v" id="mon-mem">—</div>
        <div class="mon-bar"><span id="mon-mem-bar" style="width:0%"></span></div>
      </div>
      <div class="mon-cell">
        <div class="mon-k">Disk</div>
        <div class="mon-v" id="mon-disk">—</div>
        <div class="mon-bar"><span id="mon-disk-bar" style="width:0%"></span></div>
      </div>
    </div>
    <div class="mon-foot" id="mon-foot">loading...</div>
  `;
  fetchTelemetry();
  pollTimer = setInterval(fetchTelemetry, 30_000);
}

function fetchTelemetry() {
  fetch('/data/telemetry.json?' + Date.now())
    .then(r => {
      if (!r.ok) throw new Error('status ' + r.status);
      return r.json();
    })
    .then(renderTelemetry)
    .catch(err => {
      document.getElementById('mon-foot').textContent = 'offline — ' + err.message;
    });
}

function renderTelemetry(d) {
  const cpu = d.cpu.percent;
  const mem = d.memory.percent;
  const disk = d.disk.percent;

  document.getElementById('mon-cpu').textContent     = cpu + '%';
  document.getElementById('mon-cpu-bar').style.width  = Math.min(cpu, 100) + '%';
  document.getElementById('mon-mem').textContent     = mem + '% (' + d.memory.used_gb + '/' + d.memory.total_gb + ' GB)';
  document.getElementById('mon-mem-bar').style.width  = Math.min(mem, 100) + '%';
  document.getElementById('mon-disk').textContent    = disk + '% (' + d.disk.used_gb + '/' + d.disk.total_gb + ' GB)';
  document.getElementById('mon-disk-bar').style.width = Math.min(disk, 100) + '%';

  const foot = document.getElementById('mon-foot');
  foot.textContent = d.system.hostname + ' · up ' + d.system.uptime + ' · ' + d.system.process_count + ' procs';
}

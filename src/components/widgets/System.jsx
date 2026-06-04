import React from 'react';
import { usePollingFetch } from '../../hooks/usePollingFetch';

function StatusRow({ label, dotColor, text }) {
  return (
    <div className="stat-row">
      <span className="label">{label}</span>
      <span className="badge">
        <span className={`badge-dot ${dotColor}`}></span>
        <span>{text}</span>
      </span>
    </div>
  );
}

export default function System() {
  const { data, error } = usePollingFetch('/api/status', 30_000);

  if (error || !data) {
    return (
      <>
        <StatusRow label="gateway" dotColor="red" text="offline" />
        <StatusRow label="discord" dotColor="gray" text="offline" />
        <div className="stat-row"><span className="label">sessions</span><span className="value">0</span></div>
        <div className="stat-row"><span className="label">version</span><span className="value">v1.0.0</span></div>
      </>
    );
  }

  const gatewayDot = data.gateway_state === 'running' ? 'green' : 'red';
  const discordDot = data.gateway_platforms?.discord?.state === 'connected' ? 'green' : 'red';

  return (
    <>
      <StatusRow label="gateway" dotColor={gatewayDot} text={data.gateway_state || 'offline'} />
      <StatusRow label="discord" dotColor={discordDot} text={data.gateway_platforms?.discord?.state || 'offline'} />
      <div className="stat-row"><span className="label">sessions</span><span className="value">{data.active_sessions || 0}</span></div>
      <div className="stat-row"><span className="label">version</span><span className="value">{data.version || 'v1.0.0'}</span></div>
    </>
  );
}

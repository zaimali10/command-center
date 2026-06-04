import React from 'react';
import { CONFIG } from '../../lib/config.js';

export default function Projects() {
  return (
    <div className="proj-row">
      {CONFIG.projects.map(p => (
        <a
          key={p.repo}
          className="proj"
          href={`https://github.com/${p.repo}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <div className="proj-label">{p.label}</div>
          <div className="proj-desc">{p.desc}</div>
          <div className="proj-cta">open ↗</div>
        </a>
      ))}
    </div>
  );
}

import React from 'react';
import { CONFIG } from '../../lib/config.js';

export default function Discord() {
  return (
    <>
      <div className="discord-sub">Send a message to your agents in #jarvis</div>
      <a
        className="discord-btn"
        href={CONFIG.discordChannelUrl}
        target="_blank"
        rel="noopener noreferrer"
      >
        Open #jarvis →
      </a>
    </>
  );
}

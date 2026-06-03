import { CONFIG } from '../lib/config.js';

export function mountDiscord() {
  const el = document.getElementById('widget-discord');
  el.innerHTML = `
    <h2>Quick Chat</h2>
    <div class="discord-sub">Send a message to your agents in #jarvis</div>
    <a class="discord-btn" href="${CONFIG.discordChannelUrl}" target="_blank" rel="noopener">
      Open #jarvis →
    </a>
  `;
}

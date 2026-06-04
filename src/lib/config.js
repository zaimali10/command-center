// User-tunable configuration: identity, projects, quotes, refresh cadences.
export const CONFIG = {
  githubUser: 'zaimali10',
  discordChannelUrl: 'https://discord.com/channels/1500918944637386974/1511524310349516860',
  weatherLocation: 'Dallas',

  projects: [
    { label: 'Fam',          repo: 'zaimali10/couples_v1',         desc: 'couples_v1' },
    { label: 'Companion',    repo: 'zaimali10/companion_v1',       desc: 'companion_v1' },
    { label: 'CRE Analyzer', repo: 'zaimali10/property-evaluator', desc: 'property-evaluator' },
  ],

  clockTickMs:      1000,
  quoteRotateMs:    60_000,
  weatherRefreshMs: 30 * 60_000,
  githubRefreshMs:  10 * 60_000,
  livePollMs:       10_000,

  hermes: {
    status: 'online',
    lastRunMinutesAgo: 12,
    queueDepth: 3,
    uptimeText: '4d 6h',
  },

  quotes: [
    { text: 'The cave you fear to enter holds the treasure you seek.', author: 'Joseph Campbell' },
    { text: 'Discipline equals freedom.', author: 'Jocko Willink' },
    { text: 'You do not rise to the level of your goals. You fall to the level of your systems.', author: 'James Clear' },
    { text: 'What is essential is invisible to the eye.', author: 'Antoine de Saint-Exupéry' },
    { text: 'The obstacle is the way.', author: 'Marcus Aurelius' },
    { text: 'Make the thing, then make the thing better.', author: '—' },
    { text: 'Slow is smooth, smooth is fast.', author: 'Navy SEALs' },
  ],
};

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// User-tunable configuration: identity, projects, refresh cadences.
export const CONFIG = {
  githubUser: 'zaimali10',
  discordChannelUrl: 'https://discord.com/channels/1500918944637386974/1511524310349516860',
  githubRefreshMs:  10 * 60_000,

  projects: [
    { label: 'Fam',          repo: 'zaimali10/couples_v1',         desc: 'couples_v1' },
    { label: 'Companion',    repo: 'zaimali10/companion_v1',       desc: 'companion_v1' },
    { label: 'CRE Analyzer', repo: 'zaimali10/property-evaluator', desc: 'property-evaluator' },
  ],
};

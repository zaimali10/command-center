# Command Center

Personal heads-up display for the iPad. Single static `index.html` — no build tools.

## Run locally

Open `index.html` directly in a browser, or serve the folder:

```bash
python -m http.server 8080
# then visit http://localhost:8080/
```

## Deploy to GitHub Pages

1. Push this repo to GitHub.
2. In repo Settings → Pages → Source: `main` branch, root folder.
3. Wait ~1 minute. Visit `https://<username>.github.io/command-center/`.

## Configuration

Edit the `CONFIG` block near the top of the `<script>` in `index.html`:

- `githubUser` — your GitHub username for the activity pulse.
- `discordChannelUrl` — deep link to the channel you want the Quick Chat button to open.
- `weatherLocation` — any string `wttr.in` accepts (city name, airport code, etc.).
- `projects` — array of `{ label, repo, desc }` for the project cards.
- `hermes` — placeholder status fields; replace once Hermes exposes a real endpoint.
- `quotes` — array of `{ text, author }`; rotates every 60s.

## Wiring Hermes for real

Replace the `hermes` IIFE's call to `CONFIG.hermes` with a `fetch()` to your Hermes
status endpoint. The render contract is: `{ status, lastRunMinutesAgo, queueDepth, uptimeText }`.

# How2Build — MediaList

A complete, self-contained recipe for building and hosting a tiny "recommended
media queue" web app: people search for a movie / TV show / anime, add it to
a queue with their name and an optional note, and the owner of the site marks
things as watched. One Node process, zero npm dependencies, one JSON file as
the entire database.

Hand this file to any AI agent (or human) and they can take this codebase from
a cold folder to a live, deployed, internet-facing website. First move: fill
in §1.5 (site name + look) or ask the host about them.

> **Note on the look:** everything visual in this project lives in
> `public/index.html` + `public/style.css` — a single self-contained "skin".
> The bundled skin is a retro-90s geocities theme (starfield, marquee,
> beveled buttons, hit counter). It is **cosmetic only**: the server, the API,
> the data model, and the frontend logic (`app.js`) do not depend on it.
> Nothing in this document *requires* that look — see §1.5 and §14.

---

## 1.5 Two open decisions — answer these first

This app ships with a **name** and a **visual skin**, and both are meant to be
yours. Before building (or re-skinning) anything, settle:

```
SITE NAME : ______________________________________
           (shown in the page title, the banner, the footer,
            and package.json — e.g. "The Watchlist", "Queue Up",
            "What Should We Watch?")

SKIN      : ______________________________________
           (a general idea is enough — e.g. "clean modern dark
            mode", "newspaper print", "terminal / hacker", "90s
            geocities", "pastel & friendly", "brutalist")
```

**If you are a human** with this file: write in your answers, then proceed.

**If you are an AI agent** receiving this file with blank fields: **ask the
person who handed it to you** "what should the site be called, and what kind
of look do you want?" and wait for their answer before touching
`public/index.html` / `public/style.css`. If they say "you choose", default to
the bundled skin (which is exactly one example of a completed answer).

**Applying the answers (10 minutes, no rebuild needed):**

1. **Name** — replace the brand strings in `public/index.html` (the `<title>`,
   the banner heading, the footer line) and the `name`/`description` in
   `package.json`. Nothing in `server.js`, `app.js`, or the API cares about
   the name — it is pure display text.
2. **Skin** — rewrite `public/style.css` for the requested look, adjusting
   `public/index.html` markup only where the new design needs it. **Keep the
   DOM contract** (the element ids in §14): `q`, `who`, `search-btn`,
   `results`, `queue-list`, `watched-list`, `admin-corner`, `admin-pw`,
   `login-btn`, `logout-btn`, `hits`, `deployed`, `.style-btn`, and the
   `.card` / `.title` / `.meta` / `.who` / `.note` card structure.
   `app.js` and the server work untouched under any skin.

After that, everything else in this document applies unchanged.

---

## 1. What it is

Friends open the site, search (powered by TMDB — movies, TV shows, and anime,
since anime is "TV" on TMDB), and **ADD** a result to the queue with their
name and an optional note ("why u love it"). The queue shows in the left
column. The owner logs in as **admin** (password in `.env`) and marks things
as watched, moving them to the right-hand "watched" column. One search box
also live-filters both lists as you type. A persistent visitor counter is
included. Everything persists in one `data.json` file.

```
┌────────────────────────────────────────────────────────────┐
│  <site title>                              admin: log in  │
├───────────────┬────────────────────────────┬───────────────┤
│   QUEUE       │   SEARCH (TMDB)            │   WATCHED     │
│   (to watch)  │   [what?] [search]         │               │
│               │   [your name]              │               │
│   cards with  │   (live-filters both lists)│   cards with  │
│   posters     │   results + ADD button     │   posters     │
└───────────────┴────────────────────────────┴───────────────┘
        footer
```

The whole frontend is **one HTML document** (`public/index.html`) — the
three "frames" of the layout are a CSS grid, not real `<frameset>`s, so
there are no stale-frame bugs, and it collapses to a single column on
phones.

## 2. What it is *not*

- No npm packages. `npm install` installs nothing. Plain `http` module + global `fetch`.
- No framework, no build step, no bundler, no transpile. The JS is one ~300-line file.
- No database engine. The entire database is `data.json`, rewritten on every change.
- No user accounts. "Who" is free text you type; admin is one shared password.

## 3. Requirements

| Thing | What you need |
|---|---|
| Node.js | **18 or newer** (any LTS). Needed for global `fetch` (the TMDB proxy). |
| TMDB API key | A free **v3 API key** from https://www.themoviedb.org (Account → API → "API v3 key"). Keys do not expire; read *tokens* do. |
| A box | Anything that can run Node and receive HTTP: home server, Raspberry Pi, $5 VPS. ~50 MB RAM at idle. |
| Outbound HTTPS | The server calls `api.themoviedb.org`; the box needs normal outbound internet. |
| Inbound | A public URL **or** a tunnel (see §9). No special daemons required beyond the process itself. |

## 4. File map

```
server.js               zero-dependency Node HTTP server (static + API, ~250 lines)
public/
  index.html            the entire frontend: one page, css-grid 3-column layout
  style.css             the current skin (all visual styling lives here)
  app.js                the brain: state, rendering, search, admin, counter (theme-agnostic)
  favicon-*.png         site icon (regenerable, see tools/make-favicon.js)
tools/
  make-favicon.js       regenerates the favicons:  node tools/make-favicon.js
.env.example            template for the secret config — copy to .env
package.json            name/version/`npm start`; installs zero dependencies
data.json               ← created automatically on first run (THE database)
```

## 5. Quickstart (10 minutes, local)

```sh
cd MediaList                      # this folder
cp .env.example .env
$EDITOR .env                      # paste your TMDB key + pick an admin password
node server.js
#   serving on http://localhost:4179
```

Open <http://localhost:4179>. Checklist (skin-agnostic):

- [ ] the page renders: title, search box, two side lists
- [ ] search "cowboy bebop" → results with posters appear
- [ ] type a few letters in the search box → both side lists live-filter
- [ ] click ADD on a result → you're asked a note → card appears in the queue
- [ ] top-right: type the admin password → cards gain buttons → mark watched → card moves to the watched list
- [ ] the visitor counter increments on reload
- [ ] kill the server, restart, everything is still there (it's in `data.json`)

## 6. Configuration reference (`.env`)

| Variable | Required | Default | Meaning |
|---|---|---|---|
| `TMDB_API_KEY` | **yes** | — | v3 key from themoviedb.org. Server refuses to boot without it. |
| `ADMIN_PASSWORD` | recommended | unset | The one password. If unset, no one can ever become admin (adding still works; nothing can be marked watched). |
| `PORT` | no | `4179` | Listen port. |

`.env` is read by a 12-line hand-rolled loader; real `process.env` values win.
**`.env` must never be committed, synced, or backed up alongside the code.**

## 7. API reference

All JSON. Nothing is cached (the server sends `no-store` everywhere).

| Method & path | Auth | Returns / does |
|---|---|---|
| `GET /api/search?q=<text>` | — | `{results:[{id, media_type, title, year, poster_path, tagline}]}` — TMDB multi-search, filtered to movies+TV. 400 if < 2 chars. |
| `GET /api/items` | — | `{items:[...]}` the whole list, each with a derived `poster_url`. |
| `POST /api/items` | — | body `{tmdbId, mediaType, title, year, poster_path, recommendedBy, notes}` → creates item, 201. 409 "already on the list" on duplicate `(tmdbId, mediaType)`. |
| `POST /api/items/:id` | admin | toggles `watched` (sets/clears `watchedAt`). |
| `DELETE /api/items/:id` | admin | removes forever. |
| `POST /api/admin/login` | — | body `{password}` → sets an admin cookie (`HttpOnly`, `SameSite=Strict`, 30 days; the cookie value is a hash, never the password). |
| `POST /api/admin/logout` | — | clears the cookie. |
| `GET /api/admin/status` | — | `{admin: bool}`. |
| `GET /api/hits` | — | increments and returns `{hits}` (persisted in `data.json`). |
| `GET /api/version` | — | `{deployed}` — process start time, i.e. "when did the last deploy happen?" (shown in the footer). |

Item shape in `data.json`:

```json
{
  "hits": 0,
  "items": [{
    "id": "1a2b3c4d5e6f",        // 6 random bytes, hex
    "tmdbId": 1966,
    "mediaType": "tv",            // "movie" | "tv"
    "title": "Cowboy Bebop",
    "year": "1998",
    "poster_path": "/ehddE5…jpg", // relative to https://image.tmdb.org/t/p/<size>
    "recommendedBy": "a person",
    "notes": "why they love it",
    "addedAt": "2026-09-12T13:00:00.000Z",
    "watched": false,
    "watchedAt": null
  }]
}
```

## 8. Making it always-on (pick one)

**Linux — systemd** (`/etc/systemd/system/medialist.service`):

```ini
[Unit]
Description=MediaList
After=network.target

[Service]
ExecStart=/usr/bin/env node /opt/MediaList/server.js
WorkingDirectory=/opt/MediaList
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

`systemctl daemon-reload && systemctl enable --now medialist`

**macOS — launchd** (`~/Library/LaunchAgents/com.example.medialist.plist`):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.example.medialist</string>
  <key>ProgramArguments</key>
  <array>
    <string>/path/to/bin/node</string>
    <string>/path/to/MediaList/server.js</string>
  </array>
  <key>WorkingDirectory</key><string>/path/to/MediaList</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/path/to/MediaList/server.log</string>
  <key>StandardErrorPath</key><string>/path/to/MediaList/server.log</string>
</dict></plist>
```

`launchctl load ~/Library/LaunchAgents/com.example.medialist.plist` —
restart after a deploy: `launchctl kickstart -k gui/$(id -u)/com.example.medialist`

(If the box has no Node and you can't install it properly, a
standalone Node build from https://nodejs.org/dist/ unzipped into `~/tools/node`
works perfectly — point `ExecStart`/`ProgramArguments` at it.)

**No-daemon fallback:** `tmux`/`screen`, or `while true; do node server.js; sleep 2; done`.
A single JSON file for persistence means a crash is rarely more than an embarrassment.

## 9. Putting it on the internet (pick one)

**Reverse proxy — Caddy** (`Caddyfile`):

```
media.example.com {
    reverse_proxy localhost:4179
}
```

That's the whole story; Caddy handles TLS automatically. (nginx: same idea,
`proxy_pass`, plus certbot.)

**Tunnel — Cloudflare** (great for homeservers with no public IP):
1. Install `cloudflared` on the box.
2. In the Cloudflare dashboard: **Network → Tunnels → Create a tunnel**, token
   auth. Add one public hostname: `media.example.com` → `http://localhost:4179`
   (service type **http**).
3. Run the connector under your service manager:
   `cloudflared tunnel --no-autoupdate run --token <TOKEN>`.

You get free TLS, a real domain, and no port forwarding.

## 10. Backups & data safety

**`data.json` is the entire database.** That is the feature, not the bug:

- The server rewrites it completely on every change (synchronous, immediate).
- It recreates itself on boot if missing, so a "bad backup" can't wedge the app — worst case it starts empty.
- Back it up however you like: a nightly `cp data.json data-$(date +%F).json` in cron, a restic/borg job, a git repo of it, a USB stick. Weekly is plenty for a media queue.
- When you *deploy code* to a box that has a live `data.json`, **do not overwrite it**. Sync code while excluding `data.json` and `.env` (see §11), and consider pulling the live `data.json` back afterwards.

## 11. Deploying & updating

From a dev folder to a live box:

```sh
rsync -av --delete \
  --exclude .env --exclude data.json \
  --exclude data-backup-*.json --exclude '*.log' \
  --exclude .git --exclude .DS_Store \
  ./ user@host:~/servers/MediaList/

ssh user@host 'launchctl kickstart -k gui/$(id -u)/com.example.medialist'   # or: systemctl restart medialist
```

Notes that save support headaches:

- **Never cache.** The server sends `no-store, no-cache, must-revalidate` on every static file, so visitors see a new deploy on their next normal load.
- **Prove the deploy:** the footer prints `deployed: <date time>` from `GET /api/version` (process start time). If a page shows an old timestamp, *that browser tab* is stale — the only stale-state failure mode left.
- **Favicon** ships as four PNGs; regenerate with `node tools/make-favicon.js` (pure-math rasterizer, zero deps).

## 12. Security notes

- The admin password lives **only** in `.env` on the server; logins compare server-side, and the auth *cookie* stores a SHA-256 hash (never the password). The cookie is `HttpOnly; SameSite=Strict`, 30-day.
- No user system, no accounts, no per-user storage — `recommendedBy` is free text.
- All user-input strings are HTML-escaped at render time, and the server re-clamps lengths.
- Put it behind HTTPS (any method from §9). A password box served over plain HTTP is the one genuinely bad configuration.

## 13. Troubleshooting

| Symptom | Diagnosis |
|---|---|
| Server won't start: `FATAL: TMDB_API_KEY is not set` | `.env` missing or misnamed; it must sit next to `server.js`. |
| Search returns `TMDB error 401` | wrong key (v3 keys don't expire; *tokens* do — use the key). |
| Search returns nothing for a real title | check the box has outbound HTTPS (`curl https://api.themoviedb.org` from the box). |
| Page looks old after a deploy | hard-refresh that one tab; the footer's `deployed:` timestamp tells you which build a tab is on. |
| Visitor counter shows `ERROR` | the JS couldn't reach `/api/hits` — probably a page copy opened without the server. |
| `403` on watch/delete | admin cookie expired (30 days) — log in again. |
| Everything is fine but a friend sees the old layout | their browser: one hard refresh fixes it; `no-store` means it happens exactly once per tab. |

## 14. Swapping the skin (and other extension points)

The entire visual identity is two files: `public/index.html` (markup) and
`public/style.css` (styling). `app.js` renders plain, semantically-cleared DOM
(card, meta rows, buttons) and is theme-agnostic — a new skin never touches
it, and the server never serves anything but the skin as-is.

- **The current skin** is a retro-90s geocities theme (the example answer to
  §1.5): starfield background, `<marquee>`, blinking NEW! badges, beveled
  buttons, rainbow text, a "pick a style" footer, Comic Sans. It's deliberate
  pastiche, all in plain HTML/CSS.
  Replace it by rewriting those two files for your own look — the DOM
  structure (ids `q`, `who`, `results`, `queue-list`, `watched-list`,
  `admin-corner`, `hits`, `deployed`, and the `.style-btn` buttons) is the
  contract `app.js` relies on; keep those ids, style whatever you like.
- **The style picker is ready to mean something.** The footer buttons set
  `document.documentElement.dataset.style` and persist the choice in
  `localStorage` — define real themes via CSS custom properties per
  `[data-style=…]` and the buttons start working with zero other changes.
- **Other easy extensions:** per-item note editing (`POST /api/items/:id`
  could accept edits), star ratings before watching, an RSS/JSON feed of the
  queue for "what's new" bots, a second list page.

## 15. Final architecture summary (for the impatient agent)

```
        browser (one HTML page, one JS file, one CSS skin, no deps)
              │  fetch()
              ▼
   ┌────────────────────────────────────┐
   │  Node 18+ process (server.js)      │
   │   ├─ static file server /public    │   ← no-store cache headers
   │   ├─ /api/search ──── HTTPS ────►  TMDB /search/multi
   │   ├─ /api/items …  in-memory db ──┐
   │   ├─ /api/admin/…  cookie hash    │
   │   └─ /api/hits, /api/version      │
   └────────────────────────────────────┘
                     │ every mutation: synchronous writeFileSync
                     ▼
                data.json   ← this is the whole persistence layer
```

Good luck.

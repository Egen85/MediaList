/**
 * MEGA MEDIA LIST — the server
 * Zero dependencies. Requires Node 18+ (for global fetch).
 *
 * Serves the static frontend from ./public and a small JSON-file-backed API.
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ---------------------------------------------------------------------------
// .env loading (tiny, no dependencies)
// ---------------------------------------------------------------------------
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim();
  }
}
loadEnv();

const PORT = parseInt(process.env.PORT || '4179', 10);
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!TMDB_API_KEY) {
  console.error('FATAL: TMDB_API_KEY is not set. Add it to .env');
  process.exit(1);
}

const DATA_FILE = path.join(__dirname, 'data.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

// ---------------------------------------------------------------------------
// Data store (a JSON file, read/written atomically-ish)
// ---------------------------------------------------------------------------
let db = { hits: 13338, items: [] };

function loadDb() {
  try {
    const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    if (raw && Array.isArray(raw.items)) {
      db.hits = typeof raw.hits === 'number' ? raw.hits : 13338;
      db.items = raw.items;
    }
  } catch {
    // first run — start fresh
  }
}

let saveTimer = null;
function saveDb() {
  // write immediately — the old 100ms debounce could lose the latest
  // change if the process restarts inside that window
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
  } catch (err) {
    console.error('Failed to save data.json:', err.message);
  }
}

loadDb();
fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2)); // ensure file exists

// ---------------------------------------------------------------------------
// Admin auth: cookie holds sha256(password). No sessions, no accounts.
// ---------------------------------------------------------------------------
function hashPassword(pw) {
  return crypto.createHash('sha256').update(pw).digest('hex');
}

function parseCookies(header) {
  const out = {};
  for (const part of (header || '').split(';')) {
    const idx = part.indexOf('=');
    if (idx > -1) out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

function isAdmin(req) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies['ml_admin'];
  if (!token || !ADMIN_PASSWORD) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(hashPassword(ADMIN_PASSWORD));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------
function json(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 1e6) { reject(new Error('body too large')); req.destroy(); }
    });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch { reject(new Error('invalid JSON')); }
    });
    req.on('error', reject);
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

function serveStatic(req, res, urlPath) {
  // some old-habit browsers still request .ico; serve the png instead
  if (urlPath === '/favicon.ico') urlPath = '/favicon-32.png';
  let filePath = path.join(PUBLIC_DIR, urlPath === '/' ? 'index.html' : urlPath);
  // no directory traversal
  if (!filePath.startsWith(PUBLIC_DIR)) return json(res, 403, { error: 'nope' });
  fs.readFile(filePath, (err, data) => {
    if (err) return json(res, 404, { error: 'not found' });
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream',
      'Content-Length': data.length,
      // no-store: never cache, ever. the frames layout + tiny files make
      // caching worthless — stale frames are the #1 support issue of the 90s
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    });
    res.end(data);
  });
}

// ---------------------------------------------------------------------------
// TMDB proxy
// ---------------------------------------------------------------------------
async function tmdbSearch(query) {
  const url =
    `https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API_KEY}` +
    `&query=${encodeURIComponent(query)}&include_adult=false`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`TMDB error ${r.status}`);
  const data = await r.json();
  // multi-search also returns people — we only want movies & shows
  return (data.results || [])
    .filter((x) => x.media_type === 'movie' || x.media_type === 'tv')
    .map((x) => ({
      id: x.id,
      media_type: x.media_type, // 'movie' | 'tv'
      title: x.title || x.name,
      year: (x.release_date || x.first_air_date || '').slice(0, 4) || null,
      poster_path: x.poster_path || null,
      tagline: x.tagline || null,
    }));
}

function posterUrl(poster_path, size = 'w342') {
  return poster_path ? `https://image.tmdb.org/t/p/${size}${poster_path}` : null;
}

// ---------------------------------------------------------------------------
// API routes
// ---------------------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const p = url.pathname;
  const method = req.method;

  try {
    // --- search -------------------------------------------------------------
    if (method === 'GET' && p === '/api/search') {
      const q = (url.searchParams.get('q') || '').trim();
      if (q.length < 2) return json(res, 400, { error: 'type at least 2 characters' });
      const results = await tmdbSearch(q);
      return json(res, 200, { results });
    }

    // --- the list ------------------------------------------------------------
    if (method === 'GET' && p === '/api/items') {
      return json(res, 200, {
        items: db.items.map((it) => ({ ...it, poster_url: posterUrl(it.poster_path, 'w185') })),
      });
    }

    if (method === 'POST' && p === '/api/items') {
      const body = await readBody(req);
      const title = String(body.title || '').trim().slice(0, 200);
      const recommendedBy = String(body.recommendedBy || 'a mysterious stranger').trim().slice(0, 60);
      const notes = String(body.notes || '').trim().slice(0, 200);
      const mediaType = body.mediaType === 'movie' ? 'movie' : 'tv';
      const tmdbId = parseInt(body.tmdbId, 10);
      if (!title || !Number.isFinite(tmdbId)) return json(res, 400, { error: 'missing title or id' });
      if (db.items.some((it) => it.tmdbId === tmdbId && it.mediaType === mediaType)) {
        return json(res, 409, { error: 'already on the list' });
      }
      const item = {
        id: crypto.randomBytes(6).toString('hex'),
        tmdbId,
        mediaType,
        title,
        year: String(body.year || '').slice(0, 4) || null,
        poster_path: body.poster_path || null,
        recommendedBy,
        notes: notes || null,
        addedAt: new Date().toISOString(),
        watched: false,
      };
      db.items.push(item);
      saveDb();
      return json(res, 201, { item: { ...item, poster_url: posterUrl(item.poster_path, 'w185') } });
    }

    // admin-only: flip watched (also accepts DELETE on /api/items/:id)
    const itemMatch = p.match(/^\/api\/items\/([a-f0-9]+)$/);
    if (itemMatch) {
      if (!isAdmin(req)) return json(res, 403, { error: 'admin password required' });
      const item = db.items.find((it) => it.id === itemMatch[1]);
      if (!item) return json(res, 404, { error: 'not found' });
      if (method === 'POST') {
        item.watched = !item.watched;
        item.watchedAt = item.watched ? new Date().toISOString() : null;
        saveDb();
        return json(res, 200, { item: { ...item, poster_url: posterUrl(item.poster_path, 'w185') } });
      }
      if (method === 'DELETE') {
        db.items = db.items.filter((it) => it.id !== item.id);
        saveDb();
        return json(res, 200, { ok: true });
      }
    }

    // --- admin login / logout / status ---------------------------------------
    if (method === 'POST' && p === '/api/admin/login') {
      const body = await readBody(req);
      if (ADMIN_PASSWORD && Buffer.from(String(body.password))
        .compare(Buffer.from(ADMIN_PASSWORD)) === 0) {
        res.writeHead(200, {
          'Set-Cookie': `ml_admin=${hashPassword(ADMIN_PASSWORD)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${60 * 60 * 24 * 30}`,
          'Content-Type': 'application/json',
        });
        return res.end(JSON.stringify({ ok: true }));
      }
      return json(res, 401, { error: 'wrong password, you r not the admin' });
    }

    if (method === 'POST' && p === '/api/admin/logout') {
      res.writeHead(200, {
        'Set-Cookie': 'ml_admin=; Path=/; HttpOnly; Max-Age=0',
        'Content-Type': 'application/json',
      });
      return res.end(JSON.stringify({ ok: true }));
    }

    if (method === 'GET' && p === '/api/admin/status') {
      return json(res, 200, { admin: isAdmin(req) });
    }

    // --- the hit counter (it's real, in a way) -------------------------------
    if (method === 'GET' && p === '/api/hits') {
      db.hits += 1;
      saveDb();
      return json(res, 200, { hits: db.hits });
    }

    // --- what version are you looking at? -------------------------------------
    if (method === 'GET' && p === '/api/version') {
      // the service restarts on every deploy, so process start = deploy time
      const deployed = new Date(Date.now() - process.uptime() * 1000).toISOString();
      return json(res, 200, { deployed });
    }

    // --- static files ---------------------------------------------------------
    if (method === 'GET') return serveStatic(req, res, p);

    json(res, 405, { error: 'method not allowed' });
  } catch (err) {
    console.error(`${method} ${p} failed:`, err.message);
    json(res, 500, { error: 'server exploded' });
  }
});

server.listen(PORT, () => {
  console.log(`\n  ☆ MEDIA LIST! ☆  know something good to watch? queue it!`);
  console.log(`  serving on http://localhost:${PORT}\n`);
});

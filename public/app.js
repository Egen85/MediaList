/* ~*~ MEDIA LIST! ~*~  the entire brain of the website. ~*~
   looks like 1996, thinks like 2026. zero dependencies. */

'use strict';

// ---------------------------------------------------------------------------
// state
// ---------------------------------------------------------------------------
let items = [];
let isAdmin = false;
let lastResults = [];
let searchTerm = '';
let filterText = '';

// ---------------------------------------------------------------------------
// tiny helpers
// ---------------------------------------------------------------------------
const $ = (s) => document.querySelector(s);

function api(path, opts = {}) {
  return fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  }).then(async (r) => {
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.error || `http ${r.status}`);
    return body;
  });
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function mediaLabel(mt) {
  return mt === 'movie'
    ? '<span class="type-movie">[MOVIE]</span>'
    : '<span class="type-tv">[SHOW]</span>';
}

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function isFresh(iso) {
  return iso && (Date.now() - new Date(iso).getTime()) < 7 * 864e5;
}

function posterHtml(posterPath, noPosterCls = '') {
  if (posterPath) {
    return `<span class="poster-frame"><img src="https://image.tmdb.org/t/p/w92${esc(posterPath)}" alt="" loading="lazy"></span>`;
  }
  return `<span class="poster-frame no-poster ${noPosterCls}">NO<br>POSTER</span>`;
}

function matchesFilter(it) {
  if (!filterText) return true;
  const hay = `${it.title} ${it.recommendedBy} ${it.mediaType} ${it.notes || ''} ${it.year || ''}`.toLowerCase();
  return filterText.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
}

// ---------------------------------------------------------------------------
// rendering
// ---------------------------------------------------------------------------
function card(it, zebra) {
  let btns = '';
  if (isAdmin) {
    btns = !it.watched
      ? `<button class="bevel tiny" data-act="watch" data-id="${it.id}">I WATCHED IT ✅</button>`
      : `<button class="bevel tiny" data-act="unwatch" data-id="${it.id}">UN-WATCH</button> <button class="bevel tiny" data-act="delete" data-id="${it.id}" title="remove forever">&times;</button>`;
  }
  const fresh = !it.watched && isFresh(it.addedAt) ? ' <span class="new-badge blink">NEW!</span>' : '';
  const yearLine = `<div class="meta year-row">${it.year ? `<b>${esc(it.year)}</b>` : ''}${it.year ? ' ' : ''}${mediaLabel(it.mediaType)}</div>`;
  const dateLine = `<div class="meta">${it.watched
    ? `✅ ${fmtDate(it.watchedAt || it.addedAt)}`
    : `requested ${fmtDate(it.addedAt)}`}</div>`;
  return `<div class="card ${zebra ? 'card-stripe' : ''}">
    ${posterHtml(it.poster_path)}
    <div class="card-body">
      <div class="title ${it.watched ? 'struck' : ''}">${esc(it.title)}${fresh}</div>
      ${yearLine}
      ${dateLine}
      <div class="who">rec. by <span class="who-name">${esc(it.recommendedBy)}</span></div>
      ${it.notes ? `<div class="note">“${esc(it.notes)}”</div>` : ''}
      ${btns ? `<div class="card-btns">${btns}</div>` : ''}
    </div>
  </div>`;
}

function renderSideLists() {
  const queue = items.filter((i) => !i.watched).filter(matchesFilter)
    .sort((a, b) => b.addedAt.localeCompare(a.addedAt));
  const watched = items.filter((i) => i.watched).filter(matchesFilter)
    .sort((a, b) => (b.watchedAt || b.addedAt).localeCompare(a.watchedAt || a.addedAt));

  $('#queue-list').innerHTML = queue.length
    ? queue.map((it, i) => card(it, i % 2 === 1)).join('')
    : `<div class="empty-note">${filterText
        ? `~ nothing in the queue matches “${esc(filterText)}” ~`
        : '~ the queue is empty... queue me something! ~'}</div>`;

  $('#watched-list').innerHTML = watched.length
    ? watched.map((it, i) => card(it, i % 2 === 1)).join('')
    : `<div class="empty-note">${filterText
        ? `~ nothing watched matches “${esc(filterText)}” ~`
        : '~ nothing conquered yet. the queue awaits. ~'}</div>`;
}

function renderResults() {
  const box = $('#results');
  if (!lastResults.length) {
    box.innerHTML = searchTerm
      ? `<div class="empty-note">~ no results for "${esc(searchTerm)}" ... the internet has failed us ~</div>`
      : '';
    return;
  }
  const onList = new Set(items.map((i) => i.tmdbId + i.mediaType));
  box.innerHTML =
    `<table><tr><td class="search-hint">found ${lastResults.length} result${lastResults.length === 1 ? '' : 's'}:</td></tr></table>` +
    `<table>` + lastResults.map((r, i) => {
      const dupe = onList.has(r.id + r.mediaType);
      return `<tr class="${i % 2 ? 'row-striped' : ''}">
        <td class="poster-cell">${r.poster_path ? posterHtml(r.poster_path) : '<span class="poster-frame no-poster">NO<br>POSTER</span>'}</td>
        <td class="title-cell">
          <span class="title">${esc(r.title)}</span><br>
          <span class="meta">${mediaLabel(r.mediaType)}${r.year ? ' • ' + esc(r.year) : ''}${r.tagline ? ' • <i>' + esc(r.tagline) + '</i>' : ''}</span>
        </td>
        <td class="action-cell">${dupe
          ? '<span class="search-hint">already listed ✓</span>'
          : `<button class="bevel" data-add-id="${r.id}">ADD!!</button>`}</td>
      </tr>`;
    }).join('') + `</table>`;
}

function renderAdmin() {
  $('#admin-logged').style.display = isAdmin ? '' : 'none';
  $('#admin-login-box').style.display = isAdmin ? 'none' : '';
  if (isAdmin) $('#login-status').textContent = '';
}

function render() {
  renderSideLists();
  renderResults();
  renderAdmin();
}

// ---------------------------------------------------------------------------
// data
// ---------------------------------------------------------------------------
async function loadAll() {
  items = (await api('/api/items')).items;
  isAdmin = (await api('/api/admin/status')).admin;
  render();
}

async function loadHits() {
  try {
    const { hits } = await api('/api/hits');
    $('#hits').textContent = String(hits).padStart(6, '0');
  } catch { $('#hits').textContent = 'ERROR'; }
}

async function loadVersion() {
  try {
    const { deployed } = await api('/api/version');
    const d = new Date(deployed);
    $('#deployed').textContent = d.toLocaleDateString() + ' ' +
      d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  } catch { /* cosmetic */ }
}

// ---------------------------------------------------------------------------
// actions
// ---------------------------------------------------------------------------
async function doSearch() {
  const q = $('#q').value.trim();
  if (q.length < 2) {
    $('#search-status').textContent = 'type at least 2 characters, this is not a guessing game';
    return;
  }
  searchTerm = q;
  $('#search-status').textContent = 'searching the depths of TMDB...';
  try {
    const { results } = await api(`/api/search?q=${encodeURIComponent(q)}`);
    lastResults = results.slice(0, 15);
    $('#search-status').textContent = '';
    renderResults();
  } catch (err) {
    $('#search-status').textContent = `search failed: ${err.message}`;
  }
}

async function addItem(id) {
  const r = lastResults.find((x) => x.id === id);
  if (!r) return;

  // the peak of 1996: the prompt() box. no pop-up windows were harmed.
  const notes = (prompt(`WHAT DO U LOVE ABOUT "${r.title}"? (optional, one sentence)`, '') || '').trim().slice(0, 200);

  const btn = document.querySelector(`[data-add-id="${id}"]`);
  if (btn) { btn.disabled = true; btn.textContent = 'ADDING...'; }
  try {
    await api('/api/items', {
      method: 'POST',
      body: JSON.stringify({
        tmdbId: r.id, mediaType: r.mediaType, title: r.title,
        year: r.year, poster_path: r.poster_path,
        recommendedBy: $('#who').value.trim(),
        notes,
      }),
    });
    await loadAll();
    $('#search-status').textContent = `queued! "${r.title}" is in the queue. thx fr rec.`;
  } catch (err) {
    if (btn) { btn.disabled = false; btn.textContent = 'ADD!!'; }
    $('#search-status').textContent = `could not add: ${err.message}`;
  }
}

document.addEventListener('click', async (e) => {
  const addBtn = e.target.closest('[data-add-id]');
  if (addBtn && !addBtn.disabled) return addItem(parseInt(addBtn.dataset.addId, 10));

  const actBtn = e.target.closest('[data-act]');
  if (actBtn && isAdmin) {
    const { act, id } = actBtn.dataset;
    try {
      if (act === 'delete') {
        if (!confirm('REMOVE THIS FROM THE LIST FOREVER? there is no undo button in 1996.')) return;
        await api(`/api/items/${id}`, { method: 'DELETE' });
      } else {
        await api(`/api/items/${id}`, { method: 'POST' });
      }
      await loadAll();
    } catch (err) {
      alert(`the server said: ${err.message}`);
    }
  }
});

async function doLogin() {
  const pw = $('#admin-pw').value;
  if (!pw) return;
  try {
    await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ password: pw }) });
    $('#login-status').textContent = '';
    isAdmin = true;
  } catch (err) {
    $('#login-status').textContent = err.message;
  } finally {
    $('#admin-pw').value = '';
  }
  render();
}

async function doLogout() {
  await api('/api/admin/logout', { method: 'POST' });
  isAdmin = false;
  render();
}

// ---------------------------------------------------------------------------
// events & init
// ---------------------------------------------------------------------------
$('#search-btn').addEventListener('click', doSearch);
$('#q').addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });
$('#login-btn').addEventListener('click', doLogin);
$('#admin-pw').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
$('#logout-btn').addEventListener('click', doLogout);

// the one search box also live-filters both lists as u type,
// so people can see if it's already on the list before queuing it
let filterTimer = null;
$('#q').addEventListener('input', () => {
  clearTimeout(filterTimer);
  filterTimer = setTimeout(() => {
    filterText = $('#q').value.trim();
    renderSideLists();
  }, 120);
});

// remember who u r
const savedName = localStorage.getItem('ml_name');
if (savedName) $('#who').value = savedName;
$('#who').addEventListener('change', () => localStorage.setItem('ml_name', $('#who').value.trim()));

// the style picker. geocities & angelfire are, as of now, exactly the same.
// the choice is remembered so that when real themes exist, they kick in for free.
const styleBtns = [...document.querySelectorAll('.style-btn')];
function setStyle(s) {
  document.documentElement.dataset.style = s;
  localStorage.setItem('ml_style', s);
  styleBtns.forEach((b) => b.classList.toggle('active', b.dataset.style === s));
}
styleBtns.forEach((b) => b.addEventListener('click', () => setStyle(b.dataset.style)));
setStyle(localStorage.getItem('ml_style') || 'geocities');

(async function init() {
  loadHits();
  loadVersion();
  try {
    await loadAll();
  } catch {
    document.querySelector('#page').innerHTML =
      '<center><p style="color:#f66">the server is down... or ur looking at a stale page (deployed time missing)</p></center>';
  }
})();

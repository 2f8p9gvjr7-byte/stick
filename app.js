/* Lire l'anglais — coller un texte anglais, l'écouter phrase par phrase avec
   la voix du téléphone, puis obtenir la traduction française.
   Aucune clé, aucun compte. Réglages gardés dans localStorage. */

const APP_VERSION = '1.2';
const $ = (s) => document.querySelector(s);
const store = {
  get(k, d) { try { const v = localStorage.getItem('lire.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('lire.' + k, JSON.stringify(v)); } catch {} }
};

$('#version').textContent = APP_VERSION;

/* ---------- Découpage en phrases ---------- */
function sentences(text) {
  const clean = text.replace(/\r/g, '').trim();
  if (!clean) return [];
  let parts;
  if (window.Intl && Intl.Segmenter) {
    const seg = new Intl.Segmenter('en', { granularity: 'sentence' });
    parts = Array.from(seg.segment(clean), (s) => s.segment);
  } else {
    parts = clean.match(/[^.!?\n]+[.!?]+["')\]]*|[^.!?\n]+$/gm) || [clean];
  }
  // Les sauts de ligne séparent aussi (titres, vers, listes).
  return parts.flatMap((p) => p.split(/\n+/)).map((s) => s.trim()).filter(Boolean);
}

/* ---------- Voix ---------- */
const synth = window.speechSynthesis;
let voices = [];

function voiceScore(v) {
  let s = 0;
  if (/premium|enhanced|améliorée|natural|neural/i.test(v.name)) s += 10;
  if (/google|siri/i.test(v.name)) s += 4;
  if (/^en[-_]GB/i.test(v.lang)) s += 3;
  if (/^en[-_]US/i.test(v.lang)) s += 2;
  if (v.localService) s += 1;
  return s;
}

function loadVoices() {
  if (!synth) return;
  voices = synth.getVoices().filter((v) => /^en/i.test(v.lang))
    .sort((a, b) => voiceScore(b) - voiceScore(a) || a.name.localeCompare(b.name));
  const sel = $('#voice');
  const saved = store.get('voice', null);
  sel.innerHTML = voices.map((v) =>
    `<option value="${v.voiceURI}">${v.name} (${v.lang})</option>`).join('');
  if (saved && voices.some((v) => v.voiceURI === saved)) sel.value = saved;
}
if (synth) {
  loadVoices();
  synth.addEventListener?.('voiceschanged', loadVoices);
}
$('#voice').addEventListener('change', (e) => store.set('voice', e.target.value));

const rateInput = $('#rate');
rateInput.value = store.get('rate', 0.9);
const showRate = () => { $('#rate-out').textContent = String(rateInput.value).replace('.', ','); };
showRate();
rateInput.addEventListener('input', () => { showRate(); store.set('rate', +rateInput.value); });

const pauseBox = $('#pause-between');
pauseBox.checked = store.get('pause', true);
pauseBox.addEventListener('change', () => store.set('pause', pauseBox.checked));

function currentVoice() {
  return voices.find((v) => v.voiceURI === $('#voice').value) || voices[0] || null;
}

/* ---------- Lecture ---------- */
let queue = [];        // phrases à lire
let idx = 0;
let playing = false;
let paused = false;
let runId = 0;         // invalide les fins de phrase d'une lecture arrêtée

function setButtons() {
  $('#btn-play').textContent = playing ? '▶︎ Reprendre au début' : '▶︎ Écouter';
  $('#btn-pause').disabled = !playing;
  $('#btn-pause').textContent = paused ? '▶︎ Suite' : '⏸ Pause';
  $('#btn-stop').disabled = !playing;
}

function markReading(i) {
  document.querySelectorAll('.pair.is-reading').forEach((n) => n.classList.remove('is-reading'));
  const el = document.querySelector(`.pair[data-i="${i}"]`);
  if (el) { el.classList.add('is-reading'); el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
}

function speakOne(text, lang, onEnd) {
  const u = new SpeechSynthesisUtterance(text);
  if (lang === 'en') {
    const v = currentVoice();
    if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'en-GB';
  } else {
    const fr = synth.getVoices().find((v) => /^fr/i.test(v.lang));
    if (fr) u.voice = fr;
    u.lang = fr ? fr.lang : 'fr-FR';
  }
  u.rate = +rateInput.value;
  u.onend = onEnd;
  u.onerror = onEnd;
  synth.speak(u);
}

function playFrom(list, start = 0, lang = 'en') {
  if (!synth) { status("Ce navigateur ne sait pas lire à voix haute."); return; }
  stop();
  queue = list; idx = start; playing = true; paused = false;
  const myRun = ++runId;
  setButtons();
  const next = () => {
    if (myRun !== runId) return;
    if (idx >= queue.length) { stop(); return; }
    if (lang === 'en') markReading(idx);
    const i = idx++;
    speakOne(queue[i], lang, () => {
      if (myRun !== runId) return;
      setTimeout(next, pauseBox.checked ? 350 : 0);
    });
  };
  next();
}

function stop() {
  runId++;
  if (synth) synth.cancel();
  playing = false; paused = false;
  markReading(-1);
  setButtons();
}

$('#btn-play').addEventListener('click', () => {
  const list = sentences($('#src').value);
  if (!list.length) { status('Collez d\'abord un texte.'); return; }
  status('Touchez un mot pour le réentendre seul.');
  showSentences(list);
  playFrom(list, 0, 'en');
});
$('#btn-pause').addEventListener('click', () => {
  if (!playing) return;
  if (paused) { synth.resume(); paused = false; } else { synth.pause(); paused = true; }
  setButtons();
});
$('#btn-stop').addEventListener('click', stop);

/* ---------- Traduction ---------- */
function decodeEntities(s) {
  const t = document.createElement('textarea');
  t.innerHTML = s;
  return t.value;
}

async function viaGoogle(text) {
  const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=fr&dt=t&q='
    + encodeURIComponent(text);
  const r = await fetch(url);
  if (!r.ok) throw new Error('google ' + r.status);
  const j = await r.json();
  const out = (j[0] || []).map((x) => x[0]).join('');
  if (!out) throw new Error('google vide');
  return out;
}

async function viaMyMemory(text) {
  const url = 'https://api.mymemory.translated.net/get?langpair=en|fr&q=' + encodeURIComponent(text.slice(0, 500));
  const r = await fetch(url);
  if (!r.ok) throw new Error('mymemory ' + r.status);
  const j = await r.json();
  const out = j?.responseData?.translatedText || '';
  if (j.responseStatus !== 200 || !out || /MYMEMORY WARNING/i.test(out)) throw new Error('mymemory refus');
  return decodeEntities(out);
}

async function translate(text) {
  try { return await viaGoogle(text); }
  catch { return await viaMyMemory(text); }
}

// Traduit plusieurs phrases, trois à la fois, dans l'ordre.
async function translateAll(list, onEach) {
  const out = new Array(list.length);
  let next = 0;
  async function worker() {
    while (next < list.length) {
      const i = next++;
      try { out[i] = await translate(list[i]); }
      catch { out[i] = null; }
      onEach(i, out[i]);
    }
  }
  await Promise.all([worker(), worker(), worker()]);
  return out;
}

let lastEn = [];
let lastFr = [];

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Chaque mot devient touchable : un appui le relit seul, plus lentement.
function wordsHtml(sentence) {
  return sentence.split(/([A-Za-zÀ-ÿ0-9]+(?:['’-][A-Za-zÀ-ÿ0-9]+)*)/).map((part, k) =>
    k % 2 ? `<span class="w" data-w="${escapeHtml(part)}">${escapeHtml(part)}</span>` : escapeHtml(part)
  ).join('');
}

function renderPairs(en, translating) {
  $('#pairs').innerHTML = en.map((s, i) => `
    <li class="pair" data-i="${i}">
      <span class="en" lang="en">${wordsHtml(s)}</span>
      <button class="say" data-say="${i}" aria-label="Écouter cette phrase">🔊</button>
      <span class="fr" lang="fr" data-fr="${i}"${translating ? '' : ' hidden'}>…</span>
    </li>`).join('');
}

// Affiche les phrases (sans traduction) si le texte a changé.
function showSentences(list) {
  if (list.join('\n') === lastEn.join('\n')) return;
  lastEn = list; lastFr = [];
  renderPairs(list, false);
  $('#full-fr').textContent = '';
  $('#result').hidden = false;
}

$('#btn-translate').addEventListener('click', async () => {
  const en = sentences($('#src').value);
  if (!en.length) { status('Collez d\'abord un texte.'); return; }
  if (!navigator.onLine) { status('Pas de réseau : la traduction a besoin d\'internet (la lecture, non).'); return; }
  lastEn = en; lastFr = [];
  renderPairs(en, true);
  $('#result').hidden = false;
  $('#btn-translate').disabled = true;
  let done = 0;
  status(`Traduction… 0 / ${en.length}`);
  const fr = await translateAll(en, (i, t) => {
    const el = document.querySelector(`[data-fr="${i}"]`);
    if (el) el.textContent = t ?? '(échec — réessayez)';
    status(`Traduction… ${++done} / ${en.length}`);
  });
  lastFr = fr;
  $('#full-fr').textContent = fr.map((t) => t ?? '[…]').join(' ');
  const failed = fr.filter((t) => t === null).length;
  status(failed ? `${failed} phrase(s) non traduite(s). Réessayez dans un instant.` : '');
  $('#btn-translate').disabled = false;
  store.set('last', $('#src').value);
});

function sayWord(el) {
  stop();
  document.querySelectorAll('.w.is-on').forEach((n) => n.classList.remove('is-on'));
  el.classList.add('is-on');
  const u = new SpeechSynthesisUtterance(el.dataset.w);
  const v = currentVoice();
  if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'en-GB';
  u.rate = Math.min(+rateInput.value, 0.75);
  u.onend = u.onerror = () => el.classList.remove('is-on');
  synth.speak(u);
}

$('#pairs').addEventListener('click', (e) => {
  const w = e.target.closest('.w');
  if (w) { if (synth) sayWord(w); return; }
  const b = e.target.closest('[data-say]');
  if (!b) return;
  const i = +b.dataset.say;
  // Lit cette phrase seule ; un appui long n'est pas nécessaire.
  stop();
  playFrom([lastEn[i]], 0, 'en');
  markReading(i);
});

document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('is-on', x === t));
  const full = t.dataset.view === 'full';
  $('#pairs').hidden = full;
  $('#full').hidden = !full;
}));

$('#btn-copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('#full-fr').textContent); status('Traduction copiée.'); }
  catch { status('Copie impossible ici — sélectionnez le texte à la main.'); }
});
$('#btn-say-fr').addEventListener('click', () => {
  const fr = lastFr.filter(Boolean);
  if (fr.length) playFrom(fr, 0, 'fr');
});

/* ---------- Saisie ---------- */
$('#btn-paste').addEventListener('click', async () => {
  try {
    const t = await navigator.clipboard.readText();
    if (t) { $('#src').value = t; status(''); }
  } catch {
    status('Appuyez longuement dans la zone de texte, puis « Coller ».');
    $('#src').focus();
  }
});
$('#btn-clear').addEventListener('click', () => {
  stop();
  $('#src').value = '';
  $('#result').hidden = true;
  store.set('last', '');
  $('#src').focus();
});
$('#src').value = store.get('last', '');

$('#btn-menu').addEventListener('click', () => { $('#menu').hidden = !$('#menu').hidden; });

function status(msg) { $('#status').textContent = msg; }

/* ---------- Hors ligne et mises à jour ---------- */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then((reg) => {
    reg.update();
    document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update(); });
  });
  let reloaded = false;
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded || !hadController) return; // pas de rechargement à la toute première visite
    reloaded = true;
    location.reload();
  });
}

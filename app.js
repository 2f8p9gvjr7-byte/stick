/* Lire l'anglais — coller un texte anglais, l'écouter, toucher un mot pour
   l'entendre et voir son sens, repérer les expressions idiomatiques et les
   garder dans un carnet. Aucune clé, aucun compte. Tout reste sur le téléphone. */

const APP_VERSION = '2.1';
const $ = (s) => document.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const store = {
  get(k, d) { try { const v = localStorage.getItem('lire.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('lire.' + k, JSON.stringify(v)); } catch {} }
};
$('#version').textContent = APP_VERSION;

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function status(msg) { $('#status').textContent = msg; }

/* =========================================================
   Phrases, mots, jetons
   ========================================================= */
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
  return parts.flatMap((p) => p.split(/\n+/)).map((s) => s.trim()).filter(Boolean);
}

const WORD_RE = /([A-Za-zÀ-ÿ0-9]+(?:['’-][A-Za-zÀ-ÿ0-9]+)*)/;

// Découpe une phrase : morceaux (mots aux indices impairs) et position de chaque mot.
function parseSentence(s) {
  const parts = s.split(WORD_RE);
  const words = [];
  let off = 0;
  parts.forEach((p, k) => {
    if (k % 2) words.push({ text: p, start: off, end: off + p.length });
    off += p.length;
  });
  return { parts, words };
}

const CONTR = { "'re": 'are', "'m": 'am', "'ll": 'will', "'ve": 'have' };
function normWord(w) {
  w = w.toLowerCase().replace(/’/g, "'");
  let m = w.match(/^(.+)n't$/);
  if (m) return [{ ca: 'can', wo: 'will', sha: 'shall', ai: 'is' }[m[1]] || m[1], 'not'];
  m = w.match(/^(.+)('s|'re|'m|'ll|'ve|'d)$/);
  if (m) return [m[1], CONTR[m[2]] || m[2]];
  return [w];
}

function tokensOf(words) {
  return words.flatMap((w, i) => normWord(w.text).map((t) => ({ t, w: i })));
}

/* =========================================================
   Expressions idiomatiques
   ========================================================= */
const IRREG = {
  be: "be is are was were been being am 's", have: "have has had having 's 'd",
  do: 'do does did done doing', go: 'go goes went gone going', get: 'get gets got gotten getting',
  take: 'take takes took taken taking', make: 'make makes made making', break: 'break breaks broke broken breaking',
  keep: 'keep keeps kept keeping', come: 'come comes came coming', give: 'give gives gave given giving',
  let: 'let lets letting', put: 'put puts putting', run: 'run runs ran running', cut: 'cut cuts cutting',
  hit: 'hit hits hitting', beat: 'beat beats beaten beating', bite: 'bite bites bit bitten biting',
  cost: 'cost costs costing', spill: 'spill spills spilled spilt spilling', hold: 'hold holds held holding',
  bring: 'bring brings brought bringing', see: 'see sees saw seen seeing', pay: 'pay pays paid paying',
  throw: 'throw throws threw thrown throwing', fall: 'fall falls fell fallen falling',
  stand: 'stand stands stood standing', sit: 'sit sits sat sitting', catch: 'catch catches caught catching',
  feel: 'feel feels felt feeling', set: 'set sets setting', speak: 'speak speaks spoke spoken speaking',
  tell: 'tell tells told telling', burn: 'burn burns burned burnt burning', leave: 'leave leaves left leaving',
  lose: 'lose loses lost losing', find: 'find finds found finding', think: 'think thinks thought thinking',
  hang: 'hang hangs hung hanged hanging', stick: 'stick sticks stuck sticking', shoot: 'shoot shoots shot shooting',
  sell: 'sell sells sold selling', wear: 'wear wears wore worn wearing', blow: 'blow blows blew blown blowing',
  draw: 'draw draws drew drawn drawing', steal: 'steal steals stole stolen stealing', drop: 'drop drops dropped dropping',
  sleep: 'sleep sleeps slept sleeping', read: 'read reads reading', win: 'win wins won winning',
  bear: 'bear bears bore borne bearing', shake: 'shake shakes shook shaken shaking', know: 'know knows knew known knowing',
  say: 'say says said saying', lend: 'lend lends lent lending', stab: 'stab stabs stabbed stabbing',
  rub: 'rub rubs rubbed rubbing', bet: 'bet bets betting', flog: 'flog flogs flogged flogging',
  bury: 'bury buries buried burying', tie: 'tie ties tied tying', learn: 'learn learns learned learnt learning',
  fly: 'fly flies flew flown flying', show: 'show shows showed shown showing',
  strike: 'strike strikes struck stricken striking', eat: 'eat eats ate eaten eating',
  fan: 'fan fans fanned fanning', slip: 'slip slips slipped slipping', step: 'step steps stepped stepping',
  stop: 'stop stops stopped stopping', plan: 'plan plans planned planning'
};
function verbForms(v) {
  if (IRREG[v]) return IRREG[v].split(' ');
  const f = [v];
  if (/(s|sh|ch|x|z|o)$/.test(v)) f.push(v + 'es');
  else if (/[^aeiou]y$/.test(v)) f.push(v.slice(0, -1) + 'ies');
  else f.push(v + 's');
  if (/e$/.test(v)) f.push(v + 'd');
  else if (/[^aeiou]y$/.test(v)) f.push(v.slice(0, -1) + 'ied');
  else f.push(v + 'ed');
  if (/ie$/.test(v)) f.push(v.slice(0, -2) + 'ying');
  else if (/[^e]e$/.test(v)) f.push(v.slice(0, -1) + 'ing');
  else f.push(v + 'ing');
  return f;
}

const POSS = new Set(['my', 'your', 'his', 'her', 'its', 'our', 'their']);
const REFL = ['myself', 'yourself', 'himself', 'herself', 'itself', 'ourselves', 'yourselves', 'themselves', 'oneself'];

function compile(p) {
  const out = [];
  // Les parenthèses peuvent contenir des espaces : « (now and then|now and again) ».
  const raws = p.toLowerCase().replace(/’/g, "'").match(/\^?\([^)]*\)\??|\S+/g) || [];
  for (let raw of raws) {
    let opt = false;
    if (raw.endsWith('?')) { opt = true; raw = raw.slice(0, -1); }
    if (raw === 'sb' || raw === 'sth' || raw === '…') { out.push({ k: 'wild', opt }); continue; }
    if (raw === "one's") { out.push({ k: 'poss', opt }); continue; }
    if (raw === 'oneself') { out.push({ k: 'seq', alts: REFL.map((x) => [x]), opt }); continue; }
    if (raw.startsWith('^')) {
      const inner = raw.slice(1);
      const verbs = inner.startsWith('(') ? inner.slice(1, -1).split('|') : [inner];
      out.push({ k: 'seq', alts: verbs.flatMap(verbForms).map((x) => [x]), opt });
      continue;
    }
    if (raw.startsWith('(')) {
      const alts = raw.slice(1, -1).split('|').map((a) => a.split(/\s+/).flatMap(normWord));
      out.push({ k: 'seq', alts, opt });
      continue;
    }
    for (const t of normWord(raw)) out.push({ k: 'seq', alts: [[t]], opt });
  }
  return out;
}

function matchAt(pat, toks, pi, ti) {
  if (pi === pat.length) return ti;
  const p = pat[pi];
  let r;
  if (p.k === 'wild') {
    for (let n = 1; n <= 3 && ti + n <= toks.length; n++) {
      r = matchAt(pat, toks, pi + 1, ti + n);
      if (r >= 0) return r;
    }
  } else if (p.k === 'poss') {
    if (ti < toks.length && POSS.has(toks[ti].t)) { r = matchAt(pat, toks, pi + 1, ti + 1); if (r >= 0) return r; }
    if (ti + 1 < toks.length && toks[ti + 1].t === "'s") { r = matchAt(pat, toks, pi + 1, ti + 2); if (r >= 0) return r; }
  } else {
    for (const seq of p.alts) {
      if (ti + seq.length > toks.length) continue;
      if (seq.every((t, j) => toks[ti + j].t === t)) {
        r = matchAt(pat, toks, pi + 1, ti + seq.length);
        if (r >= 0) return r;
      }
    }
  }
  return p.opt ? matchAt(pat, toks, pi + 1, ti) : -1;
}

const BASE_IDS = IDIOMS.map(([d, p, fr, note]) => ({ key: 'i:' + d.toLowerCase(), d, fr, note: note || '', pat: compile(p || d) }));
let IDS = BASE_IDS;
let userSig = '';

// Les groupes de mots gardés dans le carnet sont reconnus à leur tour dans les textes suivants.
function literalPattern(text) {
  return tokensOf(parseSentence(text).words).map((t) => ({ k: 'seq', alts: [[t.t]], opt: false }));
}
function rebuildUserIdioms() {
  const mine = carnet.filter((e) => e.kind === 'expr' && /\s/.test(e.en.trim()));
  const sig = mine.map((e) => e.key).join('|');
  if (sig === userSig) return false;
  userSig = sig;
  IDS = BASE_IDS.concat(mine.map((e) => ({ key: e.key, d: e.en, fr: e.fr, note: e.note || '', pat: literalPattern(e.en), user: true })));
  return true;
}

function findIdioms(toks) {
  const found = [];
  for (let k = 0; k < IDS.length; k++) {
    const id = IDS[k];
    for (let ti = 0; ti < toks.length; ti++) {
      const end = matchAt(id.pat, toks, 0, ti);
      if (end > ti) { found.push({ k, a: toks[ti].w, b: toks[end - 1].w }); ti = end - 1; }
    }
  }
  found.sort((x, y) => (y.b - y.a) - (x.b - x.a) || x.a - y.a);
  const chosen = [];
  for (const f of found) if (!chosen.some((c) => !(f.b < c.a || f.a > c.b))) chosen.push(f);
  return chosen.sort((x, y) => x.a - y.a);
}

/* =========================================================
   Voix
   ========================================================= */
const synth = window.speechSynthesis;
let voices = [];

function voiceScore(v) {
  let s = 0;
  if (/premium|enhanced|améliorée|qualité|natural|neural/i.test(v.name)) s += 10;
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
  sel.innerHTML = voices.map((v) => `<option value="${escapeHtml(v.voiceURI)}">${escapeHtml(v.name)} (${v.lang})</option>`).join('');
  if (saved && voices.some((v) => v.voiceURI === saved)) sel.value = saved;
}
if (synth) { loadVoices(); synth.addEventListener?.('voiceschanged', loadVoices); }
$('#voice').addEventListener('change', (e) => store.set('voice', e.target.value));

const rateInput = $('#rate');
rateInput.value = store.get('rate', 0.9);
const showRate = () => { $('#rate-out').textContent = String(rateInput.value).replace('.', ','); };
showRate();
rateInput.addEventListener('input', () => { showRate(); store.set('rate', +rateInput.value); });

const pauseBox = $('#pause-between');
pauseBox.checked = store.get('pause', true);
pauseBox.addEventListener('change', () => store.set('pause', pauseBox.checked));

function currentVoice() { return voices.find((v) => v.voiceURI === $('#voice').value) || voices[0] || null; }

function utter(text, lang, rate) {
  const u = new SpeechSynthesisUtterance(text);
  if (lang === 'en') {
    const v = currentVoice();
    if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'en-GB';
  } else {
    const fr = synth.getVoices().find((v) => /^fr/i.test(v.lang));
    if (fr) u.voice = fr;
    u.lang = fr ? fr.lang : 'fr-FR';
  }
  u.rate = rate ?? +rateInput.value;
  return u;
}

// Lecture lente d'un mot ou d'une expression isolée.
function saySlow(text) {
  if (!synth || !text) return;
  stop();
  synth.speak(utter(text, 'en', Math.min(+rateInput.value, 0.75)));
}

/* =========================================================
   Lecture du texte
   ========================================================= */
let queue = [], idx = 0, playing = false, paused = false, runId = 0;

function setButtons() {
  $('#btn-play').textContent = playing ? '▶︎ Reprendre au début' : '▶︎ Écouter';
  $('#btn-pause').disabled = !playing;
  $('#btn-pause').textContent = paused ? '▶︎ Suite' : '⏸ Pause';
  $('#btn-stop').disabled = !playing;
}
function markReading(i) {
  $$('.pair.is-reading').forEach((n) => n.classList.remove('is-reading'));
  const el = document.querySelector(`.pair[data-i="${i}"]`);
  if (el) { el.classList.add('is-reading'); el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
}
function playFrom(list, start = 0, lang = 'en', mark = true) {
  if (!synth) { status('Ce navigateur ne sait pas lire à voix haute.'); return; }
  stop();
  queue = list; idx = start; playing = true; paused = false;
  const myRun = ++runId;
  setButtons();
  const next = () => {
    if (myRun !== runId) return;
    if (idx >= queue.length) { stop(); return; }
    if (lang === 'en' && mark) markReading(idx);
    const u = utter(queue[idx++], lang);
    u.onend = u.onerror = () => { if (myRun === runId) setTimeout(next, pauseBox.checked ? 350 : 0); };
    synth.speak(u);
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
  status('Touchez un mot pour l\'entendre et voir son sens.');
  showSentences(list);
  playFrom(list, 0, 'en');
});
$('#btn-pause').addEventListener('click', () => {
  if (!playing) return;
  if (paused) { synth.resume(); paused = false; } else { synth.pause(); paused = true; }
  setButtons();
});
$('#btn-stop').addEventListener('click', stop);

/* =========================================================
   Traduction
   ========================================================= */
function decodeEntities(s) { const t = document.createElement('textarea'); t.innerHTML = s; return t.value; }

async function viaGoogle(text, dict) {
  const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=fr&dt=t'
    + (dict ? '&dt=bd' : '') + '&q=' + encodeURIComponent(text);
  const r = await fetch(url);
  if (!r.ok) throw new Error('google ' + r.status);
  const j = await r.json();
  const main = (j[0] || []).map((x) => x && x[0]).filter(Boolean).join('');
  if (!main) throw new Error('google vide');
  const groups = Array.isArray(j[1])
    ? j[1].map((g) => ({ pos: g[0], terms: (g[1] || []).slice(0, 5) })).filter((g) => g.terms.length)
    : [];
  return { main, groups };
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
  try { return (await viaGoogle(text, false)).main; }
  catch { return await viaMyMemory(text); }
}
const lookCache = new Map();
async function lookup(text) {
  const key = text.toLowerCase();
  if (lookCache.has(key)) return lookCache.get(key);
  let res;
  try { res = await viaGoogle(text, true); }
  catch { res = { main: await viaMyMemory(text), groups: [] }; }
  lookCache.set(key, res);
  return res;
}
const POS_FR = {
  noun: 'nom', verb: 'verbe', adjective: 'adjectif', adverb: 'adverbe', preposition: 'préposition',
  pronoun: 'pronom', conjunction: 'conjonction', interjection: 'interjection', article: 'article',
  abbreviation: 'abréviation', phrase: 'locution', prefix: 'préfixe', suffix: 'suffixe', particle: 'particule'
};

async function translateAll(list, onEach) {
  const out = new Array(list.length);
  let next = 0;
  async function worker() {
    while (next < list.length) {
      const i = next++;
      try { out[i] = await translate(list[i]); } catch { out[i] = null; }
      onEach(i, out[i]);
    }
  }
  await Promise.all([worker(), worker(), worker()]);
  return out;
}

/* =========================================================
   Affichage des phrases
   ========================================================= */
let lastEn = [], lastFr = [];
let SENT = [];   // par phrase : { text, words, idioms }

function sentenceHtml(s, i) {
  const { parts, words } = parseSentence(s);
  const idioms = findIdioms(tokensOf(words));
  SENT[i] = { text: s, words, idioms };
  let html = '', wi = -1;
  parts.forEach((p, k) => {
    if (k % 2 === 0) { html += escapeHtml(p); return; }
    wi++;
    const open = idioms.find((m) => m.a === wi);
    if (open) {
      const saved = carnetHas(idiomKey(open.k)) ? ' is-saved' : '';
      html += `<span class="idiom${saved}" data-k="${open.k}" data-a="${open.a}" data-b="${open.b}">`;
    }
    html += `<span class="w" data-wi="${wi}">${escapeHtml(p)}</span>`;
    if (idioms.some((m) => m.b === wi)) html += '</span>';
  });
  return html;
}

function renderPairs(en, translating) {
  SENT = [];
  $('#pairs').innerHTML = en.map((s, i) => `
    <li class="pair" data-i="${i}">
      <span class="en" lang="en">${sentenceHtml(s, i)}</span>
      <button class="say" data-say="${i}" aria-label="Écouter cette phrase">🔊</button>
      <span class="fr" lang="fr" data-fr="${i}"${translating ? '' : ' hidden'}>…</span>
    </li>`).join('');
  const n = SENT.reduce((a, s) => a + s.idioms.length, 0);
  $('#idiom-hint').hidden = !n;
  $('#idiom-hint').textContent = n === 1
    ? '1 expression repérée, soulignée en pointillé : touchez-la.'
    : `${n} expressions repérées, soulignées en pointillé : touchez-les.`;
}

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
  closeSheet();
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
});

$('#pairs').addEventListener('click', (e) => {
  const pair = e.target.closest('.pair');
  if (!pair) return;
  const i = +pair.dataset.i;
  if (e.target.closest('[data-say]')) {
    playFrom([lastEn[i]], 0, 'en', false);
    markReading(i);
    return;
  }
  const idiom = e.target.closest('.idiom');
  if (idiom) { openIdiom(i, +idiom.dataset.k, +idiom.dataset.a, +idiom.dataset.b); return; }
  const w = e.target.closest('.w');
  if (w) openWord(i, +w.dataset.wi);
});

$$('.tab').forEach((t) => t.addEventListener('click', () => {
  $$('.tab').forEach((x) => x.classList.toggle('is-on', x === t));
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

/* =========================================================
   Fiche (mot ou expression)
   ========================================================= */
let sheet = null;   // { i, a, b, k }
let sheetRun = 0;

function rangeText(i, a, b) {
  const s = SENT[i];
  return s.text.slice(s.words[a].start, s.words[b].end);
}

function highlightSel() {
  $$('.w.is-sel').forEach((n) => n.classList.remove('is-sel'));
  if (!sheet) return;
  for (let wi = sheet.a; wi <= sheet.b; wi++) {
    document.querySelector(`.pair[data-i="${sheet.i}"] .w[data-wi="${wi}"]`)?.classList.add('is-sel');
  }
}

function openWord(i, wi) {
  sheet = { i, a: wi, b: wi, k: null, key: null };
  saySlow(SENT[i].words[wi].text);
  renderSheet();
}

function openIdiom(i, k, a, b) {
  sheet = { i, a, b, k, key: IDS[k].key };
  saySlow(rangeText(i, a, b));
  const id = IDS[k];
  if (!carnetHas(id.key)) {
    carnetAdd({ key: id.key, en: id.d, seen: rangeText(i, a, b), fr: id.fr, note: id.note, ctx: SENT[i].text, kind: 'idiom' });
    sheet.justAdded = true;
  }
  renderSheet();
}

function sheetKey() {
  return sheet.k !== null ? idiomKey(sheet.k) : 'w:' + rangeText(sheet.i, sheet.a, sheet.b).toLowerCase();
}

function groupsText(groups) {
  return groups.map((g) => `${POS_FR[g.pos] || g.pos} : ${g.terms.join(', ')}`).join(' ; ');
}

function renderSheet() {
  const run = ++sheetRun;
  const text = rangeText(sheet.i, sheet.a, sheet.b);
  $('#sh-en').textContent = text;
  highlightSel();
  const isIdiom = sheet.k !== null;
  $('#sh-extend').hidden = isIdiom;
  $('#sh-less').disabled = sheet.a === sheet.b;
  $('#sh-left').disabled = sheet.a === 0;
  $('#sh-right').disabled = sheet.b >= SENT[sheet.i].words.length - 1;

  if (isIdiom) {
    const id = IDS[sheet.k];
    const mine = carnet.find((x) => x.key === id.key);   // sens éventuellement corrigé par vous
    const fr = (mine && mine.fr) || id.fr;
    const note = mine ? (mine.note || '') : id.note;
    $('#sh-kind').textContent = id.user ? 'Votre expression' : 'Expression';
    $('#sh-canon').hidden = id.d.toLowerCase() === text.toLowerCase();
    $('#sh-canon').textContent = 'Forme de base : ' + id.d;
    $('#sh-fr').innerHTML = fr ? `<p class="sh-main">${escapeHtml(fr)}</p>` : '<p class="sh-wait">Pas encore de sens : touchez « ✎ Modifier le sens ».</p>';
    $('#sh-note').hidden = !note;
    $('#sh-note').textContent = note;
  } else {
    $('#sh-kind').textContent = sheet.a === sheet.b ? 'Mot' : 'Groupe de mots';
    $('#sh-canon').hidden = true;
    $('#sh-note').hidden = true;
    if (!navigator.onLine) {
      $('#sh-fr').innerHTML = '<p class="sh-wait">Pas de réseau : le sens a besoin d\'internet. Le son, lui, marche.</p>';
    } else {
      $('#sh-fr').innerHTML = '<p class="sh-wait">Recherche du sens…</p>';
      lookup(text).then((res) => {
        if (run !== sheetRun) return;
        const mine = carnet.find((x) => x.key === sheetKey() && x.edited);
        $('#sh-fr').innerHTML = (mine ? `<p class="sh-mine">Votre sens : ${escapeHtml(mine.fr)}</p>` : '')
          + `<p class="sh-main">${escapeHtml(res.main)}</p>` + res.groups.map((g) =>
          `<p class="sh-pos"><span>${escapeHtml(POS_FR[g.pos] || g.pos)}</span> ${escapeHtml(g.terms.join(', '))}</p>`).join('');
        // Gardé auparavant sans traduction (hors ligne) : on complète.
        const e = carnet.find((x) => x.key === sheetKey());
        if (e && !e.fr) { e.fr = res.main; e.more = groupsText(res.groups); saveCarnet(); }
      }).catch(() => {
        if (run === sheetRun) $('#sh-fr').innerHTML = '<p class="sh-wait">Sens introuvable pour le moment. Réessayez.</p>';
      });
    }
  }
  updateSaveBtn();
  $('#sheet').hidden = false;
  document.body.classList.add('sheet-open');
  // Garder le mot touché visible au-dessus de la fiche.
  const el = document.querySelector('.w.is-sel');
  if (el) {
    const r = el.getBoundingClientRect();
    if (r.bottom > window.innerHeight * 0.38 || r.top < 0) window.scrollBy({ top: r.top - window.innerHeight * 0.18, behavior: 'smooth' });
  }
}

function updateSaveBtn() {
  if (!sheet) return;
  const has = carnetHas(sheetKey());
  const b = $('#sh-save');
  b.textContent = has ? (sheet.justAdded ? '✓ Ajoutée au carnet — retirer' : '✓ Dans le carnet — retirer') : '☆ Ajouter au carnet';
  b.classList.toggle('is-done', has);
  $('#sh-edit').hidden = !has;
}

function closeSheet() {
  sheet = null; sheetRun++;
  $('#sheet').hidden = true;
  document.body.classList.remove('sheet-open');
  highlightSel();
}

$('#sh-close').addEventListener('click', closeSheet);
$('#sheet .sheet-backdrop').addEventListener('click', closeSheet);
$('#sh-say').addEventListener('click', () => saySlow(rangeText(sheet.i, sheet.a, sheet.b)));
$('#sh-left').addEventListener('click', () => { sheet.a--; sheet.justAdded = false; renderSheet(); });
$('#sh-right').addEventListener('click', () => { sheet.b++; sheet.justAdded = false; renderSheet(); });
$('#sh-less').addEventListener('click', () => { sheet.b = sheet.a; renderSheet(); });

$('#sh-save').addEventListener('click', () => {
  const key = sheetKey();
  sheet.justAdded = false;
  if (carnetHas(key)) { carnetRemove(key); updateSaveBtn(); return; }
  const text = rangeText(sheet.i, sheet.a, sheet.b);
  if (sheet.k !== null) {
    const id = IDS[sheet.k];
    if (id.user) { carnetAdd({ key, en: id.d, fr: id.fr, note: id.note, ctx: SENT[sheet.i].text, kind: 'expr' }); updateSaveBtn(); return; }
    carnetAdd({ key, en: id.d, seen: text, fr: id.fr, note: id.note, ctx: SENT[sheet.i].text, kind: 'idiom' });
  } else {
    const res = lookCache.get(text.toLowerCase());
    carnetAdd({ key, en: text, fr: res ? res.main : '', more: res ? groupsText(res.groups) : '',
      ctx: SENT[sheet.i].text, kind: sheet.a === sheet.b ? 'word' : 'expr' });
  }
  updateSaveBtn();
});

$('#sh-edit').addEventListener('click', () => {
  if (sheet && editEntry(sheetKey())) renderSheet();
});

/* =========================================================
   Carnet
   ========================================================= */
let carnet = store.get('carnet', []);
function idiomKey(k) { return IDS[k].key; }
function carnetHas(key) { return carnet.some((e) => e.key === key); }

function saveCarnet() {
  store.set('carnet', carnet);
  if (rebuildUserIdioms() && lastEn.length) {
    // Nouvelle expression à vous : on resouligne le texte, traductions comprises.
    renderPairs(lastEn, lastFr.length > 0);
    lastFr.forEach((t, i) => { const el = document.querySelector(`[data-fr="${i}"]`); if (el) el.textContent = t ?? '(échec — réessayez)'; });
    if (sheet) {
      sheet.k = sheet.key ? IDS.findIndex((x) => x.key === sheet.key) : -1;
      if (sheet.k < 0) sheet.k = null;
      highlightSel();
    }
  }
  $('#carnet-count').textContent = carnet.length ? `(${carnet.length})` : '';
  // Soulignement plein pour les expressions déjà gardées.
  $$('.idiom').forEach((n) => n.classList.toggle('is-saved', carnetHas(idiomKey(+n.dataset.k))));
  renderCarnet();
}
function carnetAdd(e) {
  carnet = carnet.filter((x) => x.key !== e.key);
  carnet.unshift({ ...e, t: Date.now() });
  saveCarnet();
}
let lastRemoved = null;
function carnetRemove(key) {
  const pos = carnet.findIndex((x) => x.key === key);
  if (pos < 0) return;
  lastRemoved = { entry: carnet[pos], pos };
  carnet.splice(pos, 1);
  saveCarnet();
  toast(`« ${lastRemoved.entry.en} » retiré du carnet.`, true);
}

// Corriger ou compléter le sens d'une entrée du carnet.
function editEntry(key) {
  const e = carnet.find((x) => x.key === key);
  if (!e) return false;
  const fr = prompt(`Sens en français de « ${e.en} » :`, e.fr || '');
  if (fr === null) return false;
  const note = prompt('Remarque (facultatif) :', e.note || '');
  e.fr = fr.trim();
  if (note !== null) e.note = note.trim();
  e.edited = true;
  saveCarnet();
  return true;
}

const KIND = { idiom: 'Expression', word: 'Mot', expr: 'Groupe de mots' };
function renderCarnet() {
  $('#carnet-empty').hidden = carnet.length > 0;
  $('#carnet-tools').hidden = carnet.length === 0;
  $('#carnet-list').innerHTML = carnet.map((e) => `
    <li class="c-item" data-key="${escapeHtml(e.key)}">
      <div class="c-head">
        <span class="c-en" lang="en">${escapeHtml(e.en)}</span>
        <button class="c-say" aria-label="Écouter">🔊</button>
        <button class="c-edit" aria-label="Modifier le sens">✎</button>
        <button class="c-del" aria-label="Supprimer">✕</button>
      </div>
      <div class="c-fr">${escapeHtml(e.fr || '(pas encore de sens : touchez ✎)')}</div>
      ${e.more ? `<div class="c-more">${escapeHtml(e.more)}</div>` : ''}
      ${e.note ? `<div class="c-note">${escapeHtml(e.note)}</div>` : ''}
      ${e.ctx ? `<div class="c-ctx" lang="en">« ${escapeHtml(e.ctx)} »</div>` : ''}
      <div class="c-kind">${KIND[e.kind] || ''} · ${new Date(e.t || Date.now()).toLocaleDateString('fr-FR')}</div>
    </li>`).join('');
}

$('#carnet-list').addEventListener('click', (e) => {
  const li = e.target.closest('.c-item');
  if (!li) return;
  const entry = carnet.find((x) => x.key === li.dataset.key);
  if (!entry) return;
  if (e.target.closest('.c-del')) { carnetRemove(entry.key); return; }
  if (e.target.closest('.c-edit')) { editEntry(entry.key); return; }
  if (e.target.closest('.c-say')) { saySlow((entry.seen || entry.en).replace(/…/g, '')); return; }
  li.classList.toggle('is-shown');   // en mode « cacher le français »
});

const hideBox = $('#hide-fr');
hideBox.checked = store.get('hideFr', false);
function applyHide() { $('#carnet-list').classList.toggle('hide-fr', hideBox.checked); store.set('hideFr', hideBox.checked); }
hideBox.addEventListener('change', applyHide);
applyHide();

// Sauvegarde du carnet : export et import d'un fichier .json.
$('#btn-export').addEventListener('click', async () => {
  const json = JSON.stringify({ app: 'lire-anglais', v: 1, carnet }, null, 1);
  const name = `carnet-anglais-${new Date().toISOString().slice(0, 10)}.json`;
  try {
    const file = new File([json], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name }); return; }
  } catch (err) { if (err && err.name === 'AbortError') return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
});
$('#btn-import').addEventListener('click', () => $('#import-file').click());
$('#import-file').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    const items = Array.isArray(data) ? data : data.carnet;
    if (!Array.isArray(items)) throw new Error();
    let added = 0;
    for (const it of items) if (it && it.key && it.en && !carnetHas(it.key)) { carnet.push(it); added++; }
    carnet.sort((a, b) => (b.t || 0) - (a.t || 0));
    saveCarnet();
    toast(`${added} entrée(s) importée(s).`);
  } catch { toast('Fichier non reconnu.'); }
});

let toastTimer = 0;
function toast(msg, undo) {
  $('#toast-msg').textContent = msg;
  $('#toast-undo').hidden = !undo;
  $('#toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 5000);
}
$('#toast-undo').addEventListener('click', () => {
  if (lastRemoved) {
    carnet.splice(Math.min(lastRemoved.pos, carnet.length), 0, lastRemoved.entry);
    lastRemoved = null;
    saveCarnet();
    updateSaveBtn();
  }
  $('#toast').hidden = true;
});

/* =========================================================
   Onglets Lire / Carnet
   ========================================================= */
function showPage(name) {
  $$('.maintab').forEach((b) => b.classList.toggle('is-on', b.dataset.page === name));
  $('#page-lire').hidden = name !== 'lire';
  $('#page-carnet').hidden = name !== 'carnet';
  store.set('page', name);
  if (name === 'carnet') { closeSheet(); stop(); }
  window.scrollTo(0, 0);
}
$$('.maintab').forEach((b) => b.addEventListener('click', () => showPage(b.dataset.page)));

/* =========================================================
   Saisie
   ========================================================= */
let inputTimer = 0;
$('#src').addEventListener('input', () => {
  clearTimeout(inputTimer);
  inputTimer = setTimeout(() => {
    store.set('last', $('#src').value);
    const list = sentences($('#src').value);
    closeSheet();
    if (list.length) showSentences(list); else { lastEn = []; $('#result').hidden = true; }
  }, 500);
});
$('#btn-paste').addEventListener('click', async () => {
  try {
    const t = await navigator.clipboard.readText();
    if (t) { $('#src').value = t; status(''); store.set('last', t); closeSheet(); showSentences(sentences(t)); }
  } catch {
    status('Appuyez longuement dans la zone de texte, puis « Coller ».');
    $('#src').focus();
  }
});
$('#btn-clear').addEventListener('click', () => {
  stop(); closeSheet();
  $('#src').value = '';
  lastEn = []; lastFr = [];
  $('#result').hidden = true;
  store.set('last', '');
  $('#src').focus();
});
$('#btn-menu').addEventListener('click', () => { $('#menu').hidden = !$('#menu').hidden; });

/* ---------- Démarrage ---------- */
$('#src').value = store.get('last', '');
saveCarnet();
{
  const list = sentences($('#src').value);
  if (list.length) showSentences(list);
}
showPage(store.get('page', 'lire'));

/* ---------- Hors ligne et mises à jour ---------- */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then((reg) => {
    reg.update();
    document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update(); });
  });
  let reloaded = false;
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded || !hadController) return;
    reloaded = true;
    location.reload();
  });
}

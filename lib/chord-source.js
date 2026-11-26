/* Search a public chord index and keep only short chord sequences, never lyrics. */
const ROOTS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const SHAPES = new Set(['Am', 'F', 'C', 'G', 'Dm', 'Em', 'A7', 'G7', 'C7', 'D', 'A', 'E7', 'D7', 'Bb', 'Bm', 'B']);
const EASY = new Set(['C', 'F', 'G', 'Am', 'Dm', 'Em', 'G7']);
const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

function distance(a, b) {
  if (!a || !b) return Math.max(a.length, b.length);
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0]; row[0] = i;
    for (let k = 1; k <= b.length; k++) {
      const old = row[k];
      row[k] = Math.min(row[k] + 1, row[k - 1] + 1, previous + (a[i - 1] === b[k - 1] ? 0 : 1));
      previous = old;
    }
  }
  return row[b.length];
}

function pageData(html) {
  const encoded = html.match(/data-content="([^"]+)"/)?.[1];
  if (!encoded) throw Error('No chord data');
  return JSON.parse(encoded.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#0?39;|&#x27;/gi, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>'))?.store?.page?.data;
}

async function getPage(url, signal) {
  const response = await fetch(url, { signal, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; UkuleleMaster/1.0)' } });
  if (!response.ok) throw Error('Chord source unavailable');
  const html = await response.text();
  if (html.length > 800000) throw Error('Chord source too large');
  return pageData(html);
}

async function searchSongs(query, signal) {
  const url = new URL('https://www.ultimate-guitar.com/search.php');
  url.searchParams.set('search_type', 'title');
  url.searchParams.set('value', query);
  const results = (await getPage(url.href, signal)).results || [];
  const wanted = norm(query);
  let choices = results.filter((r) => r.type === 'Chords' && r.tab_url?.startsWith('https://tabs.ultimate-guitar.com/tab/') && r.song_name && r.artist_name)
    .map((r) => ({ ...r, match: norm(r.song_name).includes(wanted) || norm(r.artist_name).includes(wanted) }))
    .filter((r) => r.match);
  if (new Set(choices.map((r) => norm(r.song_name) + ':' + norm(r.artist_name))).size < 3) {
    try {
      url.searchParams.set('search_type', 'band');
      const artists = (await getPage(url.href, signal)).results || [];
      const artist = artists.filter((r) => norm(r.artist_name).includes(wanted) && /^\/artist\/[a-z0-9_-]+$/i.test(r.artist_url || ''))
        .sort((a, b) => (Number(b.tabs_cnt) || 0) - (Number(a.tabs_cnt) || 0))[0];
      if (artist) {
        const page = await getPage(`https://www.ultimate-guitar.com${artist.artist_url}`, signal);
        choices = choices.concat(Object.entries(page).filter(([key]) => key.endsWith('_tabs')).flatMap(([, tabs]) => Array.isArray(tabs) ? tabs : [])
          .filter((r) => r.type === 'Chords' && r.tab_url?.startsWith('https://tabs.ultimate-guitar.com/tab/') && r.song_name && r.artist_name));
      }
    } catch { /* Keep the title matches when the artist index is unavailable. */ }
  }
  const seen = new Set();
  return choices.sort((a, b) => (Number(b.votes) || 0) - (Number(a.votes) || 0))
    .filter((r) => { const key = `${norm(r.song_name)}:${norm(r.artist_name)}`; if (seen.has(key)) return false; seen.add(key); return true; })
    .slice(0, 6)
    .map((r) => ({ title: String(r.song_name).slice(0, 120), artist: String(r.artist_name).slice(0, 100) }));
}

function extractSections(content) {
  const heading = /\[(Intro|Verse(?:\s*\d+)?|Pre[- ]?Chorus|Chorus(?:\s*\d+)?|Bridge|Instrumental|Outro|Refrain)(?:[^\]]{0,20})\]/gi;
  const marks = [...content.matchAll(heading)];
  const parts = marks.length ? marks.map((m, i) => ({ name: m[1], text: content.slice(m.index + m[0].length, marks[i + 1]?.index || content.length) })) : [{ name: 'Song', text: content }];
  let truncated = parts.length > 12;
  const items = parts.slice(0, 12).map((part) => {
    const chords = [...part.text.matchAll(/\[ch\]([^\[]+)\[\/ch\]/gi)].map((m) => m[1].trim());
    if (chords.length > 20) truncated = true;
    return { name: part.name, chords: chords.slice(0, 20) };
  }).filter((part) => part.chords.length);
  return { items, truncated };
}
function sections(content) { return extractSections(content).items; }

function transpose(chord, shift) {
  const match = /^([A-G])([#b]?)(m|7)?$/.exec(chord.replace(/♭/g, 'b'));
  if (!match) return null;
  const root = match[1] + match[2];
  const index = ROOTS.indexOf(root.replace('C#', 'Db').replace('D#', 'Eb').replace('F#', 'Gb').replace('G#', 'Ab').replace('A#', 'Bb'));
  if (index < 0) return null;
  const name = ROOTS[(index + shift) % 12] + (match[3] || '');
  return SHAPES.has(name) ? name : null;
}

function arrangement(tab, source) {
  const extracted = extractSections(tab.tab_view?.wiki_tab?.content || '');
  const raw = extracted.items;
  if (!raw.length) return null;
  // Some charts label a recording's key while displaying a different chord key.
  const originalKey = String(raw[0].chords[0] || '').match(/^([A-G][#b]?)/)?.[1] || '';
  const options = Array.from({ length: 12 }, (_, shift) => {
    const mapped = raw.map((part) => ({ name: part.name, chords: part.chords.map((c) => transpose(c, shift)) }));
    if (mapped.some((part) => part.chords.includes(null))) return null;
    const chords = [...new Set(mapped.flatMap((part) => part.chords))];
    const key = originalKey ? transpose(originalKey, shift) : '';
    const score = chords.filter((c) => !EASY.has(c)).length * 10 + (key === 'C' ? 0 : 2) + (shift ? 1 : 0);
    return { mapped, key, shift, score };
  }).filter(Boolean).sort((a, b) => a.score - b.score)[0];
  if (!options) return null;
  return { title: tab.tab.song_name, artist: tab.tab.artist_name, source, key: options.key || '', originalKey: options.shift ? originalKey : '', tempo: 72, beats: 4, coverage: 'excerpt', truncated: extracted.truncated, sections: options.mapped };
}

async function findSong(title, artist, signal) {
  const query = new URL('https://www.ultimate-guitar.com/search.php');
  query.searchParams.set('search_type', 'title'); query.searchParams.set('value', title);
  const results = (await getPage(query.href, signal)).results || [];
  const wanted = norm(title), requestedArtist = norm(artist);
  const choices = results.filter((r) => r.type === 'Chords' && r.tab_url?.startsWith('https://tabs.ultimate-guitar.com/tab/'))
    .map((r) => {
      const song = norm(r.song_name), performer = norm(r.artist_name);
      const titleDistance = distance(wanted, song);
      const artistDistance = requestedArtist && !performer.includes(requestedArtist) && !requestedArtist.includes(performer) ? distance(requestedArtist, performer) : 0;
      return { ...r, score: titleDistance * 20 + artistDistance * 4 - Math.log2(1 + (r.votes || 0)) };
    }).filter((r) => distance(wanted, norm(r.song_name)) <= Math.max(2, Math.floor(wanted.length * 0.2)))
    .sort((a, b) => a.score - b.score).slice(0, 3);
  for (const choice of choices) {
    try {
      const tab = await getPage(choice.tab_url, signal);
      const song = arrangement(tab, choice.tab_url);
      if (song) return song;
    } catch { /* Try the next sourced chart. */ }
  }
  return null;
}

module.exports = { findSong, searchSongs, sections, transpose, arrangement };

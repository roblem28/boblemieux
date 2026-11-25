// Bloop "song names": an iPhone Shortcut runs Shazam ("Recognize Music") and POSTs {title, artist} here; the Bloop page
// (public/bloop/index.html) GETs the latest one and floats it over the light show. One entry per room code, stored in
// the site-wide Netlify Blobs store "bloop-now". The room code is a long random string the page makes and keeps on the
// phone - it is the only thing tying a Shortcut to a screen. No secrets and no third-party service.
import { getStore } from "@netlify/blobs";

const ROOM = /^[A-Za-z0-9]{16,40}$/;
const MAX_BYTES = 2048;
const MAX_AGE_MS = 6 * 60 * 60 * 1000;      // a name older than this is treated as gone

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
// The Shortcut is usually built by the phone from a pasted sentence, so the exact shape of what it sends varies:
// JSON, a form, plain text, or values in the link itself, with keys in any case. Take the song from wherever it is.
const pick = (o, names) => {
  for (const k of Object.keys(o || {})) if (names.includes(k.toLowerCase())) { const v = clean(o[k]); if (v) return v; }
  return "";
};
const readSong = (fields) => {
  let title = pick(fields, ["title", "song", "name", "track"]);
  let artist = pick(fields, ["artist", "by", "artists"]);
  if (title && !artist) {                      // "Song by Artist" in one piece
    const i = title.toLowerCase().lastIndexOf(" by ");
    if (i > 0) { artist = title.slice(i + 4).trim(); title = title.slice(0, i).trim(); }
  }
  return title ? { title, artist, at: Date.now() } : null;
};
const clean = (v) => (typeof v === "string" || typeof v === "number" ? String(v) : "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 200);

export default async (req) => {
  const params = new URL(req.url).searchParams;
  const room = params.get("room") || "";
  const query = Object.fromEntries(params);
  delete query.room;
  if (!ROOM.test(room)) return json(400, { ok: false, error: "room" });
  const store = getStore({ name: "bloop-now", consistency: "strong" });

  if (req.method === "POST" || req.method === "PUT") {
    const text = await req.text();
    if (text.length > MAX_BYTES) return json(413, { ok: false, error: "too_big" });
    let fields = {};
    const body = text.trim();
    if (body) {
      let parsed;
      try { parsed = JSON.parse(body); } catch { parsed = undefined; }
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) fields = parsed;
      else if (typeof parsed === "string") fields = { title: parsed };
      else if (parsed === undefined && /^[^=&\s]+=/.test(body) && !body.includes("\n")) fields = Object.fromEntries(new URLSearchParams(body));
      else if (parsed === undefined) fields = { title: body };
      else return json(400, { ok: false, error: "json" });
    }
    const song = readSong({ ...query, ...fields });
    if (!song) return json(400, { ok: false, error: "title" });
    await store.setJSON(room, song);
    return json(200, { ok: true, song });
  }
  if (req.method === "GET") {
    const sent = readSong(query);                 // a Shortcut that put the song in the link
    if (sent) { await store.setJSON(room, sent); return json(200, { ok: true, song: sent }); }
    const song = await store.get(room, { type: "json" });
    const now = Date.now();
    const fresh = song && typeof song.at === "number" && now - song.at < MAX_AGE_MS;
    return json(200, { ok: true, now, song: fresh ? song : null });
  }
  return json(405, { ok: false, error: "method" });
};

// The page asks every 8 s while a show is running; this leaves room for that and stops a flood.
export const config = {
  rateLimit: { windowLimit: 40, windowSize: 60, aggregateBy: ["ip", "domain"] },
};

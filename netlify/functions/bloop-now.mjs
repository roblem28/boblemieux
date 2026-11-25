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
const clean = (v) => (typeof v === "string" || typeof v === "number" ? String(v) : "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 200);

export default async (req) => {
  const room = new URL(req.url).searchParams.get("room") || "";
  if (!ROOM.test(room)) return json(400, { ok: false, error: "room" });
  const store = getStore({ name: "bloop-now", consistency: "strong" });

  if (req.method === "POST") {
    const text = await req.text();
    if (text.length > MAX_BYTES) return json(413, { ok: false, error: "too_big" });
    let body;
    try { body = JSON.parse(text); } catch { return json(400, { ok: false, error: "json" }); }
    const title = clean(body && body.title);
    if (!title) return json(400, { ok: false, error: "title" });
    const song = { title, artist: clean(body.artist), at: Date.now() };
    await store.setJSON(room, song);
    return json(200, { ok: true, song });
  }
  if (req.method === "GET") {
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

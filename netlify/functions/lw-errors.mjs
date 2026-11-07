// Lightwalker's error log: the game page (public/games/lightwalker/index.html) POSTs every uncaught error and unhandled
// rejection here as JSON (message, file, line, column, stack, userAgent); a GET lists the latest entries, newest first
// (?n=, default 50, max 200). Stored in the site-wide Netlify Blobs store "lw-errors", so draft previews log here too.
// No secrets: the store is reached through the function's own Netlify context.
import { getStore } from "@netlify/blobs";

const MAX_BYTES = 16384;

export default async (req) => {
  const store = getStore("lw-errors");
  if (req.method === "POST") {
    const text = await req.text();
    if (text.length > MAX_BYTES) return new Response("too large", { status: 413 });
    let entry;
    try {
      entry = JSON.parse(text);
    } catch {
      return new Response("bad json", { status: 400 });
    }
    const received = new Date().toISOString();
    const key = `${received}_${Math.random().toString(36).slice(2, 8)}`;
    await store.setJSON(key, { received, referer: req.headers.get("referer") || "", entry });
    return Response.json({ ok: true, key });
  }
  if (req.method === "GET") {
    const n = Math.min(Math.max(parseInt(new URL(req.url).searchParams.get("n") || "50", 10) || 50, 1), 200);
    const { blobs } = await store.list();
    const keys = blobs.map((b) => b.key).sort().reverse().slice(0, n);
    const entries = await Promise.all(keys.map(async (key) => ({ key, ...(await store.get(key, { type: "json" })) })));
    return Response.json({ count: blobs.length, entries }, { headers: { "Cache-Control": "no-store" } });
  }
  return new Response("method not allowed", { status: 405 });
};

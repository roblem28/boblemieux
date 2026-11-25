// Bloop song-names suite.   node tests/bloop/serve.mjs 8765   then   node tests/bloop/run.js http://127.0.0.1:8765
// Covers the bloop-now function (as the Shortcut and the page use it) and the page showing what the Shortcut posts.
// CHROME=/path/to/chrome picks the browser; otherwise Playwright's own Chromium is used.
const { chromium } = require('playwright');
const base = (process.argv[2] || 'http://127.0.0.1:8765').replace(/\/+$/, '');
const FN = base + '/.netlify/functions/bloop-now';
const GL = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'];
let fail = 0;
const ok = (name, cond, extra = '') => { if (!cond) fail++; console.log(cond ? 'PASS' : 'FAIL', name, extra); };
const call = async (method, room, body) => {
  const r = await fetch(`${FN}?room=${room}`, { method, headers: body === undefined ? {} : { 'content-type': 'application/json' }, body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) });
  return { status: r.status, json: await r.json().catch(() => null) };
};
const post = (room, body) => call('POST', room, body);

(async () => {
  // ---- the function on its own
  const R = 'TestRoomAAAAAAAAAAAA' + Math.random().toString(36).slice(2, 8);
  let r = await call('GET', 'short');                    ok('bad room refused', r.status === 400 && r.json.error === 'room');
  r = await call('GET', R);                               ok('empty room answers null', r.status === 200 && r.json.ok && r.json.song === null);
  r = await post(R, '[1,2]');                             ok('non-object JSON refused', r.status === 400 && r.json.error === 'json');
  r = await post(R, { artist: 'x' });                     ok('missing title refused', r.status === 400 && r.json.error === 'title');
  r = await post(R, { title: 'x'.repeat(3000) });         ok('oversize body refused', r.status === 413);
  r = await call('DELETE', R);                            ok('other methods refused', r.status === 405);
  r = await post(R, { title: '  One\nSong  ', artist: 'A'.repeat(500) });
  ok('post stored, cleaned and trimmed', r.status === 200 && r.json.song.title === 'One Song' && r.json.song.artist.length === 200);
  r = await call('GET', R);                               ok('get returns it with server time', r.json.song.title === 'One Song' && r.json.now >= r.json.song.at);
  r = await call('GET', R + 'x');                         ok('rooms are separate', r.json.song === null);
  // the phone builds the Shortcut, so accept the shapes it might send
  const raw = async (method, qs, body, type) => { const q = await fetch(`${FN}?room=${R}${qs}`, { method, headers: type ? { 'content-type': type } : {}, body }); await q.json(); return (await call('GET', R)).json.song; };
  let g = await raw('POST', '', JSON.stringify({ Title: 'Caps Keys', Artist: 'Someone' }), 'application/json');   ok('capitalised keys', g.title === 'Caps Keys' && g.artist === 'Someone');
  g = await raw('POST', '', JSON.stringify({ song: 'One Piece by The Band' }), 'application/json');               ok('"Song by Artist" split', g.title === 'One Piece' && g.artist === 'The Band');
  g = await raw('POST', '', 'title=Form+Song&artist=Form+Artist', 'application/x-www-form-urlencoded');           ok('form body', g.title === 'Form Song' && g.artist === 'Form Artist');
  g = await raw('POST', '', 'Plain Text by Somebody', 'text/plain');                                              ok('plain text body', g.title === 'Plain Text' && g.artist === 'Somebody');
  g = await raw('POST', '&title=In%20Link&artist=Linker', undefined);                                             ok('POST with values in the link', g.title === 'In Link' && g.artist === 'Linker');
  g = await raw('GET', '&title=Get%20Song&artist=Getter', undefined);                                             ok('GET with values in the link', g.title === 'Get Song' && g.artist === 'Getter');
  r = await call('GET', R);                                                                                       ok('plain GET still only reads', r.json.song.title === 'Get Song' && typeof r.json.now === 'number');

  // ---- the page
  const errors = [];
  const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: [...GL, '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  const page = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  page.on('pageerror', e => errors.push(String(e)));
  let gets = 0; page.on('request', q => { if (q.url().includes('bloop-now') && q.method() === 'GET') gets++; });
  await page.goto(base + '/bloop/'); await page.waitForTimeout(600);
  ok('graphics start', await page.evaluate(() => window.__bloop.glOK));
  const room = await page.evaluate(() => window.__bloop.room);
  ok('room code made', /^[A-Za-z0-9]{16,40}$/.test(room), room.length + ' chars');
  await page.waitForTimeout(9000);
  ok('idle page does not poll', gets === 0, gets + ' requests');

  await page.click('#what');
  ok('setup panel opens', await page.isVisible('#pair'));
  ok('pasted text carries this page and room', (await page.inputValue('#pair-url')).includes(` ${FN}?room=${room} `) && (await page.inputValue('#pair-url')).startsWith('Recognize the music'));
  ok('no sideways overflow at 390px', await page.evaluate(() => { const s = document.getElementById('sheet'); return s.scrollWidth <= s.clientWidth; }));
  await page.screenshot({ path: 'tests/bloop/shot-setup.png' });
  await page.click('#what');
  ok('setup panel closes', !(await page.isVisible('#pair')));

  await page.click('#mic'); await page.waitForFunction(() => window.__bloop.mic);
  await post(room, { title: 'Test Song <b>x</b>', artist: 'Test Artist' });       // what the Shortcut sends
  const t0 = Date.now();
  await page.waitForFunction(() => document.getElementById('toast').classList.contains('on'), null, { timeout: 15000 });
  ok('song appears within one poll', Date.now() - t0 < 10000, ((Date.now() - t0) / 1000).toFixed(1) + ' s');
  ok('title shown as text, not HTML', (await page.textContent('#song .s-title')) === 'Test Song <b>x</b>' && (await page.locator('#song b, #toast b').count()) === 0);
  ok('artist shown', (await page.textContent('#song .s-sub')) === 'Test Artist');
  ok('TV banner carries title and artist', (await page.textContent('#toast-title')).startsWith('Test Song') && (await page.textContent('#toast-sub')) === 'Test Artist');
  ok('header shows the song', (await page.textContent('#now')).includes('Test Song'));
  ok('mic still following the room', await page.evaluate(() => window.__bloop.mic));
  await page.screenshot({ path: 'tests/bloop/shot-song.png' });

  await post(room, { title: 'Second Song', artist: '' });
  await page.waitForFunction(() => document.querySelector('#song .s-title').textContent === 'Second Song', null, { timeout: 15000 });
  ok('next song replaces it, blank artist handled', (await page.locator('#song .s-sub').count()) === 0);
  await post(room.split('').reverse().join(''), { title: 'Someone Else', artist: 'x' });
  await page.waitForTimeout(9000);
  ok('another room does not leak in', (await page.textContent('#song .s-title')) === 'Second Song');

  await page.setViewportSize({ width: 844, height: 390 }); await page.waitForTimeout(300);
  await post(room, { title: 'Sideways Song', artist: 'Landscape' });
  await page.waitForFunction(() => document.querySelector('#song .s-title').textContent === 'Sideways Song', null, { timeout: 15000 });
  await page.screenshot({ path: 'tests/bloop/shot-landscape.png' });
  ok('landscape shows it', true);

  // reload: same room, recent song comes back; a copy of the page with no function behind it says so
  await page.reload(); await page.waitForTimeout(500);
  ok('room survives a reload', (await page.evaluate(() => window.__bloop.room)) === room);
  const p2 = await b.newPage({ viewport: { width: 390, height: 844 } });
  await p2.route('**/bloop-now**', q => q.fulfill({ status: 404, contentType: 'text/html', body: '<h1>404</h1>' }));
  await p2.goto(base + '/bloop/'); await p2.click('#what'); await p2.waitForTimeout(800);
  ok('page without the function explains itself', (await p2.textContent('#pair-note')).includes('only work on the boblemieux.ai copy'));
  ok('no page errors', errors.length === 0, errors.join(' | '));
  await b.close();
  console.log(fail ? `BLOOP: ${fail} FAILED` : 'BLOOP: ALL PASS'); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });

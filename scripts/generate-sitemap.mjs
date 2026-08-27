// Emits public/sitemap.xml before every build (npm "prebuild" hook).
//
// URL derivation mirrors contentUrl() in src/utils/content.ts: strip the
// content/pages prefix and the extension, collapse "/index" to its parent, and
// map the root index to "/". If that logic ever changes, change it here too.
//
// next.config.js sets trailingSlash: true, so every emitted loc ends in "/" to
// match the canonical URL the site actually serves and avoid a redirect hop.
import { readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const SITE_URL = (process.env.URL || process.env.DEPLOY_PRIME_URL || 'https://boblemieux.ai').replace(/\/$/, '');
const PAGES_DIR = join(process.cwd(), 'content', 'pages');
const PUBLIC_DIR = join(process.cwd(), 'public');

// Routes that are React pages or hand-written HTML rather than markdown, so
// they never appear in content/pages and have to be listed explicitly.
const EXTRA_ROUTES = [
    '/projects/fec/',
    '/projects/spending/',
    '/projects/weather/',
    '/projects/nyt/',
    '/wire/',
    '/games/cheeseburgler.html',
    '/games/voxelcraft/',
    '/games/obstacleboy/',
    '/comics/gas-station-gummies.html',
    '/widgets/mindmap-3d.html'
];

function walk(dir) {
    const out = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) out.push(...walk(full));
        else if (/\.(md|markdown|json)$/i.test(entry)) out.push(full);
    }
    return out;
}

function toUrlPath(file) {
    let url = '/' + relative(PAGES_DIR, file).split(sep).join('/');
    url = url.replace(/\.[^.]+$/, '');
    if (url.endsWith('/index')) url = url.slice(0, -'/index'.length) || '/';
    return url === '/' ? '/' : `${url}/`;
}

const routes = [...new Set([...walk(PAGES_DIR).map(toUrlPath), ...EXTRA_ROUTES])].sort((a, b) =>
    a === '/' ? -1 : b === '/' ? 1 : a.localeCompare(b)
);

const lastmod = new Date().toISOString().slice(0, 10);
const body = routes
    .map((route) => {
        // The home page is the entry point; case studies and project pages are
        // the pages worth ranking; everything else sits below them.
        const priority = route === '/' ? '1.0' : /^\/(work|projects)\//.test(route) ? '0.8' : '0.6';
        return `    <url>\n        <loc>${SITE_URL}${route}</loc>\n        <lastmod>${lastmod}</lastmod>\n        <priority>${priority}</priority>\n    </url>`;
    })
    .join('\n');

mkdirSync(PUBLIC_DIR, { recursive: true });
writeFileSync(
    join(PUBLIC_DIR, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`,
    'utf8'
);

console.log(`sitemap.xml: ${routes.length} routes at ${SITE_URL}`);

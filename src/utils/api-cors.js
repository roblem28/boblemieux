// Shared CORS policy for the four proxy routes under src/pages/api.
//
// All four previously sent Access-Control-Allow-Origin: '*'. For the keyless
// NOAA/USAspending proxies that is merely untidy, but /api/fec injects a private
// OpenFEC key server-side, so a wildcard made this site a free, unauthenticated
// proxy in front of that key for any origin on the internet. The key itself was
// never exposed - the risk is quota exhaustion, and fec.js already has 429
// backoff logic, so it was a live failure mode rather than a theoretical one.
//
// Same-origin browser requests send no Origin header and never needed CORS at
// all; the static apps under public/projects call these proxies same-origin.
// Cross-origin access is now limited to this site's own deploys.

const STATIC_ALLOWED = [
    'https://boblemieux.ai',
    'https://www.boblemieux.ai',
    'http://localhost:3000',
    'http://localhost:4321'
];

function allowedOrigins() {
    // Netlify sets URL for production and DEPLOY_PRIME_URL for branch/preview
    // deploys, so previews keep working without reopening the route to everyone.
    return [process.env.URL, process.env.DEPLOY_PRIME_URL, ...STATIC_ALLOWED]
        .filter(Boolean)
        .map((origin) => origin.replace(/\/$/, ''));
}

export function applyCors(req, res) {
    const origin = req.headers?.origin;

    // No Origin header means same-origin or a non-browser client: nothing to grant.
    if (origin && allowedOrigins().includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        // Vary matters because the value now depends on the request.
        res.setHeader('Vary', 'Origin');
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

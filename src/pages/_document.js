import { Html, Head, Main, NextScript } from 'next/document';

// Every page in content/pages/** is authored with `colors: colors-a`, so the
// page-level theme is set here on <body> at render time rather than being
// assigned from a useEffect after mount. _app.js still syncs the attribute on
// the client, which keeps per-page overrides working if a page ever picks a
// different palette.
//
// This is rendered by _document, not React hydration, so it is server-present
// on the very first byte — which is what lets the app drop the isMounted gate.
export default function Document() {
    return (
        <Html lang="en">
            <Head>
                {/* Was an @import at the top of main.css, which created a
                    three-origin critical chain (html -> css -> googleapis ->
                    gstatic) with no preconnect. Only DM Mono is referenced -
                    style.json sets fontBody to it - so Azeret Mono, half the
                    downloaded faces, is dropped. */}
                {/* Brand primary. Until now #0804F6 and #FE491F were defined in
                    style.json and rendered nowhere: only colors-a and colors-f are
                    used by any content, so the site painted pure monochrome. */}
                <meta name="theme-color" content="#0804F6" />
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
                <link
                    rel="stylesheet"
                    href="https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,400;0,500;1,400;1,500&display=swap"
                />
            </Head>
            <body data-theme="colors-a">
                <Main />
                <NextScript />
            </body>
        </Html>
    );
}

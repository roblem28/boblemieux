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
            <Head />
            <body data-theme="colors-a">
                <Main />
                <NextScript />
            </body>
        </Html>
    );
}

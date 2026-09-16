import Document, { Head, Html, Main, NextScript } from 'next/document';

// Same as Next's default Document, plus server-rendered robots meta for unlisted
// pages. _app.js renders page components only after mount, so a <meta> placed in a
// page's next/head never reaches the served HTML; crawlers and view-source would
// not see it. netlify.toml also sends X-Robots-Tag for these paths.
const NOINDEX_PAGES = new Set(['/tools/p6']);

export default class SiteDocument extends Document {
    render() {
        const noindex = NOINDEX_PAGES.has(this.props.__NEXT_DATA__.page);
        return (
            <Html>
                <Head>{noindex && <meta name="robots" content="noindex,nofollow" />}</Head>
                <body>
                    <Main />
                    <NextScript />
                </body>
            </Html>
        );
    }
}

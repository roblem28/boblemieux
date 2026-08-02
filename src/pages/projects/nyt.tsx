import Head from 'next/head';
import { useCallback, useEffect, useRef, useState } from 'react';

import BaseLayout from '@/components/layouts/BaseLayout';
import { allContent } from '@/utils/content';

// NYT Daily Digest lives in a separate repo (roblem28/nyt-digest) that builds a
// single self-contained index.html with Python and deploys to its own Netlify
// project. netlify.toml proxies that project to /projects/nyt/embed, which puts
// it on this origin — so unlike a cross-origin embed we can read the iframe's
// document height directly and grow the frame to fit, leaving the page with one
// scrollbar instead of two.
const EMBED_SRC = '/projects/nyt/embed';

// Used until the first measurement lands, and kept as the floor afterwards so a
// failed measurement can never collapse the frame to nothing.
const FALLBACK_HEIGHT = 900;

export default function NytPage(props: any) {
    const frameRef = useRef<HTMLIFrameElement | null>(null);
    const [height, setHeight] = useState<number>(FALLBACK_HEIGHT);

    const measure = useCallback(() => {
        const doc = frameRef.current?.contentDocument;
        if (!doc?.documentElement) return;
        const next = Math.max(doc.documentElement.scrollHeight, doc.body?.scrollHeight ?? 0);
        if (next > 0) setHeight(Math.max(next, FALLBACK_HEIGHT));
    }, []);

    useEffect(() => {
        const frame = frameRef.current;
        if (!frame) return;

        let observer: ResizeObserver | undefined;

        const attach = () => {
            // Same-origin via the proxy, but if the redirect is ever removed
            // this throws a cross-origin SecurityError — fall back to the fixed
            // height rather than breaking the page.
            try {
                const doc = frame.contentDocument;
                if (!doc?.documentElement) return;
                measure();
                observer?.disconnect();
                observer = new ResizeObserver(measure);
                observer.observe(doc.documentElement);
                if (doc.body) observer.observe(doc.body);
            } catch {
                setHeight(FALLBACK_HEIGHT);
            }
        };

        frame.addEventListener('load', attach);
        // The frame may already be loaded when this effect runs (bfcache, fast
        // cache hit), in which case the load event never fires again.
        if (frame.contentDocument?.readyState === 'complete') attach();

        window.addEventListener('resize', measure);
        return () => {
            frame.removeEventListener('load', attach);
            window.removeEventListener('resize', measure);
            observer?.disconnect();
        };
    }, [measure]);

    return (
        <>
            <Head>
                <title>NYT Daily Digest — Article Index</title>
                <meta
                    name="description"
                    content="An auto-updating index of New York Times articles with full-text search, section filters, and keyword tagging. Built with Python, SQLite FTS5, and Netlify."
                />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
            </Head>
            <BaseLayout {...props}>
                {/* Matches the dashboard's own --bg-body so there is no seam or
                    white flash before the iframe paints. */}
                <div style={{ backgroundColor: '#0b0f19' }}>
                    <iframe
                        ref={frameRef}
                        src={EMBED_SRC}
                        title="NYT Daily Digest — Article Index"
                        className="block w-full border-0"
                        style={{ height: `${height}px`, colorScheme: 'dark' }}
                        scrolling="no"
                    />
                </div>
            </BaseLayout>
        </>
    );
}

export function getStaticProps() {
    const allData = allContent();
    const pick = (modelName: string) => allData.find((o: any) => o.__metadata?.modelName === modelName) || null;
    const global = JSON.parse(JSON.stringify({ site: pick('Config'), theme: pick('ThemeStyle') }));
    return { props: { global, colors: 'colors-a' } };
}

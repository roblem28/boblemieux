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

// Used before the first measurement lands and if the frame ever becomes
// unreadable. Not applied as a floor to real measurements — a filtered result
// set is legitimately shorter than this.
const FALLBACK_HEIGHT = 900;

export default function NytPage(props: any) {
    const frameRef = useRef<HTMLIFrameElement | null>(null);
    const [height, setHeight] = useState<number>(FALLBACK_HEIGHT);

    const measure = useCallback(() => {
        const doc = frameRef.current?.contentDocument;
        const body = doc?.body;
        if (!body) return;
        // Measure the body, never documentElement: <html> stretches to fill the
        // iframe, so once we grow the frame its scrollHeight reports the frame
        // height back to us. That ratchets — the frame could grow but never
        // shrink again when a filter narrows the results.
        const style = doc!.defaultView?.getComputedStyle(body);
        const margins = style ? parseFloat(style.marginTop) + parseFloat(style.marginBottom) : 0;
        const next = Math.ceil(body.getBoundingClientRect().height + (Number.isFinite(margins) ? margins : 0));
        if (next > 0) setHeight(next);
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
                if (!doc?.body) return;
                measure();
                observer?.disconnect();
                // Observe the body only. documentElement tracks the frame we
                // are sizing, so watching it would feed our own resizes back in.
                observer = new ResizeObserver(measure);
                observer.observe(doc.body);
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

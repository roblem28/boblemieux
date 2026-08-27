import Head from 'next/head';
import StandalonePageHead from '@/components/StandalonePageHead';
import dynamic from 'next/dynamic';

import BaseLayout from '@/components/layouts/BaseLayout';
import { allContent } from '@/utils/content';

// Client-only: the map touches `window`/`document`, so disable SSR.
const WeatherMap = dynamic(() => import('@/components/projects/WeatherMap/WeatherMap'), { ssr: false });

export default function WeatherPage(props: any) {
    return (
        <>
            <Head>
                {/* Was a global import in _app.js, which put 64,602 raw bytes of
                    render-blocking CSS on all 33 pages for a library used on this
                    one. public/vendor/maplibre-gl.css is copied from the installed
                    package by scripts/copy-vendor-css.mjs on the prebuild hook. */}
                {/* eslint-disable-next-line @next/next/no-css-tags -- the pages
                    router only permits node_modules CSS imports from _app, and
                    importing it there made it global on all 33 pages. */}
                <link rel="stylesheet" href="/vendor/maplibre-gl.css" />
            </Head>
            <StandalonePageHead
                title={'Weather Map — Radar, Precip Type & Alerts'}
                description={'Live NOAA/NWS radar, precip type, and severe-weather alerts on an interactive MapLibre map.'}
                path="/projects/weather/"
                viewport="width=device-width, initial-scale=1, viewport-fit=cover"
            />
            <BaseLayout {...props}>
                {/* These pages were bare iframes: no heading, no byline, and
                    therefore zero headings in the document outline. */}
                <div className="max-w-7xl mx-auto px-4 pt-8 pb-2">
                    <h1 className="text-3xl sm:text-4xl">Weather Map</h1>
                    <p className="mt-2 max-w-3xl sm:text-lg opacity-80">Live NOAA/NWS radar, precipitation type, and severe-weather alerts on an interactive MapLibre map.</p>
                </div>
                <div className="px-4 py-8">
                    <WeatherMap />
                </div>
            </BaseLayout>
        </>
    );
}

// Build the same `global` (site header/footer + theme) the content pages get, so
// the route renders inside the normal site chrome. Additive — does not touch the
// catch-all router or its resolvers.
export function getStaticProps() {
    const allData = allContent();
    const pick = (modelName: string) => allData.find((o: any) => o.__metadata?.modelName === modelName) || null;
    const global = JSON.parse(JSON.stringify({ site: pick('Config'), theme: pick('ThemeStyle') }));
    return { props: { global, colors: 'colors-a' } };
}

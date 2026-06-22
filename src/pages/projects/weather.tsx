import Head from 'next/head';
import dynamic from 'next/dynamic';

import BaseLayout from '@/components/layouts/BaseLayout';
import { allContent } from '@/utils/content';

// Client-only: the map touches `window`/`document`, so disable SSR.
const WeatherMap = dynamic(() => import('@/components/projects/WeatherMap/WeatherMap'), { ssr: false });

export default function WeatherPage(props: any) {
    return (
        <>
            <Head>
                <title>Weather Map — Radar, Precip Type &amp; Alerts</title>
                <meta
                    name="description"
                    content="Live NOAA/NWS radar, precip type, and severe-weather alerts on an interactive MapLibre map."
                />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
            </Head>
            <BaseLayout {...props}>
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

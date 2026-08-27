import StandalonePageHead from '@/components/StandalonePageHead';

import BaseLayout from '@/components/layouts/BaseLayout';
import { allContent } from '@/utils/content';

// NYT Daily Digest lives in a separate repo (roblem28/nyt-digest) that builds a
// single self-contained index.html with Python and deploys to its own Netlify
// project. netlify.toml proxies that project to /projects/nyt/embed so it is
// served from this origin, matching how the FEC and spending dashboards embed
// their own static apps.
//
// The frame is a fixed height and the digest scrolls inside it. Growing the
// frame to fit instead was tried and rejected: the digest renders every article
// it has indexed, so fitting all 167 produced a 32,861px frame and a ~33,000px
// page, pushing the site footer far out of reach. Measuring the content to
// drive that height was also unreliable — see the PR discussion.
const EMBED_SRC = '/projects/nyt/embed';

export default function NytPage(props: any) {
    return (
        <>
            <StandalonePageHead
                title={'NYT Daily Digest — Article Index'}
                description={'An auto-updating index of New York Times articles with full-text search, section filters, and keyword tagging. Built with Python, SQLite FTS5, and Netlify.'}
                path="/projects/nyt/"
            />
            <BaseLayout {...props}>
                {/* Pinned to the digest's own --bg-body so the frame edge does
                    not show a seam or flash white before it paints. */}
                <div style={{ backgroundColor: '#0b0f19' }}>
                    <iframe
                        src={EMBED_SRC}
                        title="NYT Daily Digest — Article Index"
                        className="block w-full border-0"
                        style={{ height: '88vh', minHeight: '600px', colorScheme: 'dark' }}
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

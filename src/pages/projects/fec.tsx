import StandalonePageHead from '@/components/StandalonePageHead';

import BaseLayout from '@/components/layouts/BaseLayout';
import { allContent } from '@/utils/content';

// FEC Campaign Finance Explorer is a self-contained static app under
// /public/projects/fec, embedded full-bleed via an iframe (keeps its own CDN
// <script> tags + CSS sandboxed, same approach as the spending dashboard). Its
// only backend call goes to the in-repo API route /api/fec, which injects the
// server-side FEC_API_KEY.
export default function FecPage(props: any) {
    return (
        <>
            <StandalonePageHead
                title={'FEC Campaign Finance Explorer — OpenFEC'}
                description={'Explore FEC campaign-finance data: contributions, committees, candidates, independent expenditures, filings, and a contributor/federal-contract cross-reference.'}
                path="/projects/fec/"
            />
            <BaseLayout {...props}>
                {/* These pages were bare iframes: no heading, no byline, and
                    therefore zero headings in the document outline. */}
                <div className="max-w-7xl mx-auto px-4 pt-8 pb-2">
                    <h1 className="text-3xl sm:text-4xl">FEC Campaign Finance Explorer</h1>
                    <p className="mt-2 max-w-3xl sm:text-lg opacity-80">Contributions, committees, candidates, independent expenditures and filings from the OpenFEC API, with a contributor-to-federal-contract cross-reference.</p>
                </div>
                <iframe
                    src="/projects/fec/index.html"
                    title="FEC Campaign Finance Explorer"
                    className="block w-full border-0"
                    style={{ height: '88vh', minHeight: '600px' }}
                />
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

import StandalonePageHead from '@/components/StandalonePageHead';

import BaseLayout from '@/components/layouts/BaseLayout';
import { allContent } from '@/utils/content';

// App 2 is hosted as an isolated static copy under /public/projects/spending and
// embedded full-bleed via an iframe (keeps its own CDN <script> tags + CSS fully
// sandboxed). Its only backend call goes to the in-repo API route /api/usaspending.
export default function SpendingPage(props: any) {
    return (
        <>
            <StandalonePageHead
                title={'Federal Award Explorer — USAspending.gov'}
                description={'Explore federal contract awards by place of performance: a USAspending.gov choropleth plus a sortable, exportable award table.'}
                path="/projects/spending/"
            />
            <BaseLayout {...props}>
                {/* These pages were bare iframes: no heading, no byline, and
                    therefore zero headings in the document outline. */}
                <div className="max-w-7xl mx-auto px-4 pt-8 pb-2">
                    <h1 className="text-3xl sm:text-4xl">Federal Award Explorer</h1>
                    <p className="mt-2 max-w-3xl sm:text-lg opacity-80">Federal contract awards by place of performance: a USAspending.gov choropleth with a sortable, exportable award table.</p>
                </div>
                <iframe
                    src="/projects/spending/index.html"
                    title="Federal Award Explorer"
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

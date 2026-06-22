import Head from 'next/head';

import BaseLayout from '@/components/layouts/BaseLayout';
import { allContent } from '@/utils/content';

// App 2 is hosted as an isolated static copy under /public/projects/spending and
// embedded full-bleed via an iframe (keeps its own CDN <script> tags + CSS fully
// sandboxed). Its only backend call goes to the in-repo API route /api/usaspending.
export default function SpendingPage(props: any) {
    return (
        <>
            <Head>
                <title>Federal Award Explorer — USAspending.gov</title>
                <meta
                    name="description"
                    content="Explore federal contract awards by place of performance: a USAspending.gov choropleth + sortable, exportable award table."
                />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
            </Head>
            <BaseLayout {...props}>
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

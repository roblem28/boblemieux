import Head from 'next/head';

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
            <Head>
                <title>FEC Campaign Finance Explorer — OpenFEC</title>
                <meta
                    name="description"
                    content="Explore FEC campaign-finance data: contributions, committees, candidates, independent expenditures, filings, and a contributor↔federal-contract cross-reference."
                />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
            </Head>
            <BaseLayout {...props}>
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

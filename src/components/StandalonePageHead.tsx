import Head from 'next/head';

const SITE_NAME = 'Bob LeMieux';
const TITLE_SUFFIX = '| Bob LeMieux';

type StandalonePageHeadProps = {
    title: string;
    description: string;
    /** Site-absolute path including the trailing slash, e.g. "/projects/weather/". */
    path: string;
    /** Site-absolute image path; defaults to the site social image. */
    image?: string;
    /** Extra viewport directives, e.g. the map page's viewport-fit=cover. */
    viewport?: string;
};

/**
 * The four standalone pages under src/pages/projects are React pages rather than
 * markdown, so they never pass through seo-utils. They each hand-rolled a title
 * and description and nothing else: no title suffix, no og:*, no twitter:*, no
 * canonical. This emits the same tag set the content routes get.
 *
 * The absolute origin has to be resolved at build time, the same way
 * static-props-resolvers does it, because there is no site.env here.
 */
export default function StandalonePageHead({ title, description, path, image, viewport }: StandalonePageHeadProps) {
    const origin = (process.env.URL || process.env.DEPLOY_PRIME_URL || 'https://boblemieux.ai').replace(/\/$/, '');
    const fullTitle = `${title} ${TITLE_SUFFIX}`;
    const url = `${origin}${path}`;
    const ogImage = `${origin}${image ?? '/images/bob.jpg'}`;

    return (
        <Head>
            <title>{fullTitle}</title>
            <meta name="description" content={description} />
            <meta property="og:type" content="website" />
            <meta property="og:site_name" content={SITE_NAME} />
            <meta property="og:title" content={fullTitle} />
            <meta property="og:description" content={description} />
            <meta property="og:image" content={ogImage} />
            <meta property="og:url" content={url} />
            <meta name="twitter:card" content="summary_large_image" />
            <meta name="twitter:title" content={fullTitle} />
            <meta name="twitter:description" content={description} />
            <meta name="twitter:image" content={ogImage} />
            <link rel="canonical" href={url} />
            <meta name="viewport" content={viewport ?? 'width=device-width, initial-scale=1'} />
        </Head>
    );
}

import Head from 'next/head';

import { DynamicComponent } from '@/components/components-registry';
import type { FeaturedProjectsSection, PageLayout, ProjectLayout } from '@/types';
import { PageComponentProps } from '@/types';
import { allContent } from '@/utils/content';
import { seoGenerateMetaDescription, seoGenerateMetaTags, seoGenerateTitle } from '@/utils/seo-utils';
import { resolveStaticProps } from '@/utils/static-props-resolvers';
import { getFeaturedProjects } from '@/lib/curvegen-db';

const Page: React.FC<PageComponentProps> = (props) => {
    const { global, ...page } = props;
    const { site } = global;
    const title = seoGenerateTitle(page, site);
    const metaTags = seoGenerateMetaTags(page, site);
    const metaDescription = seoGenerateMetaDescription(page, site);

    return (
        <>
            <Head>
                <title>{title}</title>
                {metaDescription && <meta name="description" content={metaDescription} />}
                {metaTags.map((metaTag) => {
                    if (metaTag.format === 'property') {
                        // OpenGraph meta tags (og:*) should be have the format <meta property="og:…" content="…">
                        return <meta key={metaTag.property} property={metaTag.property} content={metaTag.content} />;
                    }
                    return <meta key={metaTag.property} name={metaTag.property} content={metaTag.content} />;
                })}
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                {site.favicon && <link rel="icon" href={site.favicon} />}
            </Head>
            <DynamicComponent {...props} />
        </>
    );
};

export function getStaticPaths() {
    const allData = allContent();
    const paths = allData.map((obj) => obj.__metadata.urlPath).filter(Boolean);
    return { paths, fallback: false };
}

function mergeFeaturedProjects(
    sections: PageLayout['sections'] = [],
    curvegenProjects: ProjectLayout[]
): PageLayout['sections'] {
    if (!Array.isArray(sections) || curvegenProjects.length === 0) {
        return sections;
    }

    return sections.map((section) => {
        if (!section || section.type !== 'FeaturedProjectsSection') {
            return section;
        }

        const featuredSection = section as FeaturedProjectsSection & { projects?: ProjectLayout[] };
        const existingProjects = Array.isArray(featuredSection.projects) ? featuredSection.projects : [];

        const seen = new Set<string>();
        const merged: ProjectLayout[] = [];
        const fingerprint = (project: ProjectLayout) =>
            project.__metadata?.urlPath || project.__metadata?.id || project.title;

        curvegenProjects.forEach((project) => {
            const key = fingerprint(project);
            if (!seen.has(key)) {
                merged.push(project);
                seen.add(key);
            }
        });

        existingProjects.forEach((project) => {
            const key = fingerprint(project);
            if (!seen.has(key)) {
                merged.push(project);
                seen.add(key);
            }
        });

        return {
            ...featuredSection,
            projects: merged
        };
    });
}

export async function getStaticProps({ params }) {
    const allData = allContent();
    const urlPath = '/' + (params.slug || []).join('/');
    const props = resolveStaticProps(urlPath, allData);

    if (urlPath === '/' && (props as PageLayout)?.__metadata?.modelName === 'PageLayout') {
        const curvegenProjects = await getFeaturedProjects();
        if (curvegenProjects.length > 0) {
            const homePage = props as PageLayout;
            homePage.sections = mergeFeaturedProjects(homePage.sections, curvegenProjects);
        }
    }

    return { props };
}

export default Page;

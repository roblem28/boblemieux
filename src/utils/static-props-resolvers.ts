import { ConfigModel } from '.stackbit/models/Config';
import { ThemeStyleModel } from '.stackbit/models/ThemeStyle';
import {
    Config,
    ContentObject,
    ContentObjectType,
    GlobalProps,
    PageComponentProps,
    PostFeedLayout,
    PostLayout,
    ProjectFeedLayout,
    ProjectLayout,
    RecentPostsSection,
    RecentProjectsSection,
    ThemeStyle
} from '@/types';
import { deepMapObject } from './data-utils';

export function resolveStaticProps(urlPath: string, allData: ContentObject[]): PageComponentProps {
    const originalPage = allData.find((obj) => obj.__metadata.urlPath === urlPath);
    const site = allData.find((obj) => obj.__metadata.modelName === ConfigModel.name) as Config;

    // seo-utils reads site.env.URL to turn relative og:image paths into absolute
    // ones, but nothing ever populated it, so every og:image shipped as "/images/…"
    // and no scraper could resolve it. Netlify sets URL (production) and
    // DEPLOY_PRIME_URL (branch/preview deploys); the literal is the local fallback.
    const globalProps: GlobalProps = {
        // Config is generated from the Stackbit model and has no `env` field, so
        // the widened object is cast back through unknown deliberately.
        site: {
            ...site,
            env: {
                ...(site as any)?.env,
                URL: (process.env.URL || process.env.DEPLOY_PRIME_URL || 'https://boblemieux.ai').replace(/\/$/, '')
            }
        } as unknown as Config,
        theme: allData.find((obj) => obj.__metadata.modelName === ThemeStyleModel.name) as ThemeStyle
    };

    function enrichContent(value: any) {
        const type = value?.__metadata?.modelName;
        if (type && PropsResolvers[type]) {
            const resolver = PropsResolvers[type];
            // Project pools need to know which branch of the site they are being
            // rendered on, so the containing page's urlPath is passed through.
            return resolver(value, allData, urlPath);
        } else {
            return value;
        }
    }

    const enrichedPage = deepMapObject(originalPage, enrichContent) as ContentObject;
    return {
        ...enrichedPage,
        global: globalProps
    };
}

type ResolverFunction = (props: ContentObject, allData: ContentObject[], pageUrlPath?: string) => ContentObject;

const PropsResolvers: Partial<Record<ContentObjectType, ResolverFunction>> = {
    PostFeedLayout: (props, allData) => {
        const allPosts = getAllPostsSorted(allData);
        return {
            ...(props as PostFeedLayout),
            items: allPosts
        };
    },
    RecentPostsSection: (props, allData) => {
        const recentPosts = getAllPostsSorted(allData).slice(0, (props as RecentPostsSection).recentCount || 3);
        return {
            ...props,
            posts: recentPosts
        };
    },
    ProjectLayout: (props, allData) => {
        // Scope to the branch this document itself lives in, so /work/* pages
        // through /work/* and /projects/* through /projects/*.
        const allProjects = getAllProjectsSorted(allData, sectionPrefixFor(props.__metadata?.urlPath));
        const currentProjectId = props.__metadata?.id;
        const currentProjectIndex = allProjects.findIndex((project) => project.__metadata?.id === currentProjectId);
        const nextProject = currentProjectIndex > 0 ? allProjects[currentProjectIndex - 1] : null;
        const prevProject = currentProjectIndex < allProjects.length - 1 ? allProjects[currentProjectIndex + 1] : null;
        return {
            ...props,
            prevProject,
            nextProject
        };
    },
    ProjectFeedLayout: (props, allData, pageUrlPath) => {
        const allProjects = getAllProjectsSorted(allData, sectionPrefixFor(pageUrlPath));
        return {
            ...(props as ProjectFeedLayout),
            items: allProjects
        };
    },
    RecentProjectsSection: (props, allData, pageUrlPath) => {
        const recentProjects = getAllProjectsSorted(allData, sectionPrefixFor(pageUrlPath)).slice(
            0,
            (props as RecentProjectsSection).recentCount || 3
        );
        return {
            ...props,
            projects: recentProjects
        };
    }
};

function getAllPostsSorted(objects: ContentObject[]) {
    const all = objects.filter((object) => object.__metadata?.modelName === 'PostLayout') as PostLayout[];
    const sorted = all.sort((postA, postB) => new Date(postB.date).getTime() - new Date(postA.date).getTime());
    return sorted;
}

// Both the work case studies and the tech projects are authored as ProjectLayout
// documents, so filtering on modelName alone returned all 13 as one pool. That
// put BP Whiting and CPChem into grids headed "Tech Projects", and let the
// prev/next nav page straight out of /projects into /work. The two branches are
// distinguished by where the document lives, not by its model.
const WORK_PREFIX = '/work/';
const PROJECTS_PREFIX = '/projects/';

function sectionPrefixFor(urlPath?: string) {
    return urlPath?.startsWith(WORK_PREFIX) || urlPath === '/work' ? WORK_PREFIX : PROJECTS_PREFIX;
}

function getAllProjectsSorted(objects: ContentObject[], sectionPrefix?: string) {
    const all = objects.filter((object) => {
        if (object.__metadata?.modelName !== 'ProjectLayout') return false;
        if (!sectionPrefix) return true;
        return (object.__metadata?.urlPath ?? '').startsWith(sectionPrefix);
    }) as ProjectLayout[];
    const sorted = all.sort(
        (projectA, projectB) => new Date(projectB.date).getTime() - new Date(projectA.date).getTime()
    );
    return sorted;
}

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
    const globalProps: GlobalProps = {
        site: allData.find((obj) => obj.__metadata.modelName === ConfigModel.name) as Config,
        theme: allData.find((obj) => obj.__metadata.modelName === ThemeStyleModel.name) as ThemeStyle
    };

    function enrichContent(value: any) {
        const type = value?.__metadata?.modelName;
        if (type && PropsResolvers[type]) {
            const resolver = PropsResolvers[type];
            return resolver(value, allData);
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

type ResolverFunction = (props: ContentObject, allData: ContentObject[]) => ContentObject;

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
        const allProjects = getAllProjectsSorted(allData);
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
    ProjectFeedLayout: (props, allData) => {
        const allProjects = getAllProjectsSorted(allData);
        return {
            ...(props as ProjectFeedLayout),
            items: allProjects
        };
    },
    RecentProjectsSection: (props, allData) => {
        const recentProjects = getAllProjectsSorted(allData).slice(
            0,
            (props as RecentProjectsSection).recentCount || 3
        );
        return {
            ...props,
            projects: recentProjects
        };
    }
};

const postsCache = new WeakMap<ContentObject[], PostLayout[]>();
function getAllPostsSorted(objects: ContentObject[]) {
    if (postsCache.has(objects)) {
        return postsCache.get(objects)!;
    }
    const all = objects.filter((object) => object.__metadata?.modelName === 'PostLayout') as PostLayout[];
    const sorted = all
        .map((post) => ({ post, time: new Date(post.date).getTime() }))
        .sort((a, b) => b.time - a.time)
        .map((item) => item.post);
    postsCache.set(objects, sorted);
    return sorted;
}

const projectsCache = new WeakMap<ContentObject[], ProjectLayout[]>();
function getAllProjectsSorted(objects: ContentObject[]) {
    if (projectsCache.has(objects)) {
        return projectsCache.get(objects)!;
    }
    const all = objects.filter((object) => object.__metadata?.modelName === 'ProjectLayout') as ProjectLayout[];
    const sorted = all
        .map((project) => ({ project, time: new Date(project.date).getTime() }))
        .sort((a, b) => b.time - a.time)
        .map((item) => item.project);
    projectsCache.set(objects, sorted);
    return sorted;
}

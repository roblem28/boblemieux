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

const dataByModelCache = new WeakMap<ContentObject[], Record<string, ContentObject[]>>();

function getDataByModelName(allData: ContentObject[]): Record<string, ContentObject[]> {
    let dataByModelName = dataByModelCache.get(allData);
    if (!dataByModelName) {
        dataByModelName = allData.reduce((acc, obj) => {
            const modelName = obj.__metadata?.modelName;
            if (modelName) {
                acc[modelName] = acc[modelName] || [];
                acc[modelName].push(obj);
            }
            return acc;
        }, {});
        dataByModelCache.set(allData, dataByModelName);
    }
    return dataByModelName;
}

export function resolveStaticProps(urlPath: string, allData: ContentObject[]): PageComponentProps {
    const dataByModel = getDataByModelName(allData);
    const originalPage = allData.find((obj) => obj.__metadata.urlPath === urlPath);
    const globalProps: GlobalProps = {
        site: dataByModel[ConfigModel.name]?.[0] as Config,
        theme: dataByModel[ThemeStyleModel.name]?.[0] as ThemeStyle
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

const sortedPostsCache = new WeakMap<ContentObject[], PostLayout[]>();
function getAllPostsSorted(allData: ContentObject[]) {
    let sortedPosts = sortedPostsCache.get(allData);
    if (!sortedPosts) {
        const dataByModel = getDataByModelName(allData);
        const allPosts = (dataByModel['PostLayout'] || []) as PostLayout[];
        sortedPosts = allPosts.sort((postA, postB) => new Date(postB.date).getTime() - new Date(postA.date).getTime());
        sortedPostsCache.set(allData, sortedPosts);
    }
    return sortedPosts;
}

const sortedProjectsCache = new WeakMap<ContentObject[], ProjectLayout[]>();
function getAllProjectsSorted(allData: ContentObject[]) {
    let sortedProjects = sortedProjectsCache.get(allData);
    if (!sortedProjects) {
        const dataByModel = getDataByModelName(allData);
        const allProjects = (dataByModel['ProjectLayout'] || []) as ProjectLayout[];
        sortedProjects = allProjects.sort(
            (projectA, projectB) => new Date(projectB.date).getTime() - new Date(projectA.date).getTime()
        );
        sortedProjectsCache.set(allData, sortedProjects);
    }
    return sortedProjects;
}

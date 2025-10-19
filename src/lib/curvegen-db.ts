import type { ProjectLayout } from '@/types';

type CurvegenProjectRow = {
    slug: string | null;
    title: string;
    description: string | null;
    date: string | Date | null;
    href: string | null;
    featured_image_url: string | null;
};

const connectionString = process.env.CURVEGEN_DATABASE_URL || process.env.CURVEGEN_DB_URL || '';

let poolPromise: Promise<any> | null = null;

async function getPool() {
    if (!connectionString) {
        throw new Error('CURVEGEN_DATABASE_URL is not configured.');
    }

    if (!poolPromise) {
        poolPromise = import('pg').then((pgModule: any) => {
            const { Pool } = pgModule;
            return new Pool({
                connectionString,
                ssl:
                    connectionString.includes('neon.tech') || connectionString.includes('aws.neon')
                        ? (process.env.CURVEGEN_ALLOW_INSECURE_DB_SSL === 'true'
                            ? { rejectUnauthorized: false }
                            : true)
                        : undefined
            });
        });
    }

    return poolPromise;
}

function normalizeDate(date: CurvegenProjectRow['date']): string {
    if (!date) {
        return new Date().toISOString();
    }

    return typeof date === 'string' ? date : date.toISOString();
}

function mapRowToProject(row: CurvegenProjectRow): ProjectLayout {
    const trimmedHref = row.href?.trim();
    const urlPath = trimmedHref || (row.slug ? `/projects/${row.slug}` : undefined);
    return {
        type: 'ProjectLayout',
        title: row.title,
        date: normalizeDate(row.date),
        description: row.description ?? undefined,
        featuredImage: row.featured_image_url
            ? {
                  type: 'ImageBlock',
                  url: row.featured_image_url,
                  altText: `${row.title} featured image`
              }
            : undefined,
        markdownContent: '',
        __metadata: {
            id: `curvegen-project:${row.slug ?? row.href ?? row.title}`,
            modelName: 'ProjectLayout',
            urlPath
        }
    } as ProjectLayout;
}

function dedupeProjects(projects: ProjectLayout[]) {
    const seen = new Set<string>();
    return projects.filter((project) => {
        const key = project.__metadata?.urlPath || project.__metadata?.id || project.title;
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
}

export async function getFeaturedProjects(): Promise<ProjectLayout[]> {
    if (!connectionString) {
        return [];
    }

    try {
        const pool = await getPool();
        const result = await pool.query<CurvegenProjectRow>(
            'select slug, title, description, date, href, featured_image_url from projects order by date desc nulls last'
        );
        const projects = result.rows.map(mapRowToProject);
        return dedupeProjects(projects);
    } catch (error) {
        console.warn('Unable to load Curvegen projects from database:', error);
        return [];
    }
}

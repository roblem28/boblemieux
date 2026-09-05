type ContentObject = any;

// Current implementations
function getAllPostsSortedOriginal(objects: ContentObject[]) {
    const all = objects.filter((object) => object.__metadata?.modelName === 'PostLayout');
    const sorted = all.sort((postA, postB) => new Date(postB.date).getTime() - new Date(postA.date).getTime());
    return sorted;
}

function getAllProjectsSortedOriginal(objects: ContentObject[]) {
    const all = objects.filter((object) => object.__metadata?.modelName === 'ProjectLayout');
    const sorted = all.sort(
        (projectA, projectB) => new Date(projectB.date).getTime() - new Date(projectA.date).getTime()
    );
    return sorted;
}

// Optimized implementations
const postsCache = new WeakMap<ContentObject[], ContentObject[]>();
const projectsCache = new WeakMap<ContentObject[], ContentObject[]>();

function getAllPostsSortedOptimized(objects: ContentObject[]) {
    if (postsCache.has(objects)) {
        return postsCache.get(objects)!;
    }
    const all = objects.filter((object) => object.__metadata?.modelName === 'PostLayout');

    // Schwartzian transform
    const sorted = all
        .map(post => ({ post, time: new Date(post.date).getTime() }))
        .sort((a, b) => b.time - a.time)
        .map(item => item.post);

    postsCache.set(objects, sorted);
    return sorted;
}

function getAllProjectsSortedOptimized(objects: ContentObject[]) {
    if (projectsCache.has(objects)) {
        return projectsCache.get(objects)!;
    }
    const all = objects.filter((object) => object.__metadata?.modelName === 'ProjectLayout');

    const sorted = all
        .map(project => ({ project, time: new Date(project.date).getTime() }))
        .sort((a, b) => b.time - a.time)
        .map(item => item.project);

    projectsCache.set(objects, sorted);
    return sorted;
}

// Setup test data
const testObjects: ContentObject[] = [];
for (let i = 0; i < 2000; i++) {
    testObjects.push({
        __metadata: { modelName: 'PostLayout' },
        date: new Date(Date.now() - Math.random() * 10000000000).toISOString()
    });
    testObjects.push({
        __metadata: { modelName: 'ProjectLayout' },
        date: new Date(Date.now() - Math.random() * 10000000000).toISOString()
    });
    testObjects.push({
        __metadata: { modelName: 'Other' },
        date: new Date().toISOString()
    });
}

// Warmup
getAllPostsSortedOriginal(testObjects);
getAllPostsSortedOptimized(testObjects);

const ITERATIONS = 1000;

console.log('--- Original ---');
const startOriginal = performance.now();
for (let i = 0; i < ITERATIONS; i++) {
    getAllPostsSortedOriginal(testObjects);
    getAllProjectsSortedOriginal(testObjects);
}
const endOriginal = performance.now();
console.log(`Time taken: ${(endOriginal - startOriginal).toFixed(2)}ms`);

console.log('--- Optimized ---');
const startOptimized = performance.now();
for (let i = 0; i < ITERATIONS; i++) {
    getAllPostsSortedOptimized(testObjects);
    getAllProjectsSortedOptimized(testObjects);
}
const endOptimized = performance.now();
console.log(`Time taken: ${(endOptimized - startOptimized).toFixed(2)}ms`);

console.log(`Improvement: ${((endOriginal - startOriginal) / (endOptimized - startOptimized)).toFixed(2)}x faster`);

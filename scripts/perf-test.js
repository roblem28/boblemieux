const { performance } = require('perf_hooks');

function generateData(count) {
    const data = [];
    for (let i = 0; i < count; i++) {
        data.push({
            __metadata: {
                modelName: `Model_${i % 20}`,
                id: `id_${i}`
            },
            date: new Date(Date.now() - Math.floor(Math.random() * 1000000000)).toISOString()
        });
    }
    // Add specific models we look for
    data.push({ __metadata: { modelName: 'Config' }, siteName: 'My Site' });
    data.push({ __metadata: { modelName: 'ThemeStyle' }, primaryColor: 'red' });
    return data;
}

const ITERATIONS = 10000;
const DATA_SIZE = 1000;
const data = generateData(DATA_SIZE);

console.log(`Running benchmark with ${DATA_SIZE} items and ${ITERATIONS} iterations...\n`);

// Baseline: .find()
function baselineFind(allData) {
    const site = allData.find((obj) => obj.__metadata.modelName === 'Config');
    const theme = allData.find((obj) => obj.__metadata.modelName === 'ThemeStyle');
    return { site, theme };
}

const startFind = performance.now();
for (let i = 0; i < ITERATIONS; i++) {
    baselineFind(data);
}
const endFind = performance.now();
const findTime = endFind - startFind;
console.log(`Baseline .find(): ${findTime.toFixed(2)}ms`);

// Optimized: Map lookup
function createIndex(allData) {
    const index = {};
    for (const obj of allData) {
        const modelName = obj.__metadata?.modelName;
        if (modelName) {
            if (!index[modelName]) index[modelName] = [];
            index[modelName].push(obj);
        }
    }
    return index;
}

const startOptimized = performance.now();
// In real use, index is created once per allData reference
const index = createIndex(data);
for (let i = 0; i < ITERATIONS; i++) {
    const site = index['Config']?.[0];
    const theme = index['ThemeStyle']?.[0];
}
const endOptimized = performance.now();
const optimizedTime = endOptimized - startOptimized;
console.log(`Optimized Map lookup: ${optimizedTime.toFixed(2)}ms`);

console.log(`\nImprovement: ${((findTime - optimizedTime) / findTime * 100).toFixed(2)}%`);

// Benchmark sorting
console.log('\n--- Sorting Benchmark ---');

function baselineSort(allData) {
    const all = allData.filter((object) => object.__metadata?.modelName === 'Model_1');
    return all.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

const startSort = performance.now();
for (let i = 0; i < 1000; i++) {
    baselineSort(data);
}
const endSort = performance.now();
const sortTime = endSort - startSort;
console.log(`Baseline .filter().sort(): ${sortTime.toFixed(2)}ms`);

// Memoized Sort
const sortCache = new Map();
function memoizedSort(allData, modelName) {
    if (sortCache.has(modelName)) return sortCache.get(modelName);
    const all = allData.filter((object) => object.__metadata?.modelName === modelName);
    const result = all.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    sortCache.set(modelName, result);
    return result;
}

const startMemoSort = performance.now();
for (let i = 0; i < 1000; i++) {
    memoizedSort(data, 'Model_1');
}
const endMemoSort = performance.now();
const memoSortTime = endMemoSort - startMemoSort;
console.log(`Memoized Sort: ${memoSortTime.toFixed(2)}ms`);
console.log(`Improvement: ${((sortTime - memoSortTime) / sortTime * 100).toFixed(2)}%`);

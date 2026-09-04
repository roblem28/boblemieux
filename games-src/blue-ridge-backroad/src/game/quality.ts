export type QualityName = 'high' | 'balanced' | 'mobile';

export interface QualityPreset {
    name: QualityName;
    label: string;
    pixelRatioCap: number;
    shadows: boolean;
    shadowMapSize: number;
    shadowDistance: number;
    chunksAhead: number;
    chunksBehind: number;
    fogFar: number;
    drawDistance: number;
    vegetationDensity: number;
    lodDistance: number;
    dustParticles: number;
    gravelParticles: number;
    bloom: boolean;
    anisotropy: number;
    textureSize: number;
    terrainCols: number;
    mountainLayers: number;
}

export const PRESETS: Record<QualityName, QualityPreset> = {
    high: {
        name: 'high',
        label: 'High',
        pixelRatioCap: 2,
        shadows: true,
        shadowMapSize: 2048,
        shadowDistance: 120,
        chunksAhead: 10,
        chunksBehind: 2,
        fogFar: 900,
        drawDistance: 1400,
        vegetationDensity: 1,
        lodDistance: 140,
        dustParticles: 220,
        gravelParticles: 120,
        bloom: true,
        anisotropy: 8,
        textureSize: 1024,
        terrainCols: 30,
        mountainLayers: 3
    },
    balanced: {
        name: 'balanced',
        label: 'Balanced',
        pixelRatioCap: 1.5,
        shadows: true,
        shadowMapSize: 1024,
        shadowDistance: 80,
        chunksAhead: 8,
        chunksBehind: 2,
        fogFar: 700,
        drawDistance: 1100,
        vegetationDensity: 0.62,
        lodDistance: 100,
        dustParticles: 140,
        gravelParticles: 70,
        bloom: false,
        anisotropy: 4,
        textureSize: 512,
        terrainCols: 22,
        mountainLayers: 3
    },
    mobile: {
        name: 'mobile',
        label: 'Mobile / Quest',
        pixelRatioCap: 1,
        shadows: true,
        shadowMapSize: 512,
        shadowDistance: 45,
        chunksAhead: 6,
        chunksBehind: 2,
        fogFar: 480,
        drawDistance: 900,
        vegetationDensity: 0.34,
        lodDistance: 70,
        dustParticles: 70,
        gravelParticles: 36,
        bloom: false,
        anisotropy: 1,
        textureSize: 256,
        terrainCols: 16,
        mountainLayers: 2
    }
};

const STORE_KEY = 'brb.quality';

const readRendererString = (): string => {
    try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
        if (!gl) return '';
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        if (!ext) return '';
        return String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) ?? '');
    } catch {
        return '';
    }
};

export const detectQuality = (): QualityName => {
    const ua = navigator.userAgent;
    const isQuest = /Quest|OculusBrowser/i.test(ua);
    const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
    // iPadOS 13+ reports as a Mac; touch points give it away.
    const isTabletMac =
        /Macintosh/.test(ua) && typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1;

    if (isQuest || isMobile || isTabletMac) return 'mobile';

    const cores = navigator.hardwareConcurrency ?? 4;
    const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
    const renderer = readRendererString();
    const weakGpu = /(Intel|UHD|HD Graphics|Iris|Mali|Adreno|PowerVR|SwiftShader|llvmpipe)/i.test(renderer);

    let score = 0;
    score += cores >= 12 ? 2 : cores >= 8 ? 1 : cores >= 4 ? 0 : -1;
    score += mem >= 8 ? 1 : mem >= 4 ? 0 : -1;
    score += weakGpu ? -2 : 1;

    if (score >= 2) return 'high';
    if (score >= 0) return 'balanced';
    return 'mobile';
};

export const loadQualityOverride = (): QualityName | null => {
    try {
        const v = localStorage.getItem(STORE_KEY);
        if (v === 'high' || v === 'balanced' || v === 'mobile') return v;
    } catch {
        /* private mode */
    }
    return null;
};

export const saveQualityOverride = (name: QualityName | null): void => {
    try {
        if (name === null) localStorage.removeItem(STORE_KEY);
        else localStorage.setItem(STORE_KEY, name);
    } catch {
        /* private mode */
    }
};

export const initialQuality = (): QualityName => loadQualityOverride() ?? detectQuality();

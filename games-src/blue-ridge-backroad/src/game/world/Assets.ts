import {
    Color,
    DoubleSide,
    FrontSide,
    Material,
    MeshStandardMaterial,
    Texture,
    Vector2
} from 'three';
import type { QualityPreset } from '../quality';
import {
    makeBark,
    makeDirt,
    makeGrass,
    makeGravel,
    makeLeafSheet,
    makeRock,
    makeSoftSprite,
    makeWood,
    type SurfaceMaps
} from '../util/textures';

/**
 * Every shared texture and material, built once per quality preset. Materials
 * are reused across thousands of objects so the renderer can batch, and
 * everything is disposed together when the preset changes or the game unmounts.
 */
export class Assets {
    readonly gravel: SurfaceMaps;
    readonly grass: SurfaceMaps;
    readonly dirt: SurfaceMaps;
    readonly rock: SurfaceMaps;
    readonly bark: SurfaceMaps;
    readonly wood: SurfaceMaps;

    readonly leafBroad: Texture;
    readonly leafNeedle: Texture;
    readonly leafScrub: Texture;
    readonly softSprite: Texture;
    readonly glareSprite: Texture;

    readonly roadMat: MeshStandardMaterial;
    readonly terrainMat: MeshStandardMaterial;
    readonly rockMat: MeshStandardMaterial;
    readonly barkMat: MeshStandardMaterial;
    readonly woodMat: MeshStandardMaterial;
    readonly leafBroadMat: MeshStandardMaterial;
    readonly leafNeedleMat: MeshStandardMaterial;
    readonly leafScrubMat: MeshStandardMaterial;
    readonly metalMat: MeshStandardMaterial;
    readonly rustMat: MeshStandardMaterial;
    readonly waterMat: MeshStandardMaterial;

    private readonly owned: (Texture | Material)[] = [];

    constructor(preset: QualityPreset) {
        const size = preset.textureSize;
        const aniso = preset.anisotropy;
        const small = Math.max(128, size >> 1);

        this.gravel = makeGravel(size, aniso);
        this.grass = makeGrass(size, aniso);
        this.dirt = makeDirt(small, aniso);
        this.rock = makeRock(small, aniso);
        this.bark = makeBark(small, aniso);
        this.wood = makeWood(small, aniso);

        this.leafBroad = makeLeafSheet(small, aniso, [0.26, 0.4, 0.15]);
        this.leafNeedle = makeLeafSheet(small, aniso, [0.15, 0.27, 0.16]);
        this.leafScrub = makeLeafSheet(Math.max(128, small >> 1), aniso, [0.3, 0.42, 0.18]);
        this.softSprite = makeSoftSprite(128, 2.4);
        this.glareSprite = makeSoftSprite(128, 1.3);

        for (const s of [this.gravel, this.grass, this.dirt, this.rock, this.bark, this.wood]) {
            this.owned.push(s.map, s.normalMap, s.roughnessMap);
        }
        this.owned.push(
            this.leafBroad,
            this.leafNeedle,
            this.leafScrub,
            this.softSprite,
            this.glareSprite
        );

        const repeat = (s: SurfaceMaps, x: number, y: number): void => {
            s.map.repeat.set(x, y);
            s.normalMap.repeat.set(x, y);
            s.roughnessMap.repeat.set(x, y);
        };
        // UVs are handed to these materials already in metres, so a repeat of 1
        // means "one texture tile per metre of UV".
        repeat(this.gravel, 1, 1);
        // Bigger grass tiles: a 1 m repeat on open hillside reads as a grid.
        repeat(this.grass, 0.45, 0.45);

        this.roadMat = new MeshStandardMaterial({
            map: this.gravel.map,
            normalMap: this.gravel.normalMap,
            roughnessMap: this.gravel.roughnessMap,
            normalScale: new Vector2(1.1, 1.1),
            roughness: 1,
            metalness: 0,
            vertexColors: true,
            dithering: true
        });

        this.terrainMat = new MeshStandardMaterial({
            map: this.grass.map,
            normalMap: this.grass.normalMap,
            roughnessMap: this.grass.roughnessMap,
            normalScale: new Vector2(0.8, 0.8),
            roughness: 1,
            metalness: 0,
            vertexColors: true,
            dithering: true
        });

        this.rockMat = new MeshStandardMaterial({
            map: this.rock.map,
            normalMap: this.rock.normalMap,
            roughnessMap: this.rock.roughnessMap,
            roughness: 1,
            metalness: 0,
            color: new Color(0.62, 0.6, 0.57)
        });

        this.barkMat = new MeshStandardMaterial({
            map: this.bark.map,
            normalMap: this.bark.normalMap,
            roughnessMap: this.bark.roughnessMap,
            roughness: 1,
            metalness: 0
        });

        this.woodMat = new MeshStandardMaterial({
            map: this.wood.map,
            normalMap: this.wood.normalMap,
            roughnessMap: this.wood.roughnessMap,
            roughness: 0.95,
            metalness: 0
        });

        const leaf = (map: Texture): MeshStandardMaterial =>
            new MeshStandardMaterial({
                map,
                alphaTest: 0.5,
                transparent: false,
                side: DoubleSide,
                roughness: 0.92,
                metalness: 0
            });
        this.leafBroadMat = leaf(this.leafBroad);
        this.leafNeedleMat = leaf(this.leafNeedle);
        this.leafScrubMat = leaf(this.leafScrub);

        this.metalMat = new MeshStandardMaterial({
            color: new Color(0.52, 0.54, 0.56),
            roughness: 0.55,
            metalness: 0.85
        });

        this.rustMat = new MeshStandardMaterial({
            map: this.dirt.map,
            normalMap: this.dirt.normalMap,
            color: new Color(0.55, 0.34, 0.24),
            roughness: 0.95,
            metalness: 0.2
        });

        this.waterMat = new MeshStandardMaterial({
            color: new Color(0.14, 0.2, 0.21),
            roughness: 0.08,
            metalness: 0.1,
            transparent: true,
            opacity: 0.82,
            side: FrontSide
        });

        this.owned.push(
            this.roadMat,
            this.terrainMat,
            this.rockMat,
            this.barkMat,
            this.woodMat,
            this.leafBroadMat,
            this.leafNeedleMat,
            this.leafScrubMat,
            this.metalMat,
            this.rustMat,
            this.waterMat
        );
    }

    dispose(): void {
        for (const item of this.owned) item.dispose();
        this.owned.length = 0;
    }
}

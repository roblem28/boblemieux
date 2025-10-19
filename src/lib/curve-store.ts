import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';

type CurveRecord = {
    id: string;
    name: string;
    expression: string;
    description: string;
    createdAt: string;
    updatedAt: string;
};

type CurveInput = {
    name: string;
    expression: string;
    description?: string;
};

const DATABASE_DIRECTORY = path.join(process.cwd(), 'data');
const DATABASE_PATH = path.join(DATABASE_DIRECTORY, 'curves.json');
const EMPTY_DATABASE = JSON.stringify({ curves: [] }, null, 2);

async function ensureDatabase() {
    try {
        await fs.access(DATABASE_PATH);
    } catch (error) {
        await fs.mkdir(DATABASE_DIRECTORY, { recursive: true });
        await fs.writeFile(DATABASE_PATH, EMPTY_DATABASE, 'utf8');
    }
}

async function readDatabase(): Promise<{ curves: CurveRecord[] }> {
    await ensureDatabase();
    const file = await fs.readFile(DATABASE_PATH, 'utf8');
    try {
        const data = JSON.parse(file) as { curves?: CurveRecord[] };
        return { curves: data.curves ?? [] };
    } catch (error) {
        throw new Error('Curve database is corrupted.');
    }
}

async function writeDatabase(curves: CurveRecord[]) {
    await fs.writeFile(DATABASE_PATH, JSON.stringify({ curves }, null, 2), 'utf8');
}

export async function listCurves() {
    const { curves } = await readDatabase();
    return curves.sort((left, right) => (left.createdAt > right.createdAt ? -1 : 1));
}

export async function createCurve(input: CurveInput) {
    const { curves } = await readDatabase();
    const now = new Date().toISOString();
    const record: CurveRecord = {
        id: randomUUID(),
        name: input.name.trim(),
        expression: input.expression.trim(),
        description: input.description?.trim() ?? '',
        createdAt: now,
        updatedAt: now
    };
    curves.push(record);
    await writeDatabase(curves);
    return record;
}

export async function deleteCurve(id: string) {
    const { curves } = await readDatabase();
    const next = curves.filter((curve) => curve.id !== id);
    if (next.length === curves.length) {
        return false;
    }
    await writeDatabase(next);
    return true;
}

export async function getCurve(id: string) {
    const { curves } = await readDatabase();
    return curves.find((curve) => curve.id === id) ?? null;
}

export type { CurveRecord, CurveInput };

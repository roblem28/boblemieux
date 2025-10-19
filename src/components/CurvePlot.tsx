import { useMemo } from 'react';
import { compileExpression, validateExpression } from '@/utils/expression';

type CurvePlotProps = {
    expression: string;
    title: string;
    xMin?: number;
    xMax?: number;
    sampleCount?: number;
};

const WIDTH = 640;
const HEIGHT = 360;
const DEFAULT_SAMPLE_COUNT = 400;

function toPoints(expression: string, xMin: number, xMax: number, sampleCount: number) {
    const validationError = validateExpression(expression);
    if (validationError) {
        return { error: validationError } as const;
    }

    const compiled = compileExpression(expression);
    const step = (xMax - xMin) / (sampleCount - 1);
    const points: { x: number; y: number }[] = [];

    for (let index = 0; index < sampleCount; index += 1) {
        const x = xMin + step * index;
        let y: number;
        try {
            y = compiled.evaluate(x);
        } catch (error) {
            return { error: error instanceof Error ? error.message : 'Unable to evaluate expression.' } as const;
        }
        if (Number.isFinite(y)) {
            points.push({ x, y });
        }
    }

    if (points.length === 0) {
        return { error: 'Expression does not produce any finite results in the selected range.' } as const;
    }

    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const point of points) {
        if (point.y < minY) {
            minY = point.y;
        }
        if (point.y > maxY) {
            maxY = point.y;
        }
    }

    if (!Number.isFinite(minY) || !Number.isFinite(maxY)) {
        return { error: 'Expression generates values that are outside of the renderable range.' } as const;
    }

    if (minY === maxY) {
        const offset = Math.max(Math.abs(minY), 1);
        minY -= offset;
        maxY += offset;
    }

    return { points, minY, maxY } as const;
}

export default function CurvePlot({
    expression,
    title,
    xMin = -10,
    xMax = 10,
    sampleCount = DEFAULT_SAMPLE_COUNT
}: CurvePlotProps) {
    const result = useMemo(() => toPoints(expression, xMin, xMax, sampleCount), [expression, xMin, xMax, sampleCount]);

    if ('error' in result) {
        return (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-sm text-red-200">
                {result.error}
            </div>
        );
    }

    const { points, minY, maxY } = result;

    const xRange = xMax - xMin;
    const yRange = maxY - minY;

    const polylinePoints = points
        .map((point) => {
            const xPosition = ((point.x - xMin) / xRange) * WIDTH;
            const yPosition = HEIGHT - ((point.y - minY) / yRange) * HEIGHT;
            return `${xPosition.toFixed(2)},${yPosition.toFixed(2)}`;
        })
        .join(' ');

    const xTicks = 10;
    const yTicks = 6;

    const xLabels = Array.from({ length: xTicks + 1 }, (_, index) => xMin + (xRange / xTicks) * index);
    const yLabels = Array.from({ length: yTicks + 1 }, (_, index) => minY + (yRange / yTicks) * index);

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h3 className="text-lg font-semibold text-slate-100">{title}</h3>
                    <p className="text-sm text-slate-400">y = {expression}</p>
                </div>
                <div className="text-xs text-slate-500">
                    Sampling {sampleCount} points on [{xMin}, {xMax}]
                </div>
            </div>
            <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950/60">
                <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`Plot of ${expression}`} className="w-full">
                    <defs>
                        <pattern id="curvegen-grid" width="64" height="64" patternUnits="userSpaceOnUse">
                            <path d="M 64 0 L 0 0 0 64" fill="none" stroke="rgba(71, 85, 105, 0.3)" strokeWidth="1" />
                        </pattern>
                        <linearGradient id="curvegen-gradient" x1="0" x2="1" y1="0" y2="0">
                            <stop offset="0%" stopColor="#38bdf8" />
                            <stop offset="100%" stopColor="#a855f7" />
                        </linearGradient>
                    </defs>
                    <rect width="100%" height="100%" fill="url(#curvegen-grid)" />
                    <g>
                        {xLabels.map((value, index) => {
                            const xPosition = ((value - xMin) / xRange) * WIDTH;
                            const isAxis = Math.abs(value) < xRange / 200;
                            return (
                                <g key={`x-${index}`}>
                                    <line
                                        x1={xPosition}
                                        x2={xPosition}
                                        y1={0}
                                        y2={HEIGHT}
                                        stroke={isAxis ? 'rgba(148, 163, 184, 0.5)' : 'rgba(71, 85, 105, 0.3)'}
                                        strokeWidth={isAxis ? 2 : 1}
                                    />
                                    <text
                                        x={xPosition + 4}
                                        y={HEIGHT - 8}
                                        fontSize="12"
                                        fill="rgba(148, 163, 184, 0.9)"
                                    >
                                        {value.toFixed(1)}
                                    </text>
                                </g>
                            );
                        })}
                        {yLabels.map((value, index) => {
                            const yPosition = HEIGHT - ((value - minY) / yRange) * HEIGHT;
                            const isAxis = Math.abs(value) < yRange / 200;
                            return (
                                <g key={`y-${index}`}>
                                    <line
                                        x1={0}
                                        x2={WIDTH}
                                        y1={yPosition}
                                        y2={yPosition}
                                        stroke={isAxis ? 'rgba(148, 163, 184, 0.5)' : 'rgba(71, 85, 105, 0.3)'}
                                        strokeWidth={isAxis ? 2 : 1}
                                    />
                                    <text
                                        x={8}
                                        y={yPosition - 6}
                                        fontSize="12"
                                        fill="rgba(148, 163, 184, 0.9)"
                                    >
                                        {value.toFixed(1)}
                                    </text>
                                </g>
                            );
                        })}
                    </g>
                    <polyline
                        points={polylinePoints}
                        fill="none"
                        stroke="url(#curvegen-gradient)"
                        strokeWidth="3"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                    />
                </svg>
            </div>
        </div>
    );
}

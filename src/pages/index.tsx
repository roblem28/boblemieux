import Head from 'next/head';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import CurvePlot from '@/components/CurvePlot';

type Curve = {
    id: string;
    name: string;
    expression: string;
    description: string;
    createdAt: string;
};

type ApiListResponse = {
    status: 'success';
    data: Curve[];
};

type ApiCreateResponse = {
    status: 'success';
    data: Curve;
};

type ApiError = {
    status: 'error';
    message: string;
};

const FEATURE_CARDS = [
    {
        title: 'Generative precision',
        description:
            'Use familiar mathematical syntax to craft curves, layer transformations, and explore creative parameter sweeps.'
    },
    {
        title: 'Persistent library',
        description:
            'Every curve is stored in the project database so you can revisit experiments, remix ideas, or share them with collaborators.'
    },
    {
        title: 'Showcase ready',
        description:
            'Export compelling previews, embed plots in decks, and present interactive demos straight from the CurveGen dashboard.'
    }
];

export default function CurveGenHome() {
    const [curves, setCurves] = useState<Curve[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [formState, setFormState] = useState({
        name: '',
        expression: 'sin(x)',
        description: ''
    });
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [flash, setFlash] = useState<string | null>(null);

    const selectedCurve = useMemo(() => {
        if (!curves.length) {
            return null;
        }
        const match = curves.find((curve) => curve.id === selectedId);
        return match ?? curves[0];
    }, [curves, selectedId]);

    const loadCurves = useCallback(async () => {
        try {
            setLoading(true);
            const response = await fetch('/api/curves');
            const payload = (await response.json()) as ApiListResponse | ApiError;
            if (payload.status === 'error') {
                throw new Error(payload.message);
            }
            setCurves(payload.data);
            if (payload.data.length > 0 && !selectedId) {
                setSelectedId(payload.data[0].id);
            }
        } catch (fetchError) {
            setError(fetchError instanceof Error ? fetchError.message : 'Unable to load curves.');
        } finally {
            setLoading(false);
        }
    }, [selectedId]);

    useEffect(() => {
        loadCurves();
    }, [loadCurves]);

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setSubmitting(true);
        setError(null);
        setFlash(null);
        try {
            const response = await fetch('/api/curves', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formState)
            });
            const payload = (await response.json()) as ApiCreateResponse | ApiError;
            if (payload.status === 'error') {
                throw new Error(payload.message);
            }
            setCurves((previous) => [payload.data, ...previous]);
            setSelectedId(payload.data.id);
            setFormState({ name: '', expression: 'sin(x)', description: '' });
            setFlash('Curve saved successfully.');
        } catch (submitError) {
            setError(submitError instanceof Error ? submitError.message : 'Unable to save curve.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (curve: Curve) => {
        setError(null);
        setFlash(null);
        try {
            const response = await fetch(`/api/curves/${curve.id}`, { method: 'DELETE' });
            const payload = (await response.json()) as ApiError | { status: 'success'; message: string };
            if (payload.status === 'error') {
                throw new Error(payload.message);
            }
            setCurves((previous) => previous.filter((entry) => entry.id !== curve.id));
            if (selectedId === curve.id) {
                setSelectedId(null);
            }
            setFlash('Curve removed from the library.');
        } catch (deleteError) {
            setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete curve.');
        }
    };

    return (
        <>
            <Head>
                <title>CurveGen — Procedural Curve Generator</title>
                <meta
                    name="description"
                    content="Design, visualize, and store generative curves with a purpose-built workspace and persistent database."
                />
            </Head>
            <div className="min-h-screen bg-slate-950 text-slate-100">
                <header className="relative overflow-hidden border-b border-slate-900">
                    <div className="absolute inset-0 bg-gradient-to-br from-sky-500/20 via-fuchsia-500/10 to-transparent" />
                    <div className="relative mx-auto flex max-w-6xl flex-col gap-12 px-6 pb-24 pt-24 lg:flex-row lg:items-center">
                        <div className="flex-1">
                            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/60 px-4 py-1 text-xs uppercase tracking-widest text-slate-300">
                                <span className="h-2 w-2 rounded-full bg-emerald-400" /> Now featuring persistent storage
                            </div>
                            <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl lg:text-6xl">
                                CurveGen
                                <span className="block text-transparent bg-gradient-to-r from-sky-400 via-indigo-400 to-fuchsia-500 bg-clip-text">
                                    Procedural curve design without the friction.
                                </span>
                            </h1>
                            <p className="mt-6 max-w-xl text-lg text-slate-300">
                                Compose mathematical expressions, instantly preview their shape, and build a living repository of
                                reusable curves for creative coding, VJ sets, data stories, and beyond.
                            </p>
                            <div className="mt-10 flex flex-wrap gap-4">
                                <a
                                    href="#workspace"
                                    className="inline-flex items-center justify-center rounded-full bg-sky-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-400"
                                >
                                    Launch the workspace
                                </a>
                                <a
                                    href="#library"
                                    className="inline-flex items-center justify-center rounded-full border border-slate-800 px-6 py-3 text-sm font-semibold text-slate-200 transition hover:border-slate-600"
                                >
                                    Browse saved curves
                                </a>
                            </div>
                        </div>
                        <div className="flex-1">
                            {selectedCurve ? (
                                <div className="rounded-3xl border border-slate-900 bg-slate-900/50 p-6 shadow-xl shadow-sky-500/10 backdrop-blur">
                                    <CurvePlot
                                        expression={selectedCurve.expression}
                                        title={selectedCurve.name}
                                        sampleCount={360}
                                        xMin={-12}
                                        xMax={12}
                                    />
                                </div>
                            ) : (
                                <div className="rounded-3xl border border-dashed border-slate-800 bg-slate-900/40 p-12 text-center text-slate-500">
                                    Add a curve to start plotting.
                                </div>
                            )}
                        </div>
                    </div>
                </header>

                <main className="mx-auto flex max-w-6xl flex-col gap-24 px-6 py-24">
                    <section className="grid gap-6 lg:grid-cols-3" id="features">
                        {FEATURE_CARDS.map((feature) => (
                            <article
                                key={feature.title}
                                className="rounded-2xl border border-slate-900 bg-slate-900/40 p-6 shadow-sm shadow-slate-950/30"
                            >
                                <h2 className="text-xl font-semibold text-white">{feature.title}</h2>
                                <p className="mt-3 text-sm leading-relaxed text-slate-300">{feature.description}</p>
                            </article>
                        ))}
                    </section>

                    <section id="workspace" className="grid gap-10 lg:grid-cols-[2fr,1fr]">
                        <div className="space-y-6">
                            <div className="flex items-center justify-between">
                                <h2 className="text-2xl font-semibold text-white">Curve workspace</h2>
                                <span className="text-xs uppercase tracking-widest text-slate-500">
                                    Database-backed sandbox
                                </span>
                            </div>
                            <div className="rounded-3xl border border-slate-900 bg-slate-900/40 p-6">
                                <form onSubmit={handleSubmit} className="space-y-5">
                                    <div>
                                        <label htmlFor="name" className="text-sm font-semibold text-slate-200">
                                            Curve name
                                        </label>
                                        <input
                                            id="name"
                                            type="text"
                                            required
                                            value={formState.name}
                                            onChange={(event) => setFormState((previous) => ({ ...previous, name: event.target.value }))}
                                            className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-400/50"
                                            placeholder="Lissajous swirl"
                                        />
                                    </div>
                                    <div>
                                        <label htmlFor="expression" className="text-sm font-semibold text-slate-200">
                                            Expression (use x as the variable)
                                        </label>
                                        <input
                                            id="expression"
                                            type="text"
                                            required
                                            value={formState.expression}
                                            onChange={(event) =>
                                                setFormState((previous) => ({ ...previous, expression: event.target.value }))
                                            }
                                            className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-400/50"
                                            placeholder="sin(x) * cos(2x)"
                                        />
                                        <p className="mt-2 text-xs text-slate-500">
                                            Supports operators + − × ÷ ^ and functions like sin, cos, tan, sqrt, log, exp, abs.
                                        </p>
                                    </div>
                                    <div>
                                        <label htmlFor="description" className="text-sm font-semibold text-slate-200">
                                            Notes (optional)
                                        </label>
                                        <textarea
                                            id="description"
                                            value={formState.description}
                                            onChange={(event) =>
                                                setFormState((previous) => ({ ...previous, description: event.target.value }))
                                            }
                                            rows={3}
                                            className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-400/50"
                                            placeholder="Perfect for neon plasma tunnels."
                                        />
                                    </div>
                                    <div className="flex flex-wrap items-center justify-between gap-4">
                                        <div className="text-xs text-slate-500">
                                            Curves are stored in <span className="font-semibold text-slate-300">data/curves.json</span> — a
                                            lightweight JSON database tracked with your project.
                                        </div>
                                        <button
                                            type="submit"
                                            disabled={submitting}
                                            className="inline-flex items-center justify-center rounded-full bg-indigo-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:opacity-60"
                                        >
                                            {submitting ? 'Saving…' : 'Save to library'}
                                        </button>
                                    </div>
                                </form>
                                {(error || flash) && (
                                    <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900/80 p-4 text-sm">
                                        {error ? (
                                            <p className="text-red-300">{error}</p>
                                        ) : (
                                            <p className="text-emerald-300">{flash}</p>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                        <div id="library" className="space-y-4">
                            <div className="flex items-center justify-between">
                                <h2 className="text-lg font-semibold text-white">Saved curves</h2>
                                <span className="text-xs text-slate-500">{curves.length} stored</span>
                            </div>
                            <div className="grid gap-3">
                                {loading ? (
                                    <div className="rounded-2xl border border-slate-900 bg-slate-900/40 p-6 text-sm text-slate-400">
                                        Loading curves…
                                    </div>
                                ) : curves.length === 0 ? (
                                    <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/20 p-6 text-sm text-slate-400">
                                        No curves yet — create your first one in the workspace.
                                    </div>
                                ) : (
                                    curves.map((curve) => (
                                        <article
                                            key={curve.id}
                                            className={`rounded-2xl border p-5 transition ${
                                                selectedCurve?.id === curve.id
                                                    ? 'border-sky-500/70 bg-slate-900/60'
                                                    : 'border-slate-900 bg-slate-900/30 hover:border-slate-700'
                                            }`}
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div>
                                                    <h3 className="text-base font-semibold text-white">{curve.name}</h3>
                                                    <p className="text-xs uppercase tracking-widest text-slate-500">
                                                        saved {new Date(curve.createdAt).toLocaleString()}
                                                    </p>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => handleDelete(curve)}
                                                    className="text-xs font-semibold text-slate-400 transition hover:text-red-300"
                                                >
                                                    Delete
                                                </button>
                                            </div>
                                            <p className="mt-3 text-sm text-slate-300">{curve.description || 'No description provided.'}</p>
                                            <div className="mt-4 flex flex-wrap items-center gap-3 text-xs">
                                                <code className="rounded-full bg-slate-800/70 px-3 py-1 text-sky-200">y = {curve.expression}</code>
                                                <button
                                                    type="button"
                                                    onClick={() => setSelectedId(curve.id)}
                                                    className="rounded-full border border-transparent bg-slate-800/80 px-4 py-1 font-semibold text-slate-200 transition hover:border-slate-600"
                                                >
                                                    Load curve
                                                </button>
                                            </div>
                                        </article>
                                    ))
                                )}
                            </div>
                        </div>
                    </section>

                    <section className="rounded-3xl border border-slate-900 bg-gradient-to-br from-slate-900 via-slate-900/80 to-slate-900/40 p-10">
                        <div className="grid gap-8 lg:grid-cols-2">
                            <div>
                                <h2 className="text-2xl font-semibold text-white">Under the hood</h2>
                                <p className="mt-4 text-sm leading-relaxed text-slate-300">
                                    CurveGen ships with a lightweight JSON database stored alongside your codebase. The database is
                                    easy to version control, simple to deploy, and works seamlessly in serverless environments. Need to
                                    scale further? Swap the storage implementation while keeping the UI and API contract intact.
                                </p>
                            </div>
                            <div className="space-y-3 text-sm text-slate-300">
                                <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                                    <p className="font-semibold text-slate-200">Zero-setup persistence</p>
                                    <p className="mt-2 text-slate-400">
                                        Data lives in <code className="text-sky-200">data/curves.json</code> and is managed through a
                                        thin Node.js abstraction.
                                    </p>
                                </div>
                                <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                                    <p className="font-semibold text-slate-200">Clean REST API</p>
                                    <p className="mt-2 text-slate-400">
                                        <code className="text-sky-200">GET /api/curves</code> and <code className="text-sky-200">POST
                                        /api/curves</code> power the workspace, while <code className="text-sky-200">DELETE /api/curves/:id</code>
                                        handles removals.
                                    </p>
                                </div>
                                <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                                    <p className="font-semibold text-slate-200">Extensible by design</p>
                                    <p className="mt-2 text-slate-400">
                                        Swap in your preferred data source or schedule cron jobs to populate the library with algorithmic
                                        blends and generative presets.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </section>
                </main>

                <footer className="border-t border-slate-900 bg-slate-950/80 py-12">
                    <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-6 text-sm text-slate-500 sm:flex-row">
                        <p>© {new Date().getFullYear()} CurveGen. Crafted for procedural creatives.</p>
                        <div className="flex items-center gap-4">
                            <a href="#workspace" className="transition hover:text-slate-200">
                                Workspace
                            </a>
                            <a href="#library" className="transition hover:text-slate-200">
                                Library
                            </a>
                            <a href="#features" className="transition hover:text-slate-200">
                                Features
                            </a>
                        </div>
                    </div>
                </footer>
            </div>
        </>
    );
}

import Head from 'next/head';
import { useEffect, useState } from 'react';

import BaseLayout from '@/components/layouts/BaseLayout';
import { allContent } from '@/utils/content';

// P6 Parser runs privately on a Raspberry Pi and is only reachable over Bob's
// tailnet (tailscale serve, HTTPS). This page is a public, unlisted launcher: it
// probes the service's /healthz from the visitor's browser, so it only reports
// "Online" on a device that is signed in to the tailnet. The service allows CORS
// (including Private Network Access preflight) for /healthz from this site and
// its Netlify deploy previews only.
//
// Deliberately unlisted: noindex, and not linked from nav, sitemap or any index.
const TOOL_URL = (process.env.NEXT_PUBLIC_P6_TOOL_URL || '').replace(/\/+$/, '');
const HEALTHZ_TIMEOUT_MS = 4000;

type Status = { state: 'checking' } | { state: 'online'; version: string } | { state: 'private' };

function useToolStatus(): Status {
    const [status, setStatus] = useState<Status>({ state: 'checking' });

    useEffect(() => {
        if (!TOOL_URL) {
            setStatus({ state: 'private' });
            return;
        }
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), HEALTHZ_TIMEOUT_MS);
        let cancelled = false;

        fetch(`${TOOL_URL}/healthz`, { mode: 'cors', cache: 'no-store', signal: controller.signal })
            .then((resp) => (resp.ok ? resp.json() : Promise.reject(new Error(`HTTP ${resp.status}`))))
            .then((body) => {
                if (cancelled) return;
                if (body && body.ok === true) {
                    setStatus({ state: 'online', version: String(body.version ?? 'unknown') });
                } else {
                    setStatus({ state: 'private' });
                }
            })
            .catch(() => {
                if (!cancelled) setStatus({ state: 'private' });
            })
            .finally(() => clearTimeout(timer));

        return () => {
            cancelled = true;
            clearTimeout(timer);
            controller.abort();
        };
    }, []);

    return status;
}

function StatusCard() {
    const status = useToolStatus();
    const dot =
        status.state === 'online' ? 'bg-green-500' : status.state === 'checking' ? 'bg-yellow-400 animate-pulse' : 'bg-gray-400';

    return (
        <div className="mt-10 border-2 border-current rounded-lg p-6" aria-live="polite">
            <div className="flex items-center gap-3">
                <span className={`inline-block w-3 h-3 rounded-full ${dot}`} aria-hidden="true" />
                {status.state === 'checking' && <span className="text-lg">Checking status…</span>}
                {status.state === 'online' && (
                    <span className="text-lg font-bold text-green-500">
                        Online <span className="ml-2 text-sm font-normal opacity-75">version {status.version}</span>
                    </span>
                )}
                {status.state === 'private' && (
                    <span className="text-lg text-gray-400">Private tool - available on Bob&apos;s tailnet only.</span>
                )}
            </div>
            {status.state === 'online' && (
                <a
                    href={TOOL_URL}
                    target="_blank"
                    rel="noopener"
                    className="relative inline-flex items-center justify-center mt-6 py-4 px-5 text-lg leading-tight no-underline transition border-2 border-current hover:bottom-shadow-6 hover:-translate-y-1.5"
                >
                    Open P6 Parser
                </a>
            )}
        </div>
    );
}

export default function P6ToolPage(props: any) {
    return (
        <>
            <Head>
                <title>P6 Parser</title>
                <meta name="robots" content="noindex,nofollow" />
                <meta
                    name="description"
                    content="Primavera P6 XER/XML to typed Excel workbook and schedule health checks. Private tool."
                />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
            </Head>
            <BaseLayout {...props}>
                <div data-theme="colors-f" className="flex flex-col items-center px-4 py-16 sm:py-24">
                    <div className="w-full max-w-3xl">
                        <h1 className="text-4xl sm:text-5xl">P6 Parser</h1>
                        <p className="mt-6 text-lg">
                            Upload a Primavera P6 export (.xer or P6 XML) and get back a typed Excel workbook: numbers and
                            dates cast, an activity view with WBS, codes, float and relationships, calendars, resource
                            hours and costs. The same upload runs schedule health checks (missing logic, leads and lags,
                            hard constraints, high or negative float, invalid dates, out-of-sequence progress) and lists
                            every finding. Files are processed in memory and never stored.
                        </p>
                        <StatusCard />
                    </div>
                </div>
            </BaseLayout>
        </>
    );
}

export function getStaticProps() {
    const allData = allContent();
    const pick = (modelName: string) => allData.find((o: any) => o.__metadata?.modelName === modelName) || null;
    const global = JSON.parse(JSON.stringify({ site: pick('Config'), theme: pick('ThemeStyle') }));
    return { props: { global, colors: 'colors-a' } };
}

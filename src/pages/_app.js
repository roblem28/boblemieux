import Head from 'next/head';
import { generateGlobalCssVariables } from '@/utils/theme-style-utils';
import { useEffect, useState } from 'react';
import '../css/main.css';

export default function MyApp({ Component, pageProps }) {
    const { global, ...page } = pageProps;
    const { theme } = global || {};
    const [isMounted, setIsMounted] = useState(false);

    const cssVars = theme ? generateGlobalCssVariables(theme) : '';

    useEffect(() => {
        setIsMounted(true);
        document.body.setAttribute('data-theme', page.colors || 'colors-a');
    }, [page.colors]);

    return (
        <>
            <Head>
                <meta name="google-site-verification" content="BkUOl9UH8oV2bXfQS5cZOAUalf14L19hpGHQRqc7CnE" />
            </Head>
            <style jsx global>{`
                :root {
                    ${cssVars}
                }
            `}</style>
            {isMounted ? <Component {...pageProps} /> : null}
        </>
    );
}

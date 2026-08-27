import Head from 'next/head';
import { generateGlobalCssVariables } from '@/utils/theme-style-utils';
import { useEffect } from 'react';
import '../css/main.css';

export default function MyApp({ Component, pageProps }) {
    const { global, ...page } = pageProps;
    const { theme } = global || {};

    const cssVars = theme ? generateGlobalCssVariables(theme) : '';

    // _document.js renders data-theme="colors-a" on <body> so the theme is
    // present in the static HTML. This only has to handle client-side route
    // changes into a page that picks a different palette.
    useEffect(() => {
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
            <Component {...pageProps} />
        </>
    );
}

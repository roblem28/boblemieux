import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The site is a Next.js app that publishes `.next`; `public/` is copied
// verbatim by Netlify. Netlify never runs this build, so the output is
// committed into the repo at public/games/blue-ridge-backroad/.
export default defineConfig({
    base: '/games/blue-ridge-backroad/',
    plugins: [react()],
    build: {
        outDir: '../../public/games/blue-ridge-backroad',
        emptyOutDir: true,
        target: 'es2020',
        assetsInlineLimit: 0,
        rollupOptions: {
            output: {
                manualChunks: {
                    three: ['three'],
                    react: ['react', 'react-dom']
                }
            }
        }
    },
    server: {
        host: '127.0.0.1',
        port: 5183
    },
    preview: {
        host: '127.0.0.1',
        port: 5184
    }
});

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FlatCompat } from '@eslint/eslintrc';

// ESLint 9 only reads flat config. The repo carried .eslintrc.json and no lint
// script, so `eslint` exited 2 and linting had been silently absent since the v9
// bump. FlatCompat re-exposes the eslintrc-style next/core-web-vitals preset,
// which eslint-config-next still ships, so the rule set is unchanged.
const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const config = [
    {
        ignores: ['.next/**', 'node_modules/**', 'public/**', '.stackbit/**', 'out/**', 'next-env.d.ts']
    },
    ...compat.extends('next/core-web-vitals'),
    {
        rules: {
            // The site renders content-driven images through ImageBlock/BackgroundImage
            // rather than next/image; revisit if those move to next/image.
            '@next/next/no-img-element': 'off'
        }
    }
];

export default config;

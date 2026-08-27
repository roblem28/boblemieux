import * as React from 'react';
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import js from 'react-syntax-highlighter/dist/cjs/languages/prism/javascript';
import css from 'react-syntax-highlighter/dist/cjs/languages/prism/css';
// Deep import: the styles/prism barrel re-exports ~47 themes (227,960 raw /
// 48,022 gz) and webpack cannot tree-shake a CJS barrel, so importing { funky }
// from it shipped every theme to all 18 routes that render markdown.
import funky from 'react-syntax-highlighter/dist/cjs/styles/prism/funky';

SyntaxHighlighter.registerLanguage('javascript', js);
SyntaxHighlighter.registerLanguage('css', css);

const CodeBlock = ({ className, children }) => {
    let lang = 'text'; // default monospaced text
    if (className && className.startsWith('lang-')) {
        lang = className.replace('lang-', '');
    }
    return (
        <SyntaxHighlighter language={lang} style={funky} wrapLongLines>
            {children}
        </SyntaxHighlighter>
    );
};

// markdown-to-jsx uses <pre><code/></pre> for code blocks.
export default function HighlightedPreBlock({ children, ...rest }) {
    if ('type' in children && children['type'] === 'code') {
        return CodeBlock(children['props']);
    }
    return <pre {...rest}>{children}</pre>;
}

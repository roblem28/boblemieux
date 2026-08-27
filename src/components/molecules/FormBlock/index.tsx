import classNames from 'classnames';
import * as React from 'react';

import { Annotated } from '@/components/Annotated';
import { DynamicComponent } from '@/components/components-registry';
import { mapStylesToClassNames as mapStyles } from '@/utils/map-styles-to-class-names';

type SubmitState = 'idle' | 'submitting' | 'success' | 'error';

export default function FormBlock(props) {
    const formRef = React.useRef<HTMLFormElement>(null);
    const { elementId, className, fields = [], submitLabel, styles = {} } = props;
    const [state, setState] = React.useState<SubmitState>('idle');

    if (fields.length === 0) {
        return null;
    }

    // Netlify picks forms up by parsing the deployed HTML for a <form> carrying
    // data-netlify and a matching hidden form-name input. Both are present in
    // the static output now that the page server-renders.
    const formName = elementId || 'contact';

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!formRef.current || state === 'submitting') {
            return;
        }
        setState('submitting');

        // Netlify accepts a urlencoded POST to any path on the site. Posting to
        // the current path keeps the submission associated with the page it came
        // from and avoids a redirect away from the form.
        const body = new URLSearchParams(new FormData(formRef.current) as any).toString();

        try {
            const response = await fetch(window.location.pathname, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body
            });
            if (!response.ok) {
                throw new Error(`Form POST failed with ${response.status}`);
            }
            formRef.current.reset();
            setState('success');
        } catch (error) {
            console.error('Form submission failed', error);
            setState('error');
        }
    }

    return (
        <Annotated content={props}>
            <form
                className={className}
                name={formName}
                id={elementId}
                onSubmit={handleSubmit}
                ref={formRef}
                method="POST"
                data-netlify="true"
                data-netlify-honeypot="bot-field"
            >
                <div className="grid gap-6 sm:grid-cols-2">
                    <input type="hidden" name="form-name" value={formName} />
                    {/* Spam trap: hidden from people, tempting to bots. Netlify
                        discards any submission that fills it in. */}
                    <p className="hidden">
                        <label>
                            Do not fill this in if you are human: <input name="bot-field" tabIndex={-1} />
                        </label>
                    </p>
                    {fields.map((field, index) => {
                        return <DynamicComponent key={index} {...field} />;
                    })}
                </div>
                <div className={classNames('mt-8', mapStyles({ textAlign: styles.self?.textAlign ?? 'left' }))}>
                    <button
                        type="submit"
                        disabled={state === 'submitting'}
                        className="inline-flex items-center justify-center px-5 py-4 text-lg transition border-2 border-current hover:bottom-shadow-6 hover:-translate-y-1.5 disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-none"
                    >
                        {state === 'submitting' ? 'Sending…' : submitLabel}
                    </button>
                    <p role="status" aria-live="polite" className={classNames('mt-4', { 'sr-only': state === 'idle' })}>
                        {state === 'success' && 'Thanks — your message has been sent. I will get back to you.'}
                        {state === 'error' &&
                            'Something went wrong sending that. Please email roblem28@gmail.com directly.'}
                    </p>
                </div>
            </form>
        </Annotated>
    );
}

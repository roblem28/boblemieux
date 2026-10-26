import classNames from 'classnames';
import Markdown from 'markdown-to-jsx';
import { useEffect, useRef } from 'react';

import { AnnotatedField } from '@/components/Annotated';
import { Action } from '@/components/atoms';
import { DynamicComponent } from '@/components/components-registry';
import { HeroSection } from '@/types';
import { mapStylesToClassNames as mapStyles } from '@/utils/map-styles-to-class-names';
import Section from '../Section';

/*
 This is the only component in this codebase which has a few Stackbit annotations for specific primitive
 field. These are added by the <AnnotatedField> helper.
 The motivation for these annotations: allowing the content editor to edit styles at the field level.
 */
export default function Component(props: HeroSection) {
    const { elementId, colors, backgroundSize, title, subtitle, text, media, actions = [], styles = {} } = props;
    const sectionFlexDirection = styles.self?.flexDirection ?? 'row';
    const sectionAlign = styles.self?.textAlign ?? 'left';
    return (
        <Section elementId={elementId} colors={colors} backgroundSize={backgroundSize} styles={styles.self}>
            <div className={classNames('flex gap-8', mapFlexDirectionStyles(sectionFlexDirection))}>
                <div className={classNames('flex-1 w-full', mapStyles({ textAlign: sectionAlign }))}>
                    {title && (
                        <AnnotatedField path=".title">
                            <h1 className="text-5xl sm:text-6xl whitespace-pre-line">{title}</h1>
                        </AnnotatedField>
                    )}
                    {subtitle && (
                        <AnnotatedField path=".subtitle">
                            <p className={classNames('text-xl sm:text-2xl', { 'mt-4': title })}>{subtitle}</p>
                        </AnnotatedField>
                    )}
                    {text && (
                        <AnnotatedField path=".text">
                            <Markdown
                                options={{ forceBlock: true, forceWrapper: true }}
                                className={classNames('max-w-none prose sm:prose-lg', {
                                    'mt-6': title || subtitle
                                })}
                            >
                                {text}
                            </Markdown>
                        </AnnotatedField>
                    )}
                    {actions?.length > 0 && (
                        <div
                            className={classNames('flex flex-wrap items-center gap-4', {
                                'mt-8': title || subtitle || text,
                                'justify-center': sectionAlign === 'center',
                                'justify-end': sectionAlign === 'right'
                            })}
                        >
                            {actions.map((action, index) => (
                                <Action key={index} {...action} />
                            ))}
                        </div>
                    )}
                </div>
                {media && (
                    <div
                        className={classNames('flex flex-1 w-full', {
                            'justify-center': sectionAlign === 'center',
                            'justify-end': sectionAlign === 'right'
                        })}
                    >
                        <HeroMedia media={media} />
                    </div>
                )}
            </div>
        </Section>
    );
}

function HeroMedia({ media }) {
    if (media?.url === '/images/bob.jpg') {
        return <BobPortrait media={media} />;
    }
    return <DynamicComponent {...media} />;
}

/*
 Easter egg: invisible hotspots over each sunglass lens on the home-page portrait.
 Positions are percentages of the 800x1200 source image, so they scale with it.
 Click a lens to play its song; click again to pause. Starting one stops the other.
 */
const EYE_EGGS = [
    { id: 'left', src: '/audio/egg-left.mp3', style: { left: '27%', top: '32%', width: '19.5%', height: '8.5%' } },
    { id: 'right', src: '/audio/egg-right.mp3', style: { left: '53%', top: '32%', width: '20%', height: '8.5%' } }
];

function BobPortrait({ media }) {
    const players = useRef<Record<string, HTMLAudioElement>>({});

    const toggle = (id: string, src: string) => {
        Object.entries(players.current).forEach(([key, audio]) => {
            if (key !== id) audio.pause();
        });
        let audio = players.current[id];
        if (!audio) {
            audio = new Audio(src);
            players.current[id] = audio;
        }
        if (audio.paused) {
            audio.play().catch(() => {});
        } else {
            audio.pause();
        }
    };

    useEffect(() => {
        const current = players.current;
        return () => Object.values(current).forEach((audio) => audio.pause());
    }, []);

    return (
        <div className="relative inline-flex" data-egg="bob-portrait">
            <DynamicComponent {...media} />
            {EYE_EGGS.map((egg) => (
                <button
                    key={egg.id}
                    type="button"
                    aria-label=""
                    tabIndex={-1}
                    data-egg={egg.id}
                    onClick={() => toggle(egg.id, egg.src)}
                    className="absolute bg-transparent border-0 p-0 m-0 appearance-none"
                    style={{ ...egg.style, cursor: 'default', WebkitTapHighlightColor: 'transparent', outline: 'none' }}
                />
            ))}
        </div>
    );
}

function mapFlexDirectionStyles(flexDirection?: 'row' | 'row-reverse' | 'col' | 'col-reverse') {
    switch (flexDirection) {
        case 'row-reverse':
            return 'flex-col-reverse lg:flex-row-reverse lg:items-center';
        case 'col':
            return 'flex-col';
        case 'col-reverse':
            return 'flex-col-reverse';
        default:
            return 'flex-col lg:flex-row lg:items-center';
    }
}

import * as React from 'react';

import { Annotated } from '@/components/Annotated';
import { BackgroundImage } from '@/components/atoms';
import Footer from '@/components/sections/Footer';
import Header from '@/components/sections/Header';
import { PageComponentProps } from '@/types';
import { PageModelType } from '@/types/generated';

type BaseLayoutProps = React.PropsWithChildren & PageComponentProps & PageModelType;

const DEFAULT_BACKGROUND = { url: '/images/bg1.jpg', opacity: 75 };

const BaseLayout: React.FC<BaseLayoutProps> = (props) => {
    const { global, ...page } = props;
    const { site } = global;

    return (
        <div className="flex flex-col grow">
            <BackgroundImage {...(page?.backgroundImage ?? DEFAULT_BACKGROUND)} />
            {site.header && (
                <Annotated content={site}>
                    <Annotated content={site.header}>
                        <Header {...site.header} />
                    </Annotated>
                </Annotated>
            )}
            <Annotated content={page}>
                <main id="main" className="relative grow">
                    {props.children}
                </main>
            </Annotated>
            {site.footer && (
                <Annotated content={site}>
                    <Annotated content={site.footer}>
                        <Footer {...site.footer} />
                    </Annotated>
                </Annotated>
            )}
        </div>
    );
};

export default BaseLayout;

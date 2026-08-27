import * as React from 'react';

import { DynamicComponent } from '@/components/components-registry';
import { PageComponentProps, PageLayout } from '@/types';
import BaseLayout from '../BaseLayout';

type ComponentProps = PageComponentProps & PageLayout;

const Component: React.FC<ComponentProps> = (props) => {
    const { sections = [] } = props;

    // HeroSection hardcoded an <h1>, so a page with two heroes - the home page -
    // shipped two h1 elements. Only the first hero on a page is the page title;
    // the prop is passed to HeroSection alone so no other section receives an
    // attribute it does not understand.
    const firstHeroIndex = sections.findIndex((section: any) => section?.type === 'HeroSection');

    return (
        <BaseLayout {...props}>
            {sections.map((section: any, index) => {
                const isPageTitle = section?.type === 'HeroSection' ? { isPageTitle: index === firstHeroIndex } : {};
                return <DynamicComponent key={index} {...section} {...isPageTitle} />;
            })}
        </BaseLayout>
    );
};
export default Component;

export function seoGenerateMetaTags(page, site) {
    let pageMetaTags = {};

    if (site.defaultMetaTags?.length) {
        site.defaultMetaTags.forEach((metaTag) => {
            pageMetaTags[metaTag.property] = metaTag.content;
        });
    }

    const title = seoGenerateTitle(page, site);
    const description = seoGenerateMetaDescription(page, site);
    const ogImage = seoGenerateOgImage(page, site);
    const canonical = seoGenerateCanonicalUrl(page, site);
    const isPost = page.__metadata?.modelName === 'PostLayout';

    // Previously only og:title and og:image were emitted, and config.json has no
    // defaultMetaTags, so og:type, og:url, og:description and every twitter:*
    // tag were missing on every route.
    pageMetaTags = {
        ...pageMetaTags,
        'og:type': isPost ? 'article' : 'website',
        'og:site_name': 'Bob LeMieux',
        ...(title && { 'og:title': title }),
        ...(description && { 'og:description': description }),
        ...(ogImage && { 'og:image': ogImage }),
        ...(canonical && { 'og:url': canonical }),
        'twitter:card': ogImage ? 'summary_large_image' : 'summary',
        ...(title && { 'twitter:title': title }),
        ...(description && { 'twitter:description': description }),
        ...(ogImage && { 'twitter:image': ogImage })
    };

    if (page.metaTags?.length) {
        page.metaTags.forEach((metaTag) => {
            pageMetaTags[metaTag.property] = metaTag.content;
        });
    }

    let metaTags = [];
    Object.keys(pageMetaTags).forEach((key) => {
        if (pageMetaTags[key] !== null) {
            metaTags.push({
                property: key,
                content: pageMetaTags[key],
                format: key.startsWith('og') ? 'property' : 'name'
            });
        }
    });

    return metaTags;
}

export function seoGenerateTitle(page, site) {
    let title = page.metaTitle ? page.metaTitle : page.title;
    if (site.titleSuffix && page.addTitleSuffix !== false) {
        // titleSuffix already carries its own separator (e.g. "| Bob LeMieux"),
        // so joining with " - " here produced "Title - | Bob LeMieux".
        title = `${title} ${site.titleSuffix}`;
    }
    return title;
}

export function seoGenerateMetaDescription(page, site) {
    // Any page carrying an excerpt can use it as the description, not just
    // PostLayout. The explicit metaDescription field still wins.
    let metaDescription = page.excerpt || null;
    if (page.metaDescription) {
        metaDescription = page.metaDescription;
    }
    return metaDescription;
}

// Absolute URL for the current page, used for og:url and rel=canonical.
export function seoGenerateCanonicalUrl(page, site) {
    const domainUrl = site.env?.URL;
    const urlPath = page.__metadata?.urlPath;
    if (!domainUrl || !urlPath) return null;
    // next.config.js sets trailingSlash: true, so the canonical form ends in "/".
    const path = urlPath === '/' ? '/' : urlPath.endsWith('/') ? urlPath : `${urlPath}/`;
    return `${domainUrl}${path}`;
}

export function seoGenerateOgImage(page, site) {
    let ogImage = null;
    // Use the sites default og:image field
    if (site.defaultSocialImage) {
        ogImage = site.defaultSocialImage;
    }
    // Blog posts use the featuredImage as the default og:image
    if (page.__metadata.modelName === 'PostLayout') {
        if (page.featuredImage?.url) {
            ogImage = page.featuredImage.url;
        }
    }
    // page socialImage field overrides all others
    if (page.socialImage) {
        ogImage = page.socialImage;
    }

    // Relative or absolute URL
    const absoluteUrlRegex = new RegExp('^(?:[a-z+]+:)?//', 'i');

    // ogImage should use an absolute URL. Get the Netlify domain URL from the Netlify environment variable process.env.URL
    const domainUrl = site.env?.URL;

    if (ogImage) {
        if (domainUrl && !absoluteUrlRegex.test(ogImage)) {
            return domainUrl + ogImage;
        } else {
            return ogImage;
        }
    }
    return null;
}

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Curvegen projects table definition and seed data.
CREATE TABLE IF NOT EXISTS projects (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug text UNIQUE,
    title text NOT NULL,
    description text,
    date timestamptz,
    href text,
    featured_image_url text
);

INSERT INTO projects (slug, title, description, date, href, featured_image_url)
VALUES (
    'curvegen',
    'Curvegen',
    'AI-assisted project controls accelerator blending scheduling insights with predictive analytics.',
    '2024-01-15T00:00:00Z',
    'https://curvegen.ai',
    'https://images.curvegen.ai/featured.jpg'
)
ON CONFLICT (slug) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    date = EXCLUDED.date,
    href = EXCLUDED.href,
    featured_image_url = EXCLUDED.featured_image_url;

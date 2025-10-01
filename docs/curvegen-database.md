# Curvegen database bootstrap

1. Run `netlify add database curvegen` from the repository root to provision the managed Postgres instance.
2. Capture the connection string and add it to `.env.local` as `CURVEGEN_DATABASE_URL`. Also add the same variable in the Netlify dashboard so production builds can query the database.
3. Connect to the database using the connection string and apply `db/curvegen-projects.sql` to create the `projects` table and seed the initial Curvegen record.
4. Deploy the site with `netlify deploy` (or through your usual pipeline) to confirm the Curvegen project now renders from the database.

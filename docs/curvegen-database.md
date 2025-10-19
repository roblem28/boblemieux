# Curvegen database bootstrap

## Prerequisites

1. Install [Node.js](https://nodejs.org/) which also provides the `npm` command required to install the Netlify CLI.
2. Close and re-open your terminal, then confirm the binaries are available:

   ```bash
   node --version
   npm --version
   ```

3. Install the Netlify CLI globally:

   ```bash
   npm install -g netlify-cli
   ```

4. Restart the terminal once more so the global `netlify` binary is on your `PATH`, then verify the installation:

   ```bash
   netlify --version
   ```

## Provisioning steps

1. Run `netlify add database curvegen` from the repository root to provision the managed Postgres instance.
2. Capture the connection string and add it to `.env.local` as either `CURVEGEN_DATABASE_URL` or `CURVEGEN_DB_URL`. Also add the same variable in the Netlify dashboard so production builds can query the database.
   > **Note:** Both `CURVEGEN_DATABASE_URL` and `CURVEGEN_DB_URL` are supported as environment variables for the database connection string. For consistency, we recommend using `CURVEGEN_DATABASE_URL`.
3. Connect to the database using the connection string and apply `db/curvegen-projects.sql` to create the `projects` table and seed the initial Curvegen record.
4. Deploy the site with `netlify deploy` (or through your usual pipeline) to confirm the Curvegen project now renders from the database.

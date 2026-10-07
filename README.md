# Cottage 44 menu

A responsive digital menu for Cottage 44. The menu frontend uses plain HTML,
CSS, and JavaScript with no build step or runtime dependencies. A separate
Cloudflare Pages Functions API provides the backend foundation.

## Local preview

Open `docs/index.html` in a browser, or serve the `docs/` directory with any
static file server.

## Backend foundation

Cloudflare Pages Functions provide the API and owner administration. The
public menu reads only today's plate; `/admin/` supports owner sign-in, saved
plates, image uploads, date history, and setting today's plate. Supabase Auth
password tokens are held in a Secure/HttpOnly/SameSite cookie and are never
stored in browser local storage. Database and Storage RLS enforce the owner
email independently of the UI. See
[the architecture and setup notes](docs/architecture.md) for security choices,
local bindings, production/preview configuration, and required manual setup.

For local API development, install dependencies with `npm ci`, copy
`.env.example` to `.dev.vars`, and replace its placeholders with the Supabase
project URL and publishable key. Start Pages locally with `npm run dev`.
`.dev.vars` is ignored by Git and must not be committed. The admin UI and API
run together on Cloudflare Pages.
Owner password resets use Supabase's one-time recovery email. Configure
`ADMIN_SITE_URL` for the production custom domain and local development.
Cloudflare Pages preview origins are resolved from the request only when they
match this project's `*.cottage44-menu-pages.pages.dev` domain. Configure the
Supabase redirect allow-list and recovery email template as described in
[the setup notes](docs/architecture.md#local-setup-and-manual-account-steps).
If a reset email is not delivered, check Supabase SMTP settings and rate
limits before requesting another: its built-in SMTP is limited to two
messages per project per hour and only sends to organization-team addresses.

## Hosting and deployment

Cloudflare Pages is the only hosting platform. It serves the `docs/` frontend
and the `functions/` Pages Functions API from the `cottage44-menu-pages`
project. The production custom domain is `https://menu.cottage44.co.za`.

## Continuous integration

The `checks` job runs for pull requests and for pushes to `dev` or `main`. It
installs from the lockfile, runs the menu and API tests with Node's built-in
V8 coverage collection, type-checks the Functions, checks static files and
JavaScript syntax, and builds the Pages Functions bundle with Wrangler. The
coverage summary measures `docs/menu.js`; HTML, CSS, the inline theme script,
and API files are not included in that LCOV report. The `javascript-coverage`
artifact contains LCOV and text reports.

Cloudflare Pages' Git integration is the only deployment mechanism. A push to
`main` creates the `Cloudflare Pages` deployment check. The
`Production smoke tests` workflow waits for that check on the same commit and
then verifies the production frontend and `/api/health`; it does not deploy a
second copy of the application.

Successful CI runs on this repository upload `coverage/lcov.info` to Codecov.
Pull requests from forks use Codecov's public-repository tokenless path, so
coverage can be reported without exposing the repository's Codecov secret.
Browse coverage by file and branch on the
[Codecov dashboard](https://app.codecov.io/gh/sdcreek240/Cottage44-menu). The
dashboard and pull request comments require Codecov's GitHub App to be
authorized for this repository.

Feature pull requests must target `dev`. The `dev` branch is the integration
branch; only reviewed, passing changes should be promoted from `dev` to
`main` by a separate release pull request.

Pull requests into `dev` receive a Cloudflare Pages preview from
`.github/workflows/cloudflare-preview.yml`. The workflow runs as
`pull_request_target` so fork pull requests can use the repository's
deployment secrets, but it downloads the PR merge archive through the GitHub
API and deploys the frontend together with `functions/`; it never checks out
or executes fork code. It uses Wrangler `4.148.0`, the `Cottage44_menu`
environment, and blocking smoke tests for the frontend and `/api/health`.
Each successful deployment is linked at
`https://pr-<number>.cottage44-menu-pages.pages.dev` in the pull request.

## Supabase migrations

After CI passes on a push to `dev` or `main`, changes under
`supabase/migrations/` automatically apply pending migrations to the configured
Supabase project. Before the first such push, configure the GitHub environment
secrets and project-ref variable, then reconcile the history for the two
migrations that were already applied manually. See
[the migration automation setup](docs/architecture.md#automated-supabase-migrations)
for the exact one-time steps.

### Future planning troubleshooting

If the owner sees **“Future planning is not enabled yet”** when assigning
tomorrow's or another future plate, the deployed Supabase project has not
accepted `20261007130000_add_future_plate_planning.sql`. The API intentionally
returns this actionable message for the RLS-denied response without exposing
Supabase details. Check the `Cottage44_menu` environment configuration in
GitHub Actions, then rerun the migration workflow by pushing a reviewed
migration change or use the documented one-time history reconciliation only
after verifying the SQL is already present in the intended project. Do not
manually change production data from the dashboard or add a duplicate
migration.

If `supabase link` succeeds but `supabase db push` reports **password
authentication failed for user postgres**, the project reference is reachable
but `SUPABASE_DB_PASSWORD` is not the database password for that Supabase
project. Re-copy the current database password from the project's database
settings into the `Cottage44_menu` environment secret, removing any leading
or trailing whitespace, and rerun the workflow. Do not substitute the
Supabase access token, publishable key, or dashboard password.

To perform the one-time history repair without using a local terminal, open
**Actions → Repair Supabase migration history → Run workflow**, choose the
`dev` branch, and enter exactly `REPAIR_EXISTING_MIGRATIONS` in the
confirmation field. The workflow uses the `Cottage44_menu` environment,
marks only `20261007100000` and `20261007110000` as already applied, and then
runs `supabase db push --linked --yes` for pending migrations. It does not
print credentials or accept a project reference from the form. If the
confirmation text is wrong, no repair job runs.

Cloudflare Pages is the production host. The repository does not change DNS.
See [the architecture and setup notes](docs/architecture.md) for the release
process and required account configuration.

Menu items and prices are maintained in `docs/menu.js`. The light/dark theme
preference is stored in the browser.

The supplied source menu PDF is retained separately at `assets/original-menu.pdf`;
it is not part of the published site.

## Typography

The menu heading and category headings use the locally bundled Bangers font
by The Bangers Project Authors, served from `docs/fonts/bangers/`. It is
distributed under the SIL Open Font License 1.1; see
`docs/fonts/bangers/OFL.txt`. The font is from
[Google Fonts](https://github.com/google/fonts/tree/9710da1eacb3be272583c3224dcb70f9da6eadbb/ofl/bangers).

## Color tokens

The brand palette lives at the top of `docs/styles.css` in the `--brand-*`
tokens: charcoal `--brand-primary` (`#2c2a2a`) and red `--brand-accent`
(`#C12025`). Components should use the semantic `--color-*` tokens instead of
hard-coding colors. Both light and dark themes use the same brand accent,
including on the owner admin page.

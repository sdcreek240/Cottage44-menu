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
require Cloudflare Pages.
Owner password resets use Supabase's one-time recovery email. Configure
`ADMIN_SITE_URL` for the production custom domain and local development.
Cloudflare Pages preview origins are resolved from the request only when they
match this project's `*.cottage44-menu-pages.pages.dev` domain. Configure the
Supabase redirect allow-list and recovery email template as described in
[the setup notes](docs/architecture.md#local-setup-and-manual-account-steps).
If a reset email is not delivered, check Supabase SMTP settings and rate
limits before requesting another: its built-in SMTP is limited to two
messages per project per hour and only sends to organization-team addresses.

## Hosting cutover

The static site and Pages Functions are deployed by Cloudflare Pages from the
`docs/` source and `functions/` directory. The repository no longer contains a
`docs/CNAME` file or a GitHub Pages deployment configuration.

The following provider-side actions are still manual and are not performed by
this repository change:

1. In the repository's **Settings → Pages**, manually disable the GitHub Pages
   source and remove its custom-domain entry. GitHub's Pages API still reports
   the legacy site as built at
   `https://sdcreek240.github.io/Cottage44-menu/` from `main`/`docs`; the
   current token cannot remove it through the API, so use the Settings UI.
2. Keep the existing DNS CNAME unchanged; it already points
   `menu.cottage44.co.za` to `cottage44-menu-pages.pages.dev`.
3. After GitHub Pages is disabled, recheck the hostname in Cloudflare Pages,
   re-add/verify `menu.cottage44.co.za` if Cloudflare still shows it inactive,
   and wait for Cloudflare to issue its certificate. The current TLS handshake
   failure is a provider-side certificate/hostname state, not a DNS record
   problem.
4. Set Cloudflare Pages production branch to `main` and verify
   `/api/health`, `/api/plates/today`, and `/admin/` on the custom domain.

Do not delete or change DNS records as part of this repository PR; this PR
removes repository-owned GitHub Pages wiring but does not change GitHub,
Cloudflare, DNS, Supabase, passwords, or production data.

## Continuous integration

The `checks` job runs for pull requests and for pushes to `dev` or `main`. It
installs from the lockfile, runs the menu and API tests with Node's built-in
V8 coverage collection, type-checks the Functions, checks static files and
JavaScript syntax, and builds the Pages Functions bundle with Wrangler. The
coverage summary measures `docs/menu.js`; HTML, CSS, the inline theme script,
and API files are not included in that LCOV report. The `javascript-coverage`
artifact contains LCOV and text reports. CI does not deploy to a hosting
provider.

Successful CI runs on this repository upload `coverage/lcov.info` to Codecov.
Pull requests from forks use Codecov's public-repository tokenless path, so
coverage can be reported without exposing the repository's Codecov secret.
Browse coverage by file and branch on the
[Codecov dashboard](https://app.codecov.io/gh/sdcreek240/Cottage44-menu). The
dashboard and pull request comments require Codecov's GitHub App to be
authorized for this repository.

Pull requests into `dev` also receive a Cloudflare Pages preview comment from
`.github/workflows/cloudflare-preview.yml`. The repository must have
`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` configured as Actions
secrets, and the Pages project must be named `cottage44-menu-pages`. The
fork-safe workflow downloads only the PR merge ref's static `docs/` files
through the GitHub API and posts a clickable
`https://pr-<number>.cottage44-menu-pages.pages.dev` URL.

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

To repair the known migration-history drift without a local terminal, first
merge the workflow-only PR that adds
`.github/workflows/supabase-migration-repair.yml` to the repository's default
`main` branch. GitHub lists `workflow_dispatch` workflows from the default
branch. Then open **Actions → Repair Supabase migration history → Run
workflow**, select `main`, and enter exactly
`REPAIR_EXISTING_MIGRATIONS`. The job uses the `Cottage44_menu` environment,
repairs only `20261007100000` and `20261007110000`, and runs
`supabase db push --linked --yes`.

Cloudflare Pages is the intended production host. This repository does not
change provider settings or DNS. See [the architecture proposal](docs/architecture.md)
for the manual cutover checklist.

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

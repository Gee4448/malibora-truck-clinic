# Old-address redirects

Three Vercel projects were deleted on 2 Sep 2026, leaving staff bookmarks and
installed PWAs pointing at 404s:

- malibora-truck-clinic.vercel.app
- malibora-truck-clinic-app.vercel.app
- malibora-truck-clinic-vvxn.vercel.app

On 24 Sep 2026 they were re-claimed as redirect-only projects (this folder).
Each serves two files:

- `vercel.json` — 307s every path to https://malibora-clinic.vercel.app/<same path>
- `sw.js` — replaces the old cached PWA service worker: wipes caches,
  unregisters itself, and navigates open tabs to the real site

Re-deploy all three with `deploy-redirects.ps1` (needs the Vercel CLI login).
The projects are not linked to git; a push to main does not touch them.

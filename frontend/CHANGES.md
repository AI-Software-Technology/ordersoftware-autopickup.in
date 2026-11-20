# Maxmol Lubricant frontend - routing, auth and login update

## Setup after unzipping
    npm install          # new deps: react-router-dom, @fontsource-variable/schibsted-grotesk
    npm run dev

To keep the demo accounts panel + "Switch Role" locally, add to `.env`:
    VITE_DEMO_MODE=true
Without it (the default) the demo accounts and passwords are not part of the build at all.

## Routing
- Real URLs now (react-router-dom): refresh, back/forward, bookmarks and shareable links like /orders/42 work.
- Pages are unchanged: `onNavigate('orders/12')` / `onNavigate('orders?status=NEW')` still work, they now push real URLs.
- Opening a protected URL while signed out goes to /login and returns to that page after sign in.
- Sign Out always starts the next user on /dashboard (previously they landed on the last page).
- Every route has a guard, including detail routes (orders/:id, vendors/:id, sales-persons/:id) which had none before.
- Settings (contains "reset demo database") is now admin/super admin only, like its menu item.
- Single access table: src/lib/access.ts. Sidebar and route guards both read it, so they cannot disagree.
- Sidebar now highlights "Orders" also on /orders?status=... (it did not before).
- /production redirects to /packing. Unknown URLs show "Page not found".
- Removed unused pages/Packing.tsx and pages/Production.tsx.

## Auth
- "Remember me" now works: on = localStorage, off = sessionStorage (cleared when browser closes).
- All 23 files that read localStorage directly now use getToken() from src/lib/session.ts.
- Server down at startup no longer silently drops you on login: token is kept, a banner with "Try again" is shown.
- Removed built-in demo credentials from authStore. Auto demo login needs VITE_DEMO_AUTO_LOGIN, VITE_DEMO_EMAIL and VITE_DEMO_PASSWORD.

## Login page
- New split layout: product flow on the left (desktop), clean form on the right.
- Email field is type=email and labelled "Email" (backend login takes email).
- Proper labels, autocomplete, show/hide password button, keyboard focus, error alerts, reduced-motion.
- Removed the false "secure cookie" text. "Forgot password" explains that an admin resets it.

## Deploying (important)
Because URLs are real now, the web server must serve index.html for unknown paths:
- nginx:   try_files $uri /index.html;
- Netlify: public/_redirects  ->  /*  /index.html  200
- Vercel:  rewrite everything to /index.html
Vite dev server already does this.

## Still needs backend work (cannot be fixed in frontend)
- Token is still in browser storage (XSS risk). Safer: httpOnly cookie set by the backend.
- All permission checks here are UX only; the API must enforce them too.

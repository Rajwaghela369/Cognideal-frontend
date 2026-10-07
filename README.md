# CogniDeal Frontend

The web app for CogniDeal, an evidence-grounded sales copilot. Built with
React 19, TypeScript and Vite.

The API lives in its own repository, **cognideal-backend**.

## Local setup

Requires Node 22+ and the backend running on port 8000.

```bash
npm ci
npm run dev
```

The dev server runs on http://localhost:5173 and proxies `/api` and `/health`
to `http://127.0.0.1:8000` (override with `VITE_API_PROXY_TARGET`). The app
calls the API at the relative path `/api/v1`, so no API URL is configured in
the code.

## Scripts

| Command | |
| --- | --- |
| `npm run dev` | dev server with HMR |
| `npm run build` | type-check and build to `dist/` |
| `npm run lint` | ESLint |
| `npm run preview` | preview the production build |

## Deploying on Render

Create a **Static Site**:

| Setting | Value |
| --- | --- |
| Build command | `npm ci && npm run build` |
| Publish directory | `dist` |

Add these rewrite rules, in this order, so the browser keeps talking to one
origin and client-side routes resolve:

| Source | Destination | Action |
| --- | --- | --- |
| `/api/*` | `https://<backend>.onrender.com/api/*` | Rewrite |
| `/health` | `https://<backend>.onrender.com/health` | Rewrite |
| `/*` | `/index.html` | Rewrite |

Plans and test notes: [`docs/frontend/`](docs/frontend/).

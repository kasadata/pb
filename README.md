# Lotto Logic — Documentary Mode (V2)

This is a **static** GitHub Pages version (no Vite, no React, no build).

## Deploy (zero-config)
1. Upload the contents of this ZIP to your repo root (same level as `.github/` and `site/`).
2. Push to `main`.
3. In GitHub: Settings → Pages → (Source = GitHub Actions). The workflow will publish `site/`.

## Local preview
Open `site/index.html` in a browser (works offline).  
Some browsers may restrict file:// access for downloads; GitHub Pages is recommended.

## Notes
- Strategy changes **variance/path**, not jackpot odds per ticket.
- Market jackpot hits use Poisson with λ = effective_tickets / 292,201,338.

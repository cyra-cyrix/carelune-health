# Publishing the Continuum demo

The app is a static site — after `npm run build`, everything is in `dist/`. Any static host works.

## Option A — Netlify Drop (fastest, no CLI, ~2 minutes)

1. Run `npm run build` (already done — `dist/` is current).
2. Open <https://app.netlify.com/drop> in your browser (free account).
3. Drag the **`dist` folder** onto the page.
4. You get a live URL like `https://random-name.netlify.app` — rename it in
   Site settings → Change site name (e.g. `continuum-demo.netlify.app`), then share it.

## Option B — Vercel CLI

```bash
npm i -g vercel
vercel login            # once
vercel --prod           # from the project root; accept defaults (it detects Vite)
```

You get `https://<project>.vercel.app`.

## Before sending the link

- Rebuild after any change: `npm run build` (then re-drop / re-run `vercel --prod`).
- Deep links you can put in an email or WhatsApp message:
  - `/#hospital` — the hospital console (patient cohort + revenue)
  - `/#hospital/detail` — a patient chart (diagnosis & history, protocol, trend)
  - `/#hospital/plan` — the AI review-by-exception screen
  - `/#hospital/consult` — the doctor video consult (AI brief + meds + labs)
  - `/#home` — the caretaker app (Today tab)
  - `/#home/meds` — the medication-administration tab
  - `/#home/log` — the daily-signals capture hub
  - `/#home/progress` — the recovery/motivation view
  - `/#home/family` — the family (payer) view
  - The bare URL opens the pitch cover — this is the one to send.
- The demo uses Google Fonts via CDN; it needs internet (fine for a shared link).
- All data is seeded sample data; nothing is stored or transmitted.

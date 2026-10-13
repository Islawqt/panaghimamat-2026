# Panaghimamat 2026

Online invitation and RSVP for the **STI College Valencia Teachers' Day Celebration & Panaghimamat 2026**, made for the Supreme Student Council.

**Live:** https://islawqt.github.io/panaghimamat-2026/

- **When:** Friday, October 23, 2026 · 1:00 – 5:00 PM
- **Where:** Regidor Country Homes, Carnai, Valencia City, Bukidnon
- **Contribution:** ₱550 students · ₱400 faculty (collected October 7–19)

## Features

- Interactive envelope: break the wax seal and the invitation unfolds from the letter
- Contribution page with GCash / GoTyme QR codes and the officers to pay
- RSVP form saved to a private Google Sheet, with payment screenshots stored in Google Drive
- Faculty rate protected by a verification code checked on the server
- Mobile-first, no frameworks, no build step

## Project structure

```
index.html                  pages and invitation markup
styles.css                  velvet, paper and envelope styling
script.js                   envelope animation, page transitions, form logic
config.js                   public settings (event details, Apps Script URL, payment accounts)
google-apps-script/Code.gs  backend for the Google Sheet and Drive
assets/                     logos, QR codes, textures
```

## Backend setup (Google Apps Script)

1. Create a project at [script.google.com](https://script.google.com) and paste `google-apps-script/Code.gs`.
2. Run `setupPanaghimamat` once to create the Sheet and the private screenshots folder.
3. **Project Settings → Script properties:** add `FACULTY_CODE` and share the code with faculty only.
4. **Deploy → New deployment → Web app** (Execute as: Me · Access: Anyone).
5. Put the `/exec` URL in `config.js` → `sheetWebAppUrl`.

When `Code.gs` changes, redeploy via **Manage deployments → Edit → New version** so the URL stays the same.

## Notes

- Keep secrets out of this repo. `config.js` is public.
- The site never handles money. Payments go directly to the SSC officers' accounts, and records stay in the SSC's private Sheet and Drive.

---

Made by Julius Edgar V. Siapoc · 2026

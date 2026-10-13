# Panaghimamat 2026 · STI College Valencia

**Project owner:** [Islawqt](https://github.com/Islawqt)  
**Event organizer:** STI College Valencia Supreme Student Council

An editorial, old-money-inspired, mobile-first invitation for the joint **Teachers’ Day Celebration and Panaghimamat 2026**.

- **Event:** Thursday, October 22, 2026
- **Venue:** Regidor Country Homes, Carnai, Valencia City, Bukidnon
- **Student contribution:** ₱550
- **Faculty contribution:** ₱400
- **Collection:** October 7–19, 2026, through SSC Treasurer Ms. Jhodel Aranas
- **Program start time:** To be announced

## What is included

- Five-screen interactive invitation (animated opening, event details, contributions, response form, acknowledgment).
- Separate student/faculty flows with the corresponding amounts.
- Attending and not-attending RSVP branches.
- Cash, GCash, and bank-transfer choices, currently running in **test mode with the genuine supplied GCash and GoTyme QR images (do NOT pay while testing)**.
- Transaction reference and sample proof-image fields for testing online payment UI without sending money.
- Two different records: bank/app screenshot proof and a separate **provisional SSC acknowledgment**. Acknowledgments are not official paid receipts.
- Google Apps Script backend designed to store student and faculty replies in separate tabs, maintain an SSC dashboard, and keep uploaded screenshots in a restricted Drive folder.
- Accessible, responsive interface with keyboard navigation and reduced-motion support.

## Important: current deployment state

This release contains the website and the backend **source files**. It is not yet an active hosted invitation, and the spreadsheet template is **not connected** to the website. The form deliberately says *Preview mode* until the Apps Script endpoint is deployed and entered in `config.js`. The test acknowledgment is marked *Demo only — Not saved*. **With `testMode: true`, data will NOT be sent even if the Apps Script URL is accidentally configured.**

The Google Drive XLSX template is an example tracker you can view and edit manually. When `setupPanaghimamat()` runs in your Google account, it creates a **new native Google Sheet** with the same fields and its own payment-proof folder. Use that live sheet for responses, not the template XLSX.

## 1. GitHub Pages deployment

This project lives in the **separate** `Islawqt/panaghimamat-2026` repository. The original `euri` repository is untouched.

1. In [Settings → Pages](https://github.com/Islawqt/panaghimamat-2026/settings/pages), under **Build and deployment**, choose **Deploy from a branch**.
2. Select branch `main`, folder `/(root)`, and press **Save**.
3. When GitHub shows **Your site is live**, check <https://islawqt.github.io/panaghimamat-2026/>.
4. The site is currently a **demo**. Keep the test banner until submissions and payment accounts have been verified.


## 2. Create the LIVE Google Sheet / Apps Script

1. While signed into the Google account that should **own** responses, open <https://script.google.com/> and create a new standalone Apps Script project.
2. Replace its `Code.gs` with `google-apps-script/Code.gs` from this package.
3. Run `setupPanaghimamat()` once. Approve the necessary Spreadsheet and Drive permissions. This produces:
   - A private **Panaghimamat 2026** Sheet with `Dashboard`, `Students`, `Faculty`, and `SSC Guide` tabs.
   - A private Google Drive folder for payment screenshot uploads.
4. Open **Executions** or **Logs** for the sheet link. Keep sheet and upload folder limited to authorized SSC members.
5. Go to **Deploy → New deployment → Web app**. Set **Execute as: Me** and **Who has access: Anyone** so invited respondents can submit without Google sign-in. The script runs under the SSC owner's Drive permissions; never grant guest access to the private sheet or proof folder.
6. Copy the deployed `/exec` URL into `sheetWebAppUrl` in `config.js` and publish that changed file to GitHub.
7. Test with one dummy student record, one faculty record, and one not-attending response. Confirm both tabs, the dashboard counts, private proof folder access, and a receipt ID **before sharing**.

**Safety:** This is a public, unauthenticated event form. Apps Script usage quotas and unsolicited submissions are possible. Restrict access to Sheets/Drive and monitor submissions. The backend recalculates the amount based on role and does not mark online transfers verified automatically.

## 3. Verify the supplied GCash and GoTyme QR codes before launch

The QR files in `assets/qr-gcash.png` and `assets/qr-gotyme.png` were cropped losslessly from the organizer-supplied screenshots. **Both QR images decode with OpenCV**; this confirms machine readability but does not verify the payment destination or SSC authorization. **They may accept real money**, so the demo site warns people not to pay.

1. Confirm with the SSC Treasurer that the GCash destination is **Anthony Sedoro · 0975 552 3575**, and GoTyme Bank is **Anthony Sedoro · account ending 1353**. Do not assume that a successfully decoded QR implies the recipient is verified.
2. Scan both images with the intended payment apps and verify the payee information **without completing a transfer**.
3. Check the QR display on both mobile and desktop, including image resolution, account labels, and the student/faculty amounts.
4. Once the backend is deployed and end-to-end tested, set `onlinePaymentsEnabled: true` and `testMode: false` only when formally approved to collect payments. The public `config.js` file should never contain secret credentials.
5. Remove the demo warning text only when ready for actual launch, and follow SSC approval and collection rules.

The original non-scannable SVG illustrations remain under `assets/` as fallback reference artwork, not as active payment URLs.

Visitors select *Cash* to pledge in person; it remains `Cash — to collect` until the SSC confirms receipt. A visitor selecting online must add a transfer reference and payment screenshot; the SSC then verifies it and manually updates the status in the Sheet.

## Privacy and repo hygiene

- The website does **not** write private payment screenshots to GitHub. Screenshot evidence is submitted to the server backend and stored privately in Drive after activation.
- Never push SSC attendance lists, payment screenshots, Apps Script credentials, downloaded proof files, or `.env` files to this public repository.
- Keep the account and QR details accurate, and coordinate SSC consent/retention procedures before collecting students' personal data.
- Site source files are intentionally dependency-free: GitHub Pages can serve them directly.

## File map

- `index.html` — invitation screens, event text, form, and accessible layout.
- `styles.css` — old-money, emerald-and-ivory responsive design.
- `script.js` — invitation transitions, conditional forms, validation, acknowledgment UI.
- `config.js` — nonsecret public settings and verified QR configuration.
- `assets/` — STI logo, favicon, social preview; includes original supplied QR crops; confirm payee before production use.
- `google-apps-script/Code.gs` — private Sheets/Drive backend for the SSC's Google account.
- `TESTING.md` — step-by-step test scenarios and launch checklist.

The Excel tracker template has already been placed separately in the project's Google Drive folder; the live backend creates a private native Sheet when set up.

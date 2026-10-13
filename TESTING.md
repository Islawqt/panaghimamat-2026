# Panaghimamat 2026 — Testing checklist

> **This build is a preview, not an active RSVP or payment collection service.**
> Original scannable GCash and GoTyme QR images have been installed for test display. Do NOT send money.

## Quick browser test

1. Open `index.html` locally or visit the published GitHub Pages address after enabling Pages.
2. Confirm the gold **TEST PREVIEW** banner appears above the invitation.
3. Tap the wax seal; the invitation card must show **Friday, October 23, 2026**, **1:00 to 5:00 PM** and **Regidor Country Homes**. Close it and confirm the envelope re-seals and the Continue button appears.
4. Continue to contributions. Confirm **₱550 student**, **₱400 faculty**, the **October 7–19** period, and that both the Treasurer and **President Anthony Sedoro** are listed as payees. Switch the GCash / GoTyme QR tabs.
5. Continue to the RSVP form. Enter any *fake test name*, select **Student**, **Attending**, **GCash** and confirm only a screenshot upload appears (no reference-number field).
6. Optionally attach a sample screenshot. Select consent and submit.
7. Verify the next screen says **Preview only** and **Not saved**, and Print is disabled.
8. Return and repeat as **Faculty**, **Attending**, **GoTyme Bank Transfer**. The amount must be **₱400**.
9. Repeat with **Unable to attend**: no contribution/payment fields should appear.
10. Check the same flow on a phone and desktop. Confirm keyboard navigation and readable text.

## Before launch

- [ ] Authenticate the Google Apps Script endpoint and verify that test responses appear in the correct private Google Sheet tabs.
- [ ] Confirm permissions: the public cannot read the private Sheet or payment screenshots.
- [ ] Confirm payee and destination details for both supplied original QR images with the SSC Treasurer.
- [ ] Verify both real QR codes scan in their official apps and show the expected recipient **without completing payment**.
- [ ] After SSC approval, update the backend endpoint and set `onlinePaymentsEnabled: true`; the real QR paths and displayed recipient details are already in `config.js`.
- [ ] **Only after all tests pass**, switch `testMode: false` and remove the demo banner in production.
- [ ] Confirm that online submissions are still **unverified until SSC staff manually confirm** them.
- [ ] Complete an end-to-end live RSVP test in each role and payment category before publicly distributing the invitation.

## Data behavior in this preview

The webpage works entirely in the browser while `testMode: true`. Form details (including any sample screenshots) are not transmitted to the Google Apps Script backend or Google Drive. The local acknowledgment is simulated and cannot be used as proof of RSVP or payment.

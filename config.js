/* Public website settings. This build is DEMO-ONLY and never accepts real payments.
   Do not put passwords, private spreadsheets, or confidential records here. */
window.PANAGHIMAMAT_CONFIG = Object.freeze({
  siteOrigin: 'https://islawqt.github.io',
  eventDate: '2026-10-23',
  testMode: true, // Explicitly disable real submissions until launch testing is complete.
  sheetWebAppUrl: '', // Set only after Google Apps Script is deployed and tested.
  onlinePaymentsEnabled: false, // Testing: never accept real payments or submissions here.
  gcash: {
    displayName: 'Anthony Sedoro',
    maskedNumber: '0975 552 3575',
    qrImage: 'assets/qr-gcash.png' // Original uploaded QR, cropped losslessly for display
  },
  bank: {
    bankName: 'GoTyme Bank',
    accountName: 'Anthony Sedoro',
    maskedNumber: '•••• 1353',
    qrImage: 'assets/qr-gotyme.png' // Original uploaded QR, cropped losslessly for display
  }
});

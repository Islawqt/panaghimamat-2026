/* Public site settings. Nothing secret belongs here — this file is visible to everyone. */
window.PANAGHIMAMAT_CONFIG = Object.freeze({
  siteOrigin: 'https://islawqt.github.io',
  eventDate: '2026-10-23',
  eventTime: '1:00 PM to 5:00 PM',
  eventTheme: '', // shows a "Theme" line inside the invitation when filled in

  testMode: false, // true = replies are previewed only, never saved
  sheetWebAppUrl: 'https://script.google.com/macros/s/AKfycbyPMCEdYslhE7MR_RxtXKKPFmhHnnoK0JwJ272cY_OvxUZrB11sfNkT-WkNw6-wZsbrKg/exec',
  onlinePaymentsEnabled: true,

  gcash: {
    displayName: 'Anthony Sedoro',
    maskedNumber: '0975 552 3575',
    qrImage: 'assets/qr-gcash.png'
  },
  bank: {
    bankName: 'GoTyme Bank',
    accountName: 'Anthony Sedoro',
    maskedNumber: '•••• 1353',
    qrImage: 'assets/qr-gotyme.png'
  }
});

/* Ticket page: /ticket/?ref=PH26-…  Shows the QR only when the SSC has marked the reply "Paid ✓". */
(async () => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const say = (t) => { $('ticketLead').textContent = t; };
  const ref = (new URLSearchParams(location.search).get('ref') || '').trim().toUpperCase();
  const api = (window.PANAGHIMAMAT_CONFIG || {}).sheetWebAppUrl;
  if (!/^PH26-[A-F0-9]{32}$/.test(ref)) return say('This ticket link is not complete. Please open the full link from your email.');
  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 20000);
    const res = await fetch(`${api}?action=ticket&ref=${encodeURIComponent(ref)}`, { credentials: 'omit', signal: ctrl.signal });
    const d = await res.json();
    if (!d.ok) return say(d.message || 'We could not find this ticket.');
    if (!d.attending) return say('This reply says you are not attending, so there is no ticket for it.');
    window.renderTicket($('ticketSlot'), { ...d, paid: d.paid === true });
    say(d.paid ? 'Show this QR code at the entrance on October 23.' : 'Your payment has not been verified yet. Your QR appears here once the SSC confirms it.');
    $('ticketActions').hidden = !d.paid;
  } catch {
    say('We could not load your ticket. Please check your connection and refresh.');
  }
  $('printTicket').addEventListener('click', () => window.print());
})();

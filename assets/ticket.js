/* Panaghimamat 2026 · ticket card (shared by the reply screen and the ticket page).
 * renderTicket(container, { name, section, group, reference, paid, email, preview })
 * The QR holds only the reference code. It is drawn on the device; nothing is stored. */
(() => {
  'use strict';
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

  function qrSvg(text) {
    const qr = window.qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const wrap = el('div', 'tk-qr-code');
    wrap.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
    const svg = wrap.querySelector('svg');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'QR code for ticket ' + text);
    return wrap;
  }

  window.renderTicket = function renderTicket(container, d) {
    const faculty = d.group === 'faculty';
    const t = el('article', 'ticket paper' + (d.paid ? ' is-paid' : ' is-pending'));

    const main = el('div', 'tk-main');
    main.append(el('p', 'tk-admit', faculty ? 'Admit one · Faculty' : 'Admit one · Student'));
    main.append(el('h3', 'tk-event', 'Panaghimamat 2026'));
    main.append(el('p', 'tk-sub', 'Teachers’ Day Celebration & Acquaintance Party'));
    const dl = el('dl', 'tk-info');
    const rows = [['Guest', d.name]];
    if (!faculty && d.section) rows.push(['Year & section', d.section]);
    rows.push(['When', 'Fri, Oct 23 · 1:00–5:00 PM'], ['Where', 'Regidor Country Homes']);
    rows.forEach(([k, v]) => { const w = el('div'); w.append(el('dt', '', k), el('dd', '', v)); dl.append(w); });
    main.append(dl);

    const stub = el('div', 'tk-stub');
    const box = el('div', 'tk-qr');
    if (d.paid) {
      box.append(qrSvg(d.reference));
      stub.append(box, el('p', 'tk-status ok', 'Paid ✓ · Show this at the entrance'));
    } else {
      box.append(el('div', 'tk-qr-lock', ''));
      const lock = el('p', 'tk-lock-text', d.preview ? 'Preview only' : 'QR locked');
      box.append(lock);
      stub.append(box, el('p', 'tk-status', d.preview ? 'Not saved' : 'Awaiting payment verification'));
    }
    stub.append(el('p', 'tk-ref', d.reference));

    t.append(main, stub);

    if (!d.paid && !d.preview) {
      const note = el('p', 'tk-note');
      note.append('Your QR ticket is generated once the SSC verifies your payment. ');
      if (d.email) {
        note.append('An officer will send it to ');
        note.append(el('strong', '', d.email));
        note.append('.');
      } else {
        note.append('An officer will send it to the email you gave.');
      }
      t.append(note);
    }
    container.replaceChildren(t);
    return t;
  };
})();

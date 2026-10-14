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
    lastTicket = d;
    return t;
  };

  /* ---------- Save as image: a landscape ticket drawn on a canvas (works on phones) ---------- */
  let lastTicket = null;
  const loadImg = (src) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; });

  window.saveTicketImage = async function saveTicketImage(d = lastTicket) {
    if (!d) return;
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const W = 1600, H = 720, S = 1100; // S = where the tear-off stub begins
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    const serif = '"Cormorant Garamond", "EB Garamond", Georgia, serif', body = '"EB Garamond", Georgia, serif';
    const [paper, sti, ssc] = await Promise.all([loadImg('assets/paper.jpg'), loadImg('assets/sti-logo.png'), loadImg('assets/ssc-logo.png')]);

    // ticket shape: rounded rectangle with two notches at the perforation
    g.fillStyle = '#2a060a'; g.fillRect(0, 0, W, H);
    g.save();
    g.beginPath(); g.roundRect(30, 30, W - 60, H - 60, 18);
    g.moveTo(S + 24, 30); g.arc(S, 30, 24, 0, Math.PI);
    g.moveTo(S + 24, H - 30); g.arc(S, H - 30, 24, 0, Math.PI, true);
    g.clip('evenodd');
    if (paper) g.drawImage(paper, 0, 0, W, H); else { g.fillStyle = '#ecdfc4'; g.fillRect(0, 0, W, H); }
    const vg = g.createRadialGradient(W / 2, H / 2, H * .3, W / 2, H / 2, W * .65);
    vg.addColorStop(0, 'rgba(110,72,30,0)'); vg.addColorStop(1, 'rgba(110,72,30,.28)');
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
    g.fillStyle = '#5c121c'; g.fillRect(30, 30, S - 30, 70);           // wine header band
    g.restore();

    // double gold frame and perforation
    g.strokeStyle = 'rgba(155,110,50,.55)'; g.lineWidth = 2; g.strokeRect(54, 120, S - 84, H - 174);
    g.setLineDash([10, 10]); g.strokeStyle = 'rgba(110,75,35,.6)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(S, 64); g.lineTo(S, H - 64); g.stroke(); g.setLineDash([]);

    const faculty = d.group === 'faculty';
    g.textBaseline = 'alphabetic';
    g.fillStyle = '#f6ead6'; g.font = `600 22px ${body}`; g.letterSpacing = '6px';
    g.fillText(faculty ? 'ADMIT ONE · FACULTY' : 'ADMIT ONE · STUDENT', 80, 74);
    g.textAlign = 'right'; g.fillText('STI COLLEGE VALENCIA · SSC', S - 40, 74); g.textAlign = 'left';
    g.letterSpacing = '0px';
    if (sti) g.drawImage(sti, 80, 150, 54, 54);
    if (ssc) g.drawImage(ssc, 144, 150, 54, 54);
    g.fillStyle = '#2e1913'; g.font = `500 76px ${serif}`; g.fillText('Panaghimamat 2026', 80, 290);
    g.fillStyle = '#5e4437'; g.font = `italic 30px ${serif}`; g.fillText('Teachers’ Day Celebration & Acquaintance Party', 82, 334);

    const label = (t, x, y) => { g.fillStyle = '#86705e'; g.font = `600 17px ${body}`; g.letterSpacing = '4px'; g.fillText(t.toUpperCase(), x, y); g.letterSpacing = '0px'; };
    const value = (t, x, y, size = 34, max = 900) => { g.fillStyle = '#2e1913'; g.font = `600 ${size}px ${serif}`; let s = String(t || ''); while (g.measureText(s).width > max && s.length > 4) s = s.slice(0, -2) + '…'; g.fillText(s, x, y); };
    label('Guest', 80, 400); value(d.name, 80, 446, 46);
    if (!faculty && d.section) { label('Year & section', 80, 510); value(d.section, 80, 552); }
    label('When', faculty ? 80 : 420, 510); value('Fri, Oct 23 · 1:00–5:00 PM', faculty ? 80 : 420, 552, 34, 600);
    label('Where', 80, 612); value('Regidor Country Homes, Carnai, Valencia City', 80, 652, 30, 960);

    // stub: QR or locked box
    const qx = S + 70, qy = 140, qs = 330;
    g.fillStyle = '#fffaf0'; g.fillRect(qx - 12, qy - 12, qs + 24, qs + 24);
    g.strokeStyle = '#cbb48c'; g.lineWidth = 2; g.strokeRect(qx - 12, qy - 12, qs + 24, qs + 24);
    if (d.paid) {
      const qr = window.qrcode(0, 'M'); qr.addData(d.reference); qr.make();
      const n = qr.getModuleCount(), cell = Math.floor(qs / n), off = Math.floor((qs - cell * n) / 2);
      g.fillStyle = '#111';
      for (let r = 0; r < n; r++) for (let col = 0; col < n; col++) if (qr.isDark(r, col)) g.fillRect(qx + off + col * cell, qy + off + r * cell, cell, cell);
    } else {
      g.fillStyle = 'rgba(46,25,19,.12)';
      for (let y = 0; y < qs; y += 22) for (let x = 0; x < qs; x += 22) if ((x * 7 + y * 3) % 5) g.fillRect(qx + x, qy + y, 14, 14);
      g.fillStyle = '#ecdfc4'; g.fillRect(qx + 70, qy + qs / 2 - 28, qs - 140, 56);
      g.strokeStyle = '#bfa47a'; g.strokeRect(qx + 70, qy + qs / 2 - 28, qs - 140, 56);
      g.fillStyle = '#6d1620'; g.font = `600 22px ${body}`; g.textAlign = 'center'; g.letterSpacing = '5px';
      g.fillText('QR LOCKED', qx + qs / 2, qy + qs / 2 + 8); g.letterSpacing = '0px'; g.textAlign = 'left';
    }
    g.textAlign = 'center';
    g.fillStyle = d.paid ? '#3f5a2e' : '#5e4437'; g.font = `600 22px ${body}`; g.letterSpacing = '3px';
    g.fillText(d.paid ? 'PAID ✓ · SHOW AT ENTRANCE' : 'AWAITING VERIFICATION', qx + qs / 2, qy + qs + 64);
    g.letterSpacing = '0px'; g.fillStyle = '#86705e'; g.font = '18px ui-monospace, Menlo, Consolas, monospace';
    const ref = d.reference || '';
    g.fillText(ref.slice(0, 21), qx + qs / 2, qy + qs + 104); g.fillText(ref.slice(21), qx + qs / 2, qy + qs + 130);
    g.textAlign = 'left';

    const blob = await new Promise((ok) => c.toBlob(ok, 'image/png'));
    const name = 'Panaghimamat-2026-ticket-' + String(d.name || 'guest').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '') + '.png';
    const file = blob && new File([blob], name, { type: 'image/png' });
    // Phones: share sheet lets people save to Photos. Elsewhere: a normal download.
    if (file && navigator.canShare && navigator.canShare({ files: [file] }) && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
      try { await navigator.share({ files: [file], title: 'Panaghimamat 2026 ticket' }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = name;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };
})();

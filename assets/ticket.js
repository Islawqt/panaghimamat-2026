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
        note.append('It will be sent to ');
        note.append(el('strong', '', d.email));
        note.append('.');
      } else {
        note.append('It will be sent to the email you gave.');
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

    await deliver(c, 'Panaghimamat-2026-ticket-' + fileSafe(d.name) + '.png', 'Panaghimamat 2026 ticket');
  };

  const fileSafe = (t) => String(t || 'guest').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '');
  // Phones: share sheet lets people save to Photos. Elsewhere: a normal download.
  async function deliver(c, name, title) {
    const blob = await new Promise((ok) => c.toBlob(ok, 'image/png'));
    const file = blob && new File([blob], name, { type: 'image/png' });
    if (file && navigator.canShare && navigator.canShare({ files: [file] }) && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
      try { await navigator.share({ files: [file], title }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = name;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  /* "With regrets" keepsake card for guests who can't attend: portrait, phone-sized. */
  window.saveRegretsImage = async function saveRegretsImage(d) {
    if (!d) return;
    try { await Promise.all([document.fonts.load('64px "Pinyon Script"'), document.fonts.load('600 40px "Cormorant Garamond"'), document.fonts.load('italic 30px "Cormorant Garamond"'), document.fonts.load('600 20px "EB Garamond"')]); } catch {}
    const W = 1080, H = 1350, M = 64;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    const serif = '"Cormorant Garamond", "EB Garamond", Georgia, serif', body = '"EB Garamond", Georgia, serif', script = '"Pinyon Script", "Cormorant Garamond", cursive';
    const [paper, sti, ssc, seal] = await Promise.all([loadImg('assets/paper.jpg'), loadImg('assets/sti-logo.png'), loadImg('assets/ssc-logo.png'), loadImg('assets/wax-seal.png')]);
    const cx = W / 2;

    // velvet backdrop + paper card
    const bg = g.createRadialGradient(cx, H * .4, 80, cx, H * .45, H * .8);
    bg.addColorStop(0, '#5c121c'); bg.addColorStop(1, '#22050a');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.save();
    g.shadowColor = 'rgba(0,0,0,.55)'; g.shadowBlur = 40; g.shadowOffsetY = 14;
    g.beginPath(); g.roundRect(M, M, W - 2 * M, H - 2 * M, 10); g.fillStyle = '#ecdfc4'; g.fill();
    g.restore();
    g.save();
    g.beginPath(); g.roundRect(M, M, W - 2 * M, H - 2 * M, 10); g.clip();
    if (paper) g.drawImage(paper, 0, 0, W, H);
    const vg = g.createRadialGradient(cx, H / 2, H * .25, cx, H / 2, H * .75);
    vg.addColorStop(0, 'rgba(110,72,30,0)'); vg.addColorStop(1, 'rgba(110,72,30,.32)');
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
    g.restore();
    g.strokeStyle = 'rgba(155,110,50,.6)'; g.lineWidth = 2; g.strokeRect(M + 26, M + 26, W - 2 * M - 52, H - 2 * M - 52);
    g.strokeStyle = 'rgba(155,110,50,.35)'; g.lineWidth = 1; g.strokeRect(M + 34, M + 34, W - 2 * M - 68, H - 2 * M - 68);

    const center = (t, y, font, color, spacing = 0) => { g.font = font; g.fillStyle = color; g.textAlign = 'center'; g.letterSpacing = spacing + 'px'; g.fillText(t, cx, y); g.letterSpacing = '0px'; };
    const fit = (t, font, max) => { g.font = font; let s = String(t || ''); while (g.measureText(s).width > max && s.length > 4) s = s.slice(0, -2) + '…'; return s; };
    const rule = (y) => {
      g.strokeStyle = 'rgba(155,110,50,.6)'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(cx - 190, y); g.lineTo(cx - 24, y); g.moveTo(cx + 24, y); g.lineTo(cx + 190, y); g.stroke();
      center('✦', y + 9, `22px ${serif}`, '#9b7536');
    };

    if (sti) g.drawImage(sti, cx - 86, 150, 72, 72);
    if (ssc) g.drawImage(ssc, cx + 14, 150, 72, 72);
    center('STI COLLEGE VALENCIA · SUPREME STUDENT COUNCIL', 268, `600 19px ${body}`, '#86705e', 4);
    center('Panaghimamat 2026', 360, `500 84px ${serif}`, '#2e1913');
    center('Teachers’ Day Celebration', 410, `italic 34px ${serif}`, '#5e4437');
    rule(462);

    center('With fond regrets', 590, `76px ${script}`, '#5c121c');
    center(fit(d.name, `600 58px ${serif}`, W - 2 * M - 120), 688, `600 58px ${serif}`, '#2e1913');
    center(d.group === 'faculty' ? 'Faculty' : (d.section || 'Student'), 736, `italic 32px ${serif}`, '#5e4437');

    const lines = ['Thank you for letting us know.', 'You will be missed on Friday, October 23,', d.group === 'faculty' ? 'as we celebrate you and all our teachers.' : 'as we celebrate our beloved teachers.'];
    lines.forEach((t, i) => center(t, 826 + i * 46, `32px ${serif}`, '#3d2a20'));
    rule(990);

    const details = [['Reply', 'Unable to attend'], ['Sent', d.repliedOn || new Date().toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })]];
    details.forEach(([k, v], i) => {
      const y = 1052 + i * 46;
      g.textAlign = 'right'; g.font = `600 17px ${body}`; g.fillStyle = '#86705e'; g.letterSpacing = '4px'; g.fillText(k.toUpperCase(), cx - 18, y); g.letterSpacing = '0px';
      g.textAlign = 'left'; g.font = `600 28px ${serif}`; g.fillStyle = '#2e1913'; g.fillText(v, cx + 18, y);
    });
    g.textAlign = 'center'; g.font = '17px ui-monospace, Menlo, Consolas, monospace'; g.fillStyle = '#86705e';
    if (d.reference) g.fillText(d.reference, cx, 1146);
    if (seal) g.drawImage(seal, cx - 44, 1160, 88, 88);
    g.textAlign = 'left';

    await deliver(c, 'Panaghimamat-2026-reply-' + fileSafe(d.name) + '.png', 'Panaghimamat 2026 reply');
  };
})();

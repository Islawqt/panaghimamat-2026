/* Panaghimamat 2026 · private-data-free static Admin client.
 * Authorization is enforced by the existing Google Apps Script backend, not this page.
 * No credentials or guest lists are written to persistent browser storage. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const API = (window.PANAGHIMAMAT_CONFIG || {}).sheetWebAppUrl || '';
  const keys = ['checkinOpens', 'checkinCloses', 'checkoutOpens', 'checkoutCloses'];
  const defaults = {checkinOpens:'12:45', checkinCloses:'17:00', checkoutOpens:'17:00', checkoutCloses:'23:59'};
  let credentials = null, current = null, guests = [], dirty = false, refreshing = false;
  let dateSupported = false, presenceSupported = false, presenceBusy = false, presence = [];
  const session = () => ({user:credentials.user, pass:credentials.pass});
  const notice = (node, message, type = '') => {
    node.textContent = message || ''; node.hidden = !message;
    node.className = 'notice' + (type ? ' ' + type : '');
  };
  const authError = msg => notice($('loginError'), msg, 'error');
  const scheduleMessage = (msg, type = '') => notice($('scheduleFeedback'), msg, type);
  const friendly = err => err && err.name === 'AbortError'
    ? 'The server took too long. No change has been confirmed; refresh before retrying.'
    : 'Could not connect to the server. Please check your connection and try again.';
  const request = async (payload, timeout = 35000) => {
    if (!API) throw new Error('Missing backend address');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const result = await fetch(API, {
        method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'},
        body:JSON.stringify(payload), signal:controller.signal,
        credentials:'omit', redirect:'follow', cache:'no-store', referrerPolicy:'no-referrer'
      });
      if (!result.ok) throw new Error('HTTP ' + result.status);
      const data = await result.json();
      if (!data || typeof data.ok !== 'boolean') throw new Error('Invalid server response');
      return data;
    } finally { clearTimeout(timer); }
  };
  const validRole = role => ['admin','president'].includes(String(role||'').trim().toLowerCase());
  const textTime = val => String(val||'—');
  const timePattern = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
  const prettyTime = value => {
    if (!timePattern.test(value || '')) return '—';
    const [hour,minute]=value.split(':').map(Number);
    return (hour % 12 || 12)+':'+String(minute).padStart(2,'0')+(hour<12?' AM':' PM');
  };
  function previewSchedule() {
    const values=Object.fromEntries(keys.map(key=>[key,$(key).value]));
    $('schedulePreview').textContent='Check-in: '+prettyTime(values.checkinOpens)+' – '+prettyTime(values.checkinCloses)+
      '  ·  Check-out: '+prettyTime(values.checkoutOpens)+' – '+prettyTime(values.checkoutCloses);
  }
  function invalidTime(ids, message) {
    ids.forEach(key=>$(key).setAttribute('aria-invalid','true'));
    scheduleMessage(message,'error');
  }
  function clearTimeErrors() {
    keys.forEach(key=>$(key).removeAttribute('aria-invalid'));
  }
  const quickTimes={
    normal:{checkinOpens:'12:45',checkinCloses:'17:00',checkoutOpens:'17:00',checkoutCloses:'17:30'},
    overlap:{checkinOpens:'12:45',checkinCloses:'17:00',checkoutOpens:'16:45',checkoutCloses:'17:30'}
  };
  function chooseQuickSchedule(name) {
    const times=quickTimes[name]; if(!times || !credentials) return;
    keys.forEach(key=>{$(key).value=times[key];});
    dirty=true;clearTimeErrors();previewSchedule();
    scheduleMessage('Napili na ang schedule. Pindota ang Save schedule aron ma-apply sa tanang officers.');
  }


  function renderWindow(w) {
    if (!w || typeof w.checkinOpen !== 'boolean' || typeof w.checkoutOpen !== 'boolean') return;
    current = w;
    $('serverTime').textContent = 'Server time · ' + (w.now || 'Philippine time');
    if (credentials && guests.length) renderOfficerActivity();
    for (const [key, live] of [['statusCheckin',w.checkinOpen],['statusCheckout',w.checkoutOpen]]) {
      const el=$(key); el.className = 'pill ' + (live?'open':'closed');
      el.textContent = (key === 'statusCheckin'?'Check-in ':'Check-out ') + (live?'open':'closed');
    }
    dateSupported = /^\d{4}-\d{2}-\d{2}$/.test(w.eventDate || '');
    $('eventDate').disabled = !dateSupported;
    $('eventDateSupport').textContent = dateSupported
      ? 'The date only controls scanning access; invitation and ticket email dates stay unchanged.'
      : 'Install the new private Apps Script backend to enable custom scanner dates.';
    if (!dirty) {
      keys.forEach(k=>{ $(k).value = w[k] || defaults[k]; });
      $('eventDate').value = dateSupported ? w.eventDate : '2026-10-23';
      clearTimeErrors();
      previewSchedule();
    }
  }

  function stats() {
    const total = guests.length;
    const arrived = guests.filter(g=>!!g.checkedIn).length;
    const out = guests.filter(g=>!!g.checkedOut).length;
    const inside = guests.filter(g=>!!g.checkedIn && !g.checkedOut).length;
    $('metricEligible').textContent = total.toLocaleString();
    $('metricArrived').textContent = arrived.toLocaleString();
    $('metricInside').textContent = inside.toLocaleString();
    $('metricOut').textContent = out.toLocaleString();
  }

  /* Read the official attendance stamps, which already record the officer responsible
   * for each successful action. Duplicate scans never create a second stamp.
   * "Recently scanning" is deliberately NOT described as an online/login presence. */
  const activityWindowMinutes = 15;
  const stampPattern = /^([A-Za-z]{3})\s+(\d{1,2}),\s+(\d{1,2}):(\d{2})\s*(AM|PM)$/i;
  const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  function parseStamp(value) {
    const text=String(value||'').trim();
    const pos=text.lastIndexOf(' · ');
    if(pos<0)return null;
    const printed=text.slice(0,pos).trim();
    const manual=/\s*\(from list\)\s*$/i.test(text.slice(pos+3));
    const officer=text.slice(pos+3).trim().replace(/\s*\(from list\)\s*$/i,'').trim();
    if(!officer)return null;
    const match=stampPattern.exec(printed);
    let timestamp=0;
    if(match){
      const month=months.indexOf(match[1].toLowerCase());
      const day=Number(match[2]),min=Number(match[4]);
      let hour=Number(match[3])%12;
      if(match[5].toUpperCase()==='PM')hour+=12;
      const year=Number(((window.PANAGHIMAMAT_CONFIG||{}).eventDate||'2026').slice(0,4));
      if(month>=0 && day>=1 && day<=31 && hour<24 && min<60) timestamp=Date.UTC(year,month,day,hour-8,min);
    }
    return {officer,printed,manual,timestamp};
  }
  function serverNow(){
    const t=String(current?.now||'');
    return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(t)
      ? Date.parse(t.replace(' ','T')+':00+08:00') : NaN;
  }
  function renderOfficerActivity(){
    const people=new Map();
    let manualCount=0,recorded=0;
    function collect(stamp,kind){
      if(!stamp)return;
      const action=parseStamp(stamp);
      if(!action)return;
      const key=action.officer.toLocaleLowerCase().replace(/\s+/g,' ').trim();
      if(!people.has(key))people.set(key,{name:action.officer,checkins:0,checkouts:0,manual:0,last:0,lastPrinted:''});
      const row=people.get(key);
      if(kind==='in')row.checkins++;else row.checkouts++;
      if(action.manual){row.manual++;manualCount++;}
      if(action.timestamp>row.last){row.last=action.timestamp;row.lastPrinted=action.printed;}
      recorded++;
    }
    for(const g of guests){collect(g.checkedIn,'in');collect(g.checkedOut,'out');}
    const now=serverNow(),status=Number.isFinite(now);
    const officers=[...people.values()].map(o=>({
      ...o,
      total:o.checkins+o.checkouts,
      recent:status&&o.last>0&&now>=o.last&&now-o.last<=activityWindowMinutes*60000
    })).sort((a,b)=>Number(b.recent)-Number(a.recent)||b.last-a.last||b.total-a.total||a.name.localeCompare(b.name));
    const active=officers.filter(o=>o.recent).length;
    $('activeOfficerCount').textContent=active+' recently scanning';
    $('activeOfficerCount').classList.toggle('idle',active===0);
    $('officerScanCount').textContent=recorded.toLocaleString();
    $('trackedOfficerCount').textContent=officers.length.toLocaleString();
    $('manualScanCount').textContent=manualCount.toLocaleString();
    const list=$('officerList');list.replaceChildren();
    if(!officers.length){
      const empty=document.createElement('p');empty.className='officer-empty';
      empty.textContent='No check-ins or check-outs recorded yet.';
      list.append(empty);return;
    }
    for(const officer of officers){
      const el=document.createElement('div');el.className='officer-person';
      const identity=document.createElement('div');identity.className='officer-identity';
      const avatar=document.createElement('span');avatar.className='officer-avatar';avatar.setAttribute('aria-hidden','true');
      avatar.textContent=officer.name.split(/\s+/).slice(0,2).map(n=>n.charAt(0)).join('').toUpperCase();
      const info=document.createElement('div');
      const name=document.createElement('strong');name.textContent=officer.name;
      if(officer.recent){const tag=document.createElement('span');tag.className='officer-tag';tag.textContent='Recent';name.append(' ',tag);}
      const last=document.createElement('small');
      last.textContent=officer.lastPrinted?'Last recorded · '+officer.lastPrinted:'Officer with a recorded scan';
      info.append(name,last);identity.append(avatar,info);
      const counts=document.createElement('div');counts.className='officer-counts';
      const n=document.createElement('strong');n.textContent=officer.total.toLocaleString();
      const breakdown=document.createElement('span');breakdown.textContent=officer.checkins+' in · '+officer.checkouts+' out';
      counts.append(n,breakdown);el.append(identity,counts);list.append(el);
    }
  }

  const statusOf = g => g.checkedOut ? 'out' : g.checkedIn ? 'inside' : 'pending';
  const escapeNorm = s => String(s||'').toLocaleLowerCase().normalize('NFKD');
  function renderGuests() {
    const q=escapeNorm($('search').value.trim()),group=$('group').value,state=$('state').value;
    const filtered=guests.filter(g=>(group==='all'||g.group===group)
      && (state==='all'||statusOf(g)===state)
      && (!q||escapeNorm((g.name||'')+' '+(g.section||'')).includes(q)));
    $('guestCount').textContent = filtered.length + ' of ' + guests.length + ' verified attendees';
    const holder = $('guestList'); holder.replaceChildren();
    if (!filtered.length) {
      const empty=document.createElement('li');empty.className='empty';
      empty.textContent='No matching guests in the latest attendance snapshot.';
      holder.append(empty);return;
    }
    // Append text nodes only; never treat sheet text as HTML.
    for(const g of filtered.slice(0,250)) {
      const li=document.createElement('li');li.className='person';
      const details=document.createElement('div');
      const name=document.createElement('strong');name.textContent=g.name||'Unnamed guest';
      const groupText=document.createElement('small');groupText.textContent=g.group==='faculty'?'Faculty':'Student'+(g.section?' · '+g.section:'');
      details.append(name,groupText);
      const status=document.createElement('div');const code=statusOf(g);status.className='state '+(code==='pending'?'notyet':code);
      status.textContent=code==='inside'?'Inside':code==='out'?'Checked out':'Not arrived';
      const at=document.createElement('small');
      at.textContent=code==='out' ? 'Out: '+textTime(g.checkedOut)
        : code==='inside'?'In: '+textTime(g.checkedIn):'Awaiting first scan';
      status.append(at);li.append(details,status);holder.append(li);
    }
    if (filtered.length>250){
      const extra=document.createElement('li');extra.className='empty';
      extra.textContent='Showing first 250 matches. Narrow your search to see other guests.';holder.append(extra);
    }
  }

  async function refreshAttendance() {
    if (!credentials || refreshing) return;
    refreshing=true;
    const btn=$('refreshButton');btn.disabled=true;btn.textContent='Refreshing…';
    try {
      const d=await request({action:'attendance',...session()},45000);
      if (!d.ok) throw new Error(d.message||'Unable to load guest attendance');
      if (!Array.isArray(d.guests)) throw new Error('Unexpected attendance data');
      guests=d.guests;
      if(d.window) renderWindow(d.window);
      stats(); renderGuests(); renderOfficerActivity();
      const time=new Intl.DateTimeFormat('en-PH',{hour:'numeric',minute:'2-digit',hour12:true,timeZone:'Asia/Manila'}).format(new Date());
      $('lastUpdated').textContent='Attendance refreshed · '+time;
      $('guestUpdate').textContent='Updated '+time+' · Tap Refresh for latest';
      notice($('dashboardError'),'');
    }catch(err){
      notice($('dashboardError'),err.message && !err.message.startsWith('HTTP ') && err.name!=='AbortError' ? err.message : friendly(err),'error');
    }finally{refreshing=false;btn.disabled=false;btn.textContent='Refresh attendance';}
  }

  function renderPresence() {
    const root=$('presenceList');root.replaceChildren();
    if(!presenceSupported) {
      $('onlineScannerCount').textContent='Backend update needed';
      const p=document.createElement('p');p.className='officer-empty';
      p.textContent='Live officer status is not available until Apps Script is updated.';
      root.append(p);return;
    }
    $('onlineScannerCount').textContent=presence.filter(o=>o.online).length+' / '+presence.length+' online';
    for(const officer of presence) {
      const div=document.createElement('div');div.className='presence-item'+(officer.online?' online':'');
      const name=document.createElement('span');name.className='name';name.textContent=officer.name||officer.username||'Officer';
      const detail=document.createElement('span');detail.className='detail';
      detail.textContent=officer.online?'Online · '+(officer.mode==='checkout'?'Check-out':'Check-in'):'Offline';
      div.append(name,detail);root.append(div);
    }
    if(!presence.length){const p=document.createElement('p');p.className='officer-empty';p.textContent='No configured scanner officers.';root.append(p);}
  }
  async function refreshPresence(){
    if(!credentials || !presenceSupported || presenceBusy || document.hidden)return;
    presenceBusy=true;
    try {
      const d=await request({action:'officerPresence',...session()},20000);
      if(d.ok && Array.isArray(d.officers)){presence=d.officers;renderPresence();}
      else $('onlineScannerCount').textContent='Status temporarily unavailable';
    } catch { $('onlineScannerCount').textContent='Connection unavailable'; }
    finally {presenceBusy=false;}
  }
  async function probePresence(){
    if(!credentials || document.hidden)return;
    try{
      const r=await fetch(API+'?action=ping',{credentials:'omit',cache:'no-store'});
      const d=await r.json();
      presenceSupported=!!(d.features&&d.features.officerPresence);
      if(d.window)renderWindow(d.window);
      renderPresence();
      if(presenceSupported)await refreshPresence();
    }catch{}
  }

  $('loginForm').addEventListener('submit',async e=>{
    e.preventDefault();if(credentials)return;
    const user=$('user').value.trim().toLowerCase(),pass=$('pass').value;
    if(!user||!pass)return authError('Enter your officer username and password.');
    const btn=$('loginButton');btn.disabled=true;btn.textContent='Verifying Admin role…';authError('');
    try {
      const d=await request({action:'officer',user,pass},45000);
      if(!d.ok)return authError(d.message||'Incorrect officer credentials.');
      if(!validRole(d.role))return authError('This account is not an Admin. Only the Admin or President role may open this page.');
      if(!d.window)return authError('The backend has not returned the scanner schedule. Please contact the administrator.');
      credentials={user,pass};
      $('pass').value='';
      $('adminName').textContent=d.officer||'Admin';
      $('topName').textContent='Restricted · Admin access';
      $('signOut').hidden=false;
      $('loginScreen').hidden=true;
      $('dashboard').hidden=false;
      renderWindow(d.window);
      await refreshAttendance();
      await probePresence();
    }catch(err){authError(friendly(err));}
    finally{btn.disabled=false;btn.textContent='Sign in to administration';}
  });

  function signOut(){
    credentials=null;current=null;guests=[];dirty=false;presence=[];dateSupported=false;presenceSupported=false;
    renderPresence();
    $('user').value='';$('pass').value='';$('loginScreen').hidden=false;
    $('dashboard').hidden=true;$('signOut').hidden=true;
    $('topName').textContent='Private officer administration';$('guestList').replaceChildren();
    $('metricEligible').textContent=$('metricArrived').textContent=$('metricInside').textContent=$('metricOut').textContent='—';
    $('activeOfficerCount').textContent='0 recently scanning';$('activeOfficerCount').classList.add('idle');
    $('officerScanCount').textContent=$('trackedOfficerCount').textContent=$('manualScanCount').textContent='0';
    const empty=document.createElement('p');empty.className='officer-empty';empty.textContent='Sign in to view officer activity';
    $('officerList').replaceChildren(empty);
    scheduleMessage('');notice($('dashboardError'),'');
    $('user').focus();
  }
  $('signOut').addEventListener('click',signOut);

  [...keys,'eventDate'].forEach(k=>$(k).addEventListener('input',()=>{
    dirty=true;
    clearTimeErrors();
    previewSchedule();
    scheduleMessage('Wala pa na-save ang oras. Pindota ang Save schedule aron ma-apply.');
  }));
  $('quickNormal').addEventListener('click',()=>chooseQuickSchedule('normal'));
  $('quickOverlap').addEventListener('click',()=>chooseQuickSchedule('overlap'));
  $('undoChanges').addEventListener('click',()=>{
    dirty=false;if(current)renderWindow(current);clearTimeErrors();scheduleMessage('');
  });

  $('scheduleForm').addEventListener('submit',async e=>{
    e.preventDefault();
    if(!credentials||!current)return;
    const schedule=Object.fromEntries(keys.map(k=>[k,$(k).value]));
    if (dateSupported) {
      const date=$('eventDate').value;
      const parsed=/^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(date+'T12:00:00Z') : null;
      if (!parsed || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10)!==date) {
        scheduleMessage('Please choose a valid scanner date.','error'); return;
      }
      schedule.eventDate=date;
    }
    clearTimeErrors();
    // Only four clock fields are HH:MM. Scanner date is YYYY-MM-DD.
    if(keys.some(k=>!timePattern.test(schedule[k]))){
      invalidTime(keys.filter(k=>!timePattern.test(schedule[k])),'Kompletoha ang oras sa check-in ug check-out.');return;
    }
    if(schedule.checkinOpens>=schedule.checkinCloses){
      invalidTime(['checkinOpens','checkinCloses'],'Sa check-in, dapat mas sayo ang Sugod kaysa Human.');return;
    }
    if(schedule.checkoutOpens>=schedule.checkoutCloses){
      invalidTime(['checkoutOpens','checkoutCloses'],'Sa check-out, dapat mas sayo ang Sugod kaysa Human.');return;
    }
    if(schedule.checkoutOpens<schedule.checkinOpens){
      invalidTime(['checkinOpens','checkoutOpens'],'Dapat mauna ang pagsugod sa check-in kaysa check-out.');return;
    }
    const fields=dateSupported?['eventDate',...keys]:keys;
    const old=fields.map(k=>current[k]).join(' / '),next=fields.map(k=>schedule[k]).join(' / ');
    if(old===next){dirty=false;scheduleMessage('Walay nausab nga oras.');return;}
    const when=dateSupported?schedule.eventDate+' · ':'';
    if(!window.confirm('I-save ni nga schedule para sa tanang officers?\n\n'+when+
      'Check-in: '+prettyTime(schedule.checkinOpens)+' – '+prettyTime(schedule.checkinCloses)+'\n'+
      'Check-out: '+prettyTime(schedule.checkoutOpens)+' – '+prettyTime(schedule.checkoutCloses)+
      '\n\nPhilippine time. Dili mausab ang RSVP records o invitation date.'))return;
    const btn=$('saveSchedule');btn.disabled=true;scheduleMessage('Saving schedule…');
    try{
      const d=await request({action:'setAttendanceSchedule',...session(),schedule},45000);
      if(!d.ok){scheduleMessage(d.message||'Schedule could not be saved.','error');return;}
      if(!d.window){scheduleMessage('Server accepted the request but did not return a schedule. Refresh before changing anything else.','error');return;}
      dirty=false;renderWindow(d.window);scheduleMessage('Na-save na! Mao na ni ang oras nga sundon sa tanang officers.','success');
    }catch(err){scheduleMessage(friendly(err),'error');}
    finally{btn.disabled=false;}
  });

  $('refreshButton').addEventListener('click',refreshAttendance);
  ['search','group','state'].forEach(id=>$(id).addEventListener(id==='search'?'input':'change',renderGuests));
  // Read-only refresh. A failed poll never commits a change or discards unsaved edits.
  setInterval(async ()=>{
    if(!credentials)return;
    try{
      const response=await fetch(API+'?action=ping&t='+Date.now(),{credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer'});
      if(response.ok){const data=await response.json();if(data?.window)renderWindow(data.window);}
    }catch{}
  },60000);
  // Attendance snapshots refresh every two minutes only while this Admin tab is visible.
  // Server remains the source of truth; this poll never changes attendance records.
  setInterval(()=>{
    if (credentials && !document.hidden && !refreshing && !dirty) refreshAttendance();
  },120000);
  setInterval(()=>{if(credentials && !document.hidden) void probePresence();},60000);
  window.addEventListener('beforeunload',e=>{
    if(dirty && credentials){e.preventDefault();e.returnValue='';}
  });
})();

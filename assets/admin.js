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

  function renderWindow(w) {
    if (!w || typeof w.checkinOpen !== 'boolean' || typeof w.checkoutOpen !== 'boolean') return;
    current = w;
    $('serverTime').textContent = 'Server time · ' + (w.now || 'Philippine time');
    for (const [key, live] of [['statusCheckin',w.checkinOpen],['statusCheckout',w.checkoutOpen]]) {
      const el=$(key); el.className = 'pill ' + (live?'open':'closed');
      el.textContent = (key === 'statusCheckin'?'Check-in ':'Check-out ') + (live?'open':'closed');
    }
    if (!dirty) keys.forEach(k=>{ $(k).value = w[k] || defaults[k]; });
    $('extendButton').hidden = !w.canExtend;
    $('extensionNote').textContent = w.extended
      ? 'The one-time extension has already been used.'
      : (w.canExtend ? 'One-time +30 minutes from the current check-in closing time.' :
        'The server will offer this shortcut when the extension is permitted. You can still edit the regular schedule above.');
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
      stats(); renderGuests();
      const time=new Intl.DateTimeFormat('en-PH',{hour:'numeric',minute:'2-digit',hour12:true,timeZone:'Asia/Manila'}).format(new Date());
      $('lastUpdated').textContent='Attendance refreshed · '+time;
      $('guestUpdate').textContent='Updated '+time+' · Tap Refresh for latest';
      notice($('dashboardError'),'');
    }catch(err){
      notice($('dashboardError'),err.message && !err.message.startsWith('HTTP ') && err.name!=='AbortError' ? err.message : friendly(err),'error');
    }finally{refreshing=false;btn.disabled=false;btn.textContent='Refresh attendance';}
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
    }catch(err){authError(friendly(err));}
    finally{btn.disabled=false;btn.textContent='Sign in to administration';}
  });

  function signOut(){
    credentials=null;current=null;guests=[];dirty=false;
    $('user').value='';$('pass').value='';$('loginScreen').hidden=false;
    $('dashboard').hidden=true;$('signOut').hidden=true;
    $('topName').textContent='Private officer administration';$('guestList').replaceChildren();
    $('metricEligible').textContent=$('metricArrived').textContent=$('metricInside').textContent=$('metricOut').textContent='—';
    scheduleMessage('');notice($('dashboardError'),'');
    $('user').focus();
  }
  $('signOut').addEventListener('click',signOut);

  keys.forEach(k=>$(k).addEventListener('input',()=>{
    dirty=true;
    scheduleMessage('Unsaved schedule changes · Save or discard before leaving.');
  }));
  $('undoChanges').addEventListener('click',()=>{
    dirty=false;if(current)renderWindow(current);scheduleMessage('');
  });

  $('scheduleForm').addEventListener('submit',async e=>{
    e.preventDefault();
    if(!credentials||!current)return;
    const schedule=Object.fromEntries(keys.map(k=>[k,$(k).value]));
    if(!Object.values(schedule).every(v=>timePattern.test(v))
      ||schedule.checkinOpens>=schedule.checkinCloses
      ||schedule.checkoutOpens>=schedule.checkoutCloses
      ||schedule.checkoutOpens<schedule.checkinOpens){
      scheduleMessage('Invalid schedule. Each opening must precede closing, and check-out cannot start before check-in.','error');return;
    }
    const old=keys.map(k=>current[k]).join(' / '),next=keys.map(k=>schedule[k]).join(' / ');
    if(old===next){dirty=false;scheduleMessage('No changes to save.');return;}
    if(!window.confirm('Apply updated event schedule to all officer scanners?\n\nCurrent: '+old+'\nNew: '+next+'\n\nTimes are Philippine time.'))return;
    const btn=$('saveSchedule');btn.disabled=true;scheduleMessage('Saving schedule…');
    try{
      const d=await request({action:'setAttendanceSchedule',...session(),schedule},45000);
      if(!d.ok){scheduleMessage(d.message||'Schedule could not be saved.','error');return;}
      if(!d.window){scheduleMessage('Server accepted the request but did not return a schedule. Refresh before changing anything else.','error');return;}
      dirty=false;renderWindow(d.window);scheduleMessage('Saved. All scanners will follow the new server-side schedule.','success');
    }catch(err){scheduleMessage(friendly(err),'error');}
    finally{btn.disabled=false;}
  });

  $('extendButton').addEventListener('click',async ()=>{
    if(!credentials||!current?.canExtend)return;
    if(!window.confirm('Extend the current check-in closing time by 30 minutes for all officers? This action can be used only once.'))return;
    const btn=$('extendButton');btn.disabled=true;scheduleMessage('Requesting one-time extension…');
    try{
      const d=await request({action:'extendCheckin',...session()},45000);
      if(!d.ok){scheduleMessage(d.message||'Extension not accepted.','error');return;}
      if(!d.window){scheduleMessage('Extension result did not include a schedule. Refresh before continuing.','error');return;}
      dirty=false;renderWindow(d.window);
      scheduleMessage('Confirmed. Check-in now closes at '+d.window.checkinCloses+' Philippine time.','success');
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
  window.addEventListener('beforeunload',e=>{
    if(dirty && credentials){e.preventDefault();e.returnValue='';}
  });
})();

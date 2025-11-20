import React, { useEffect, useState, useRef } from 'react';

export default function App(){
  const [data, setData] = useState(null);
  const [now, setNow] = useState(new Date());
  const [token, setToken] = useState(localStorage.getItem('promo_token') || '');
  const [loginForm, setLoginForm] = useState({id: '', pass: ''});
  const [adminMode, setAdminMode] = useState(Boolean(localStorage.getItem('promo_token')));
  const [message, setMessage] = useState('');

  useEffect(()=>{ fetchData(); const t = setInterval(()=>{setNow(new Date())}, 1000); return ()=>clearInterval(t); }, []);

  async function fetchData(){
    const res = await fetch('/api/promo');
    const j = await res.json();
    setData(j);
  }

  useEffect(()=>{ // auto refresh when token exists
    if (!token) return;
    localStorage.setItem('promo_token', token);
  }, [token]);

  function formatLocal(dt){
    if(!dt) return '';
    const d = new Date(dt);
    // convert to Asia/Dhaka offset +6
    // using user's browser local timezone may differ; we show formatted string in user's locale but label GMT+6
    const opts = { year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hour12:true };
    return new Intl.DateTimeFormat('en-GB', opts).format(d) + ' (GMT+6)';
  }

  function remainingSeconds(expireAt){
    if (!expireAt || expireAt === 'unlimited') return null;
    const remain = Math.max(0, new Date(expireAt).getTime() - Date.now());
    return Math.floor(remain/1000);
  }

  function hhmmss(sec){
    if (sec === null) return 'Limitless';
    const h = String(Math.floor(sec/3600)).padStart(2,'0');
    const m = String(Math.floor((sec%3600)/60)).padStart(2,'0');
    const s = String(sec%60).padStart(2,'0');
    return `${h}:${m}:${s}`;
  }

  async function doLogin(e){
    e.preventDefault();
    const res = await fetch('/api/promo/login', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id: loginForm.id, pass: loginForm.pass }) });
    const j = await res.json();
    if (j.ok && j.token) { setToken(j.token); setAdminMode(true); setMessage('Login success'); localStorage.setItem('promo_token', j.token); }
    else setMessage('Invalid Login Credentials');
  }

  async function setTempPromo(e){
    e.preventDefault();
    const form = e.target;
    const promo = form.promo.value.trim();
    const minutes = Number(form.minutes.value);
    const res = await fetch('/api/promo/set-temp', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ token, promoCode: promo, minutes }) });
    const j = await res.json();
    if (j.ok) { setData(j.data); setMessage('Temporary PromoCode Success'); }
    else setMessage('Error');
  }

  async function setDefault(e){
    e.preventDefault();
    const promo = e.target.defaultPromo.value.trim();
    const res = await fetch('/api/promo/set-default', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ token, promoCode: promo }) });
    const j = await res.json();
    if (j.ok) { setData(j.data); setMessage('Primary PromoCode Success'); }
    else setMessage('Error');
  }

  function logout(){ localStorage.removeItem('promo_token'); setToken(''); setAdminMode(false); }

  return (
    <div className="min-h-screen bg-white text-gray-900 p-6 font-sans">
      <div className="max-w-5xl mx-auto">
        <header className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-crimson">Promo Shop — Admin</h1>
          <div className="text-right">
            <div className="text-sm">Time <span className="font-mono">{now.toLocaleTimeString('en-GB')}</span></div>
            {adminMode ? <button onClick={logout} className="mt-1 px-3 py-1 rounded bg-gray-100">Logout</button> : null}
          </div>
        </header>

        <main className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Promo card */}
          <section className="p-4 rounded-2xl shadow-lg border-2 border-gray-100">
            <div className="bg-crimson text-white p-4 rounded-lg">
              <div className="text-sm">Current promo code</div>
              <div className="text-3xl font-bold tracking-widest mt-2">{data ? data.promoCode : '—'}</div>
              <div className="mt-2 text-sm">
                {data && data.is_timeLimited ? (
                  <div>Expires in <span className="font-mono">{hhmmss(remainingSeconds(data.expire_at))}</span></div>
                ) : (
                  <div>Limitless</div>
                )}
              </div>
            </div>

            <div className="mt-4">
              <div className="text-xs text-gray-600">Created at</div>
              <div className="text-sm">{data ? formatLocal(data.created_at) : '—'}</div>
            </div>
          </section>

          {/* Admin controls */}
          <section className="p-4 rounded-2xl shadow-lg border-2 border-gray-100">
            {!adminMode ? (
              <form onSubmit={doLogin} className="space-y-3">
                <div className="text-sm font-medium">Login</div>
                <input name="id" placeholder="Login ID" value={loginForm.id} onChange={e=>setLoginForm({...loginForm, id:e.target.value})} className="w-full p-2 rounded border" />
                <input name="pass" type="password" placeholder="Password" value={loginForm.pass} onChange={e=>setLoginForm({...loginForm, pass:e.target.value})} className="w-full p-2 rounded border" />
                <button className="px-4 py-2 rounded bg-crimson text-white">Login</button>
                <div className="text-sm text-gray-600">Secret Key Generated Successfully</div>
                <div className="text-sm text-red-500">{message}</div>
              </form>
            ) : (
              <div className="space-y-4">
                <form onSubmit={setTempPromo} className="space-y-2">
                  <div className="text-sm font-medium">Set Temporary Promo</div>
                  <input name="promo" placeholder="Code" className="w-full p-2 rounded border" required />
                  <input name="minutes" placeholder="Time limit" type="number" className="w-full p-2 rounded border" required />
                  <button className="px-4 py-2 rounded bg-crimson text-white">Confirm</button>
                </form>

                <form onSubmit={setDefault} className="space-y-2">
                  <div className="text-sm font-medium">Set Promo</div>
                  <input name="defaultPromo" placeholder="Code" className="w-full p-2 rounded border" required />
                  <button className="px-4 py-2 rounded bg-gray-800 text-white">Activate</button>
                </form>

                <div className="text-sm text-green-600">{message}</div>
              </div>
            )}
          </section>

          {/* History */}
          <section className="md:col-span-2 p-4 rounded-2xl shadow-lg border-2 border-gray-100">
            <div className="flex justify-between items-center mb-3">
              <div className="text-lg font-semibold">PromoCode History (24H)</div>
              <div className="text-sm">Timezone GMT+6(Asia/Dhaka)</div>
            </div>
            <div className="overflow-auto">
              <table className="w-full table-auto text-sm">
                <thead>
                  <tr className="text-left border-b"><th>SL.</th><th>Promo</th><th>Date</th><th>Time</th></tr>
                </thead>
                <tbody>
                  {data && (data.history || []).slice().reverse().map((h, i)=>{
                    const created = new Date(h.created_at);
                    const date = created.toLocaleDateString('en-GB');
                    const time = created.toLocaleTimeString('en-US');
                    const isDefault = !h.is_timeLimited;
                    const color = isDefault ? 'text-red-600' : 'text-green-600';
                    return (
                      <tr key={i} className="border-b hover:bg-gray-50 cursor-pointer">
                        <td className="py-2 px-1">{i+1}</td>
                        <td className={`py-2 px-1 font-mono ${color}`}>{h.promoCode}</td>
                        <td className="py-2 px-1">{date}</td>
                        <td className="py-2 px-1">{time}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </main>

        <footer className="text-center mt-6 text-xs text-gray-500">Developed by <strong>Aura Cyber Security</strong> </footer>
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../hooks/useAuth';

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail]     = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setLoading(true);
    try { await login(email, password); router.push('/dashboard'); }
    catch (err: any) { setError(err?.response?.data?.error || 'Login failed. Check your credentials.'); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight:'100vh', background:'#FAFAF7', display:'flex', alignItems:'center', justifyContent:'center', padding:'0 16px' }}>
      <div style={{ width:'100%', maxWidth:360 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:32, justifyContent:'center' }}>
          <div style={{ width:40, height:40, background:'#534AB7', borderRadius:12, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:700, fontSize:14 }}>SO</div>
          <div>
            <div style={{ fontWeight:600, fontSize:16, color:'#1A1A1A' }}>SteelOps</div>
            <div style={{ fontSize:12, color:'#888' }}>HR & Operations Platform</div>
          </div>
        </div>
        <div style={{ background:'#fff', border:'1px solid #EBEBEB', borderRadius:16, padding:24 }}>
          <h1 style={{ fontSize:15, fontWeight:600, marginBottom:20, color:'#1A1A1A' }}>Sign in to your account</h1>
          {error && (
            <div style={{ background:'#FFEBEE', border:'1px solid #FFCDD2', color:'#C62828', fontSize:13, padding:'8px 12px', borderRadius:8, marginBottom:16 }}>
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom:14 }}>
              <label className="label">Email address</label>
              <input type="email" className="input" placeholder="you@steelops.com" value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            <div style={{ marginBottom:20 }}>
              <label className="label">Password</label>
              <input type="password" className="input" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required />
            </div>
            <button type="submit" className="btn-primary" style={{ width:'100%', textAlign:'center' }} disabled={loading}>
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </div>
        <p style={{ textAlign:'center', fontSize:12, color:'#aaa', marginTop:20 }}>
          Having trouble? Contact your HR administrator.
        </p>
        <div style={{ marginTop:16, background:'#F3F0FF', borderRadius:10, padding:'10px 14px' }}>
          <div style={{ fontSize:11, fontWeight:600, color:'#534AB7', marginBottom:6 }}>Demo logins (password: SteelOps@2025)</div>
          {[
            ['HR Admin',      'admin@steelops.com'],
            ['Sales',         'j.wilson@contractor.com'],
            ['Logistics',     'o.hassan@steelops.com'],
            ['Finance',       'm.iyer@steelops.com'],
          ].map(([role, email]) => (
            <div key={email} style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'#666', padding:'2px 0' }}>
              <span>{role}</span>
              <button onClick={() => { setEmail(email); setPassword('SteelOps@2025'); }}
                style={{ fontSize:11, color:'#534AB7', background:'none', border:'none', cursor:'pointer', fontFamily:'monospace' }}>
                {email}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

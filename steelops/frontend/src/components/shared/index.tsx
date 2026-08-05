import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../../hooks/useAuth';

const NAV = [
  { href:'/dashboard',     label:'Dashboard',     icon:'⬛' },
  { href:'/hr/employees',  label:'HR',             icon:'👥' },
  { href:'/sales',         label:'Sales',          icon:'🎯' },
  { href:'/logistics',     label:'Logistics',      icon:'🚢' },
  { href:'/manufacturing', label:'Manufacturing',  icon:'🏭' },
  { href:'/procurement',   label:'Procurement',    icon:'📋' },
  { href:'/finance',       label:'Finance',        icon:'💰' },
  { href:'/paperwork',     label:'Paperwork',      icon:'📄' },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const router = useRouter();
  return (
    <div style={{ display:'flex', height:'100vh', overflow:'hidden', background:'#FAFAF7' }}>
      <aside style={{ width:200, flexShrink:0, background:'#fff', borderRight:'1px solid #E8E8E8', display:'flex', flexDirection:'column' }}>
        <div style={{ padding:'14px 16px', borderBottom:'1px solid #E8E8E8', display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ width:28, height:28, background:'#534AB7', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:12, fontWeight:700 }}>SO</div>
          <span style={{ fontWeight:600, fontSize:13 }}>SteelOps</span>
        </div>
        <nav style={{ flex:1, padding:'8px 6px', overflowY:'auto' }}>
          {NAV.map(n => (
            <Link key={n.href} href={n.href}>
              <div className={`nav-item${router.pathname.startsWith(n.href) ? ' active' : ''}`}>
                <span style={{ fontSize:14 }}>{n.icon}</span>
                <span>{n.label}</span>
              </div>
            </Link>
          ))}
        </nav>
        <div style={{ padding:12, borderTop:'1px solid #E8E8E8' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
            <div style={{ width:28, height:28, borderRadius:'50%', background:'#EEEDFE', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color:'#534AB7' }}>
              {user?.name?.slice(0,2).toUpperCase()}
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:12, fontWeight:500, color:'#1A1A1A', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{user?.name}</div>
              <div style={{ fontSize:11, color:'#888', textTransform:'capitalize' }}>{user?.role?.replace('_',' ')}</div>
            </div>
          </div>
          <button onClick={logout} style={{ width:'100%', textAlign:'left', fontSize:12, color:'#888', padding:'4px 8px', borderRadius:6, border:'none', background:'none', cursor:'pointer' }}>
            Sign out
          </button>
        </div>
      </aside>
      <main style={{ flex:1, overflowY:'auto' }}>{children}</main>
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', padding:'14px 24px', borderBottom:'1px solid #EBEBEB', background:'#fff' }}>
      <div>
        <h1 style={{ fontSize:16, fontWeight:600, color:'#1A1A1A', margin:0 }}>{title}</h1>
        {subtitle && <p style={{ fontSize:12, color:'#888', margin:'2px 0 0' }}>{subtitle}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

export function KPIGrid({ children }: { children: React.ReactNode }) {
  return <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(120px,1fr))', gap:10, padding:'16px 24px 0' }}>{children}</div>;
}

export function KPICard({ label, value, note, accent }: { label: string; value: string|number; note?: string; accent?: string }) {
  return (
    <div style={{ background:'#fff', border:'1px solid #EBEBEB', borderRadius:10, padding:'10px 14px' }}>
      <div style={{ fontSize:10, color:'#AAA', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:3 }}>{label}</div>
      <div style={{ fontSize:20, fontWeight:700, color: accent || '#1A1A1A' }}>{value}</div>
      {note && <div style={{ fontSize:10, color:'#BBB', marginTop:2 }}>{note}</div>}
    </div>
  );
}

export function TierBadge({ tier }: { tier?: string }) {
  if (!tier) return null;
  const m: Record<string,string> = { top:'badge badge-top', mid:'badge badge-mid', poor:'badge badge-poor' };
  return <span className={m[tier] || 'badge'}>{tier}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  const m: Record<string,string> = {
    active:'badge badge-success', inactive:'badge badge-poor', pending:'badge badge-warning',
    approved:'badge badge-success', rejected:'badge badge-poor', signed:'badge badge-success',
    open:'badge badge-info', delivered:'badge badge-success', sailing:'badge badge-info',
    loading:'badge badge-warning', pass:'badge badge-success', fail:'badge badge-poor',
  };
  return <span className={m[status] || 'badge bg-gray-100 text-gray-700'}>{status.replace(/_/g,' ')}</span>;
}

export function Spinner() {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', padding:'60px 0' }}>
      <div style={{ width:24, height:24, border:'2px solid #E0E0E0', borderTopColor:'#534AB7', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div style={{ position:'fixed', inset:0, zIndex:50, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.4)', backdropFilter:'blur(2px)' }}>
      <div style={{ background:'#fff', borderRadius:14, boxShadow:'0 20px 60px rgba(0,0,0,0.15)', width:'100%', maxWidth:440, margin:'0 16px', overflow:'hidden' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 20px', borderBottom:'1px solid #EBEBEB' }}>
          <h3 style={{ fontWeight:600, fontSize:14, margin:0 }}>{title}</h3>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', fontSize:18, color:'#888', lineHeight:1 }}>✕</button>
        </div>
        <div style={{ padding:20 }}>{children}</div>
      </div>
    </div>
  );
}

export function SectionCard({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="card">
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
        <h3 style={{ fontSize:13, fontWeight:500, margin:0 }}>{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

export function ProgressBar({ value, max, color='#534AB7', height=6 }: { value: number; max: number; color?: string; height?: number }) {
  const pct = Math.min(Math.round((value/Math.max(max,1))*100),100);
  return (
    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
      <div style={{ flex:1, background:'#F0F0F0', borderRadius:99, overflow:'hidden', height }}>
        <div style={{ width:`${pct}%`, background:color, height:'100%', borderRadius:99, transition:'width .3s' }} />
      </div>
      <span style={{ fontSize:11, color:'#888', width:24, textAlign:'right' }}>{value}</span>
    </div>
  );
}

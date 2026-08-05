import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { hrAPI, salesAPI } from '../lib/api';
import { AppLayout, PageHeader, KPICard, KPIGrid, TierBadge, Spinner, SectionCard } from '../components/shared';

export default function DashboardPage() {
  const [dash, setDash]   = useState<any>(null);
  const [sales, setSales] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([hrAPI.dashboard(), salesAPI.contractors()])
      .then(([d, s]) => { setDash(d.data.data); setSales(s.data.data?.slice(0,8) || []); })
      .catch(() => {
        setDash({ active_employees:13, poor_performers_this_week:2, active_shipments:3, overdue_escrows:1, docs_expiring_soon:2, inactive_employees:1, overdue_agent_tasks:3, dept_breakdown:[], recent_poor:[] });
        setSales([
          { full_name:'James Wilson',   contacts_this_week:22, performance_tier:'top' },
          { full_name:'Sarah Mitchell', contacts_this_week:17, performance_tier:'mid' },
          { full_name:'Robert Torres',  contacts_this_week:8,  performance_tier:'poor' },
        ]);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <AppLayout><Spinner /></AppLayout>;
  const d = dash || {};
  const today = new Date().toLocaleDateString('en-GB',{ weekday:'long', year:'numeric', month:'long', day:'numeric' });

  return (
    <AppLayout>
      <PageHeader title="Monday Morning Dashboard" subtitle={today} />
      <KPIGrid>
        <KPICard label="Active employees"    value={d.active_employees || 0}           note="Across all depts"    accent="#534AB7" />
        <KPICard label="Poor performers"     value={d.poor_performers_this_week || 0}  note="This week"           accent={(d.poor_performers_this_week||0)>0?'#C62828':'#1D9E75'} />
        <KPICard label="Active shipments"    value={d.active_shipments || 0}           note="In transit/loading"  accent="#185FA5" />
        <KPICard label="Overdue escrows"     value={d.overdue_escrows || 0}            note="7+ days unsigned"    accent={(d.overdue_escrows||0)>0?'#C62828':'#1D9E75'} />
        <KPICard label="Docs expiring"       value={d.docs_expiring_soon || 0}         note="Within 30 days"      accent={(d.docs_expiring_soon||0)>0?'#BA7517':'#1D9E75'} />
        <KPICard label="Inactive staff"      value={d.inactive_employees || 0}         note="No activity 3+ days" accent={(d.inactive_employees||0)>0?'#BA7517':'#1D9E75'} />
      </KPIGrid>

      {/* Alerts */}
      <div style={{ padding:'12px 24px 0', display:'flex', flexDirection:'column', gap:6 }}>
        {(d.overdue_escrows||0)>0 && <div style={{ background:'#FFEBEE', border:'1px solid #FFCDD2', borderRadius:8, padding:'8px 12px', fontSize:12, color:'#C62828' }}>🔴 {d.overdue_escrows} escrow{d.overdue_escrows>1?'s have':' has'} been unsigned for 7+ days. Chase buyer immediately.</div>}
        {(d.poor_performers_this_week||0)>0 && <div style={{ background:'#FFF3E0', border:'1px solid #FFE0B2', borderRadius:8, padding:'8px 12px', fontSize:12, color:'#E65100' }}>⚠️ {d.poor_performers_this_week} employee{d.poor_performers_this_week>1?'s are':' is'} performing poorly this week. Review warnings.</div>}
        {(d.inactive_employees||0)>0 && <div style={{ background:'#FFF3E0', border:'1px solid #FFE0B2', borderRadius:8, padding:'8px 12px', fontSize:12, color:'#E65100' }}>⚠️ {d.inactive_employees} staff member{d.inactive_employees>1?'s have':' has'} not logged activity in 3+ days.</div>}
        {(d.docs_expiring_soon||0)>0 && <div style={{ background:'#E3F2FD', border:'1px solid #BBDEFB', borderRadius:8, padding:'8px 12px', fontSize:12, color:'#0D47A1' }}>ℹ️ {d.docs_expiring_soon} document{d.docs_expiring_soon>1?'s are':' is'} expiring within 30 days. Begin renewals.</div>}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, padding:24 }}>
        <SectionCard title="Sales team — clients contacted this week (target: 20)">
          {sales.length === 0
            ? <p style={{ fontSize:12, color:'#aaa' }}>No sales data this week</p>
            : <>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={sales} barSize={16} margin={{ top:4, right:4, left:-20, bottom:0 }}>
                    <XAxis dataKey="full_name" tick={{ fontSize:11 }} tickFormatter={v => v.split(' ')[0]} />
                    <YAxis tick={{ fontSize:11 }} />
                    <Tooltip formatter={(v: any) => [`${v} clients`,'Contacted']} />
                    <Bar dataKey="contacts_this_week" radius={[3,3,0,0]}>
                      {sales.map((e,i) => <Cell key={i} fill={(e.contacts_this_week||0)>=20?'#1D9E75':(e.contacts_this_week||0)>=15?'#534AB7':(e.contacts_this_week||0)>=10?'#BA7517':'#993C1D'} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div style={{ display:'flex', gap:12, marginTop:8, flexWrap:'wrap' }}>
                  {[['#1D9E75','On target (20+)'],['#534AB7','On track (15–19)'],['#BA7517','Lagging (10–14)'],['#993C1D','Poor (<10)']].map(([c,l]) => (
                    <div key={l} style={{ display:'flex', alignItems:'center', gap:4, fontSize:11, color:'#888' }}>
                      <div style={{ width:8, height:8, borderRadius:2, background:c }} />{l}
                    </div>
                  ))}
                </div>
              </>
          }
        </SectionCard>

        <SectionCard title="Quick actions">
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
            {[
              { label:'All employees',    href:'/hr/employees',   color:'#534AB7' },
              { label:'Active shipments', href:'/logistics',       color:'#185FA5' },
              { label:'Unsigned escrows', href:'/finance',         color:'#C62828' },
              { label:'Sales tracker',    href:'/sales',           color:'#1D9E75' },
              { label:'Procurement POs',  href:'/procurement',     color:'#BA7517' },
              { label:'Expiring docs',    href:'/paperwork',       color:'#3B6D11' },
            ].map(a => (
              <a key={a.href} href={a.href} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', border:'1px solid #EBEBEB', borderRadius:8, textDecoration:'none', fontSize:12, color:'#333', background:'#fff', transition:'background .15s' }}>
                <div style={{ width:6, height:6, borderRadius:'50%', background:a.color, flexShrink:0 }} />{a.label}
              </a>
            ))}
          </div>
        </SectionCard>

        {(d.recent_poor||[]).length > 0 && (
          <SectionCard title="Poor performers this week — action required">
            <table className="data-table">
              <thead><tr><th>Name</th><th>Dept</th><th>Module</th><th>Score</th><th>Tier</th></tr></thead>
              <tbody>
                {d.recent_poor.map((r: any) => (
                  <tr key={r.id}>
                    <td style={{ fontWeight:500 }}>{r.full_name}</td>
                    <td style={{ color:'#888' }}>{r.dept}</td>
                    <td><span style={{ fontSize:11, fontFamily:'monospace', color:'#185FA5' }}>{r.module}</span></td>
                    <td>{(r.raw_score||0).toFixed(1)}</td>
                    <td><TierBadge tier="poor" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SectionCard>
        )}
      </div>
    </AppLayout>
  );
}

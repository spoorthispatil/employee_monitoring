import React, { useEffect, useState } from 'react';
import { salesAPI } from '../../lib/api';
import { AppLayout, PageHeader, KPIGrid, KPICard, TierBadge, StatusBadge, Spinner, SectionCard, Modal, ProgressBar } from '../../components/shared';
import { useAuth } from '../../hooks/useAuth';

export default function SalesPage() {
  const { user, isManager } = useAuth();
  const [contractors, setContractors] = useState<any[]>([]);
  const [clients, setClients]         = useState<any[]>([]);
  const [activity, setActivity]       = useState<any[]>([]);
  const [loading, setLoading]         = useState(true);
  const [showLog, setShowLog]         = useState(false);
  const [logForm, setLogForm] = useState({ client_id:'', contact_method:'call', outcome:'no_response', notes:'', follow_up_date:'' });

  const load = async () => {
    setLoading(true);
    try {
      const [c, cl, a] = await Promise.all([
        isManager ? salesAPI.contractors() : Promise.resolve({ data:{ data:[] } }),
        salesAPI.clients(), salesAPI.activity(),
      ]);
      setContractors(c.data.data || []);
      setClients(cl.data.data || []);
      setActivity(a.data.data?.slice(0,20) || []);
    } catch {
      setContractors([
        { id:'1', full_name:'James Wilson',   contacts_this_week:22, conversion_rate:18, performance_tier:'top' },
        { id:'2', full_name:'Sarah Mitchell', contacts_this_week:17, conversion_rate:12, performance_tier:'mid' },
        { id:'3', full_name:'Robert Torres',  contacts_this_week:8,  conversion_rate:5,  performance_tier:'poor' },
      ]);
      setClients([
        { id:'1', company_name:'Pacific Steel Corp', contact_name:'John Smith', status:'active', last_contact: new Date().toISOString() },
        { id:'2', company_name:'Atlantic Metals',    contact_name:'Jane Doe',   status:'prospect' },
      ]);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const logActivity = async () => {
    try { await salesAPI.logActivity(logForm); } catch {}
    setShowLog(false);
    load();
  };

  const myClients = isManager ? clients : clients.filter((c: any) => c.assigned_to === user?.id);

  if (loading) return <AppLayout><Spinner /></AppLayout>;

  return (
    <AppLayout>
      <PageHeader title="Sales" subtitle={isManager ? `${contractors.length} contractors · target 20 clients/week each` : 'My clients & activity'}
        action={<button className="btn-primary" onClick={() => setShowLog(true)}>+ Log activity</button>} />
      {isManager && (
        <KPIGrid>
          <KPICard label="Contractors"  value={contractors.length}                                              accent="#534AB7" />
          <KPICard label="On target"    value={contractors.filter((c:any)=>(c.contacts_this_week||0)>=20).length} note="≥20 clients" accent="#1D9E75" />
          <KPICard label="Lagging"      value={contractors.filter((c:any)=>(c.contacts_this_week||0)<15&&(c.contacts_this_week||0)>=10).length} note="10–14" accent="#BA7517" />
          <KPICard label="Poor"         value={contractors.filter((c:any)=>(c.contacts_this_week||0)<10).length} note="<10 clients" accent="#C62828" />
          <KPICard label="Total clients" value={clients.length} />
        </KPIGrid>
      )}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, padding:24 }}>
        {isManager && (
          <SectionCard title="Contractor progress — this week">
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {contractors.map((c: any, i: number) => (
                <div key={c.id} style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ fontSize:11, color:'#aaa', width:16 }}>#{i+1}</span>
                  <div style={{ flex:1 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                      <span style={{ fontSize:13, fontWeight:500 }}>{c.full_name}</span>
                      <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                        <span style={{ fontSize:11, color:'#888' }}>{parseFloat(c.conversion_rate||0).toFixed(0)}% conv</span>
                        <TierBadge tier={c.performance_tier} />
                      </div>
                    </div>
                    <ProgressBar value={c.contacts_this_week||0} max={20}
                      color={(c.contacts_this_week||0)>=20?'#1D9E75':(c.contacts_this_week||0)>=15?'#534AB7':(c.contacts_this_week||0)>=10?'#BA7517':'#C62828'} />
                  </div>
                  <span style={{ fontSize:11, fontWeight:700, width:32, textAlign:'right' }}>{c.contacts_this_week||0}/20</span>
                </div>
              ))}
            </div>
          </SectionCard>
        )}
        <SectionCard title={isManager ? 'All clients' : 'My clients'}>
          <table className="data-table">
            <thead><tr><th>Company</th><th>Contact</th><th>Status</th><th>Last contact</th></tr></thead>
            <tbody>
              {myClients.slice(0,8).map((c: any) => (
                <tr key={c.id}>
                  <td style={{ fontWeight:500 }}>{c.company_name}</td>
                  <td style={{ color:'#888' }}>{c.contact_name || '—'}</td>
                  <td><StatusBadge status={c.status} /></td>
                  <td style={{ color:'#aaa', fontSize:11 }}>{c.last_contact ? new Date(c.last_contact).toLocaleDateString() : 'Never'}</td>
                </tr>
              ))}
              {myClients.length === 0 && <tr><td colSpan={4} style={{ textAlign:'center', color:'#aaa', padding:'16px 0' }}>No clients yet</td></tr>}
            </tbody>
          </table>
        </SectionCard>
        <SectionCard title="Recent activity log">
          <table className="data-table">
            <thead><tr><th>Client</th><th>Method</th><th>Outcome</th><th>Date</th></tr></thead>
            <tbody>
              {activity.map((a: any) => (
                <tr key={a.id}>
                  <td style={{ fontWeight:500 }}>{a.company_name}</td>
                  <td style={{ color:'#888', textTransform:'capitalize' }}>{a.contact_method}</td>
                  <td><StatusBadge status={a.outcome} /></td>
                  <td style={{ fontSize:11, color:'#aaa' }}>{new Date(a.logged_at).toLocaleDateString()}</td>
                </tr>
              ))}
              {activity.length === 0 && <tr><td colSpan={4} style={{ textAlign:'center', color:'#aaa', padding:'16px 0' }}>No activity this week</td></tr>}
            </tbody>
          </table>
        </SectionCard>
      </div>
      <Modal open={showLog} onClose={() => setShowLog(false)} title="Log client activity">
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div><label className="label">Client</label>
            <select className="input" value={logForm.client_id} onChange={e => setLogForm({...logForm, client_id:e.target.value})}>
              <option value="">Select client...</option>
              {myClients.map((c:any) => <option key={c.id} value={c.id}>{c.company_name}</option>)}
            </select>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <div><label className="label">Method</label>
              <select className="input" value={logForm.contact_method} onChange={e => setLogForm({...logForm, contact_method:e.target.value})}>
                <option value="call">Call</option><option value="email">Email</option><option value="visit">Visit</option><option value="message">Message</option>
              </select>
            </div>
            <div><label className="label">Outcome</label>
              <select className="input" value={logForm.outcome} onChange={e => setLogForm({...logForm, outcome:e.target.value})}>
                <option value="no_response">No response</option><option value="interested">Interested</option>
                <option value="quoted">Quoted</option><option value="negotiating">Negotiating</option>
                <option value="closed">Closed ✓</option><option value="lost">Lost</option>
              </select>
            </div>
          </div>
          <div><label className="label">Notes</label><textarea className="input" rows={3} value={logForm.notes} onChange={e => setLogForm({...logForm, notes:e.target.value})} placeholder="What was discussed..." /></div>
          <div><label className="label">Follow-up date</label><input type="date" className="input" value={logForm.follow_up_date} onChange={e => setLogForm({...logForm, follow_up_date:e.target.value})} /></div>
          <div style={{ display:'flex', gap:8 }}><button className="btn-primary" style={{ flex:1 }} onClick={logActivity}>Log activity</button><button className="btn-secondary" onClick={() => setShowLog(false)}>Cancel</button></div>
        </div>
      </Modal>
    </AppLayout>
  );
}

import React, { useEffect, useState } from 'react';
import { procurementAPI } from '../../lib/api';
import { AppLayout, PageHeader, KPICard, KPIGrid, Spinner, Modal } from '../../components/shared';
import { useAuth } from '../../hooks/useAuth';

const STATUS_STEPS = ['draft','pending_approval','approved','sourcing','in_production','complete'];
const SC: Record<string, { bg: string; text: string }> = {
  draft:            { bg:'#F5F5F5', text:'#888' },
  pending_approval: { bg:'#FFF8E1', text:'#E65100' },
  approved:         { bg:'#E3F2FD', text:'#0D47A1' },
  sourcing:         { bg:'#F3E5F5', text:'#6A1B9A' },
  in_production:    { bg:'#E0F7FA', text:'#006064' },
  complete:         { bg:'#E8F5E9', text:'#2E7D32' },
};

const fmt = (v: number, c = 'USD') =>
  new Intl.NumberFormat('en-US', { style:'currency', currency:c, maximumFractionDigits:0 }).format(v);

export default function ProcurementPage() {
  const { isManager } = useAuth();
  const [pos, setPOs]         = useState<any[]>([]);
  const [sel, setSel]         = useState<any>(null);
  const [filter, setFilter]   = useState('all');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ steel_grade:'', quantity_tonnes:'', quoted_price_per_tonne:'', currency:'USD', required_by_date:'' });
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const r = await procurementAPI.pos();
      setPOs(r.data.data || []);
    } catch { setLoadError('Could not load purchase orders — check your connection and try again.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { if (pos.length && !sel) setSel(pos[0]); }, [pos]);

  const approvePO = async (id: string) => {
    try {
      await procurementAPI.approvePO(id);
      setPOs(p => p.map(o => o.id === id ? { ...o, status:'approved', approved_at: new Date().toISOString() } : o));
      setSel((s: any) => s?.id === id ? { ...s, status:'approved' } : s);
    } catch { setLoadError('Could not approve PO — please retry.'); }
  };

  const filtered = filter === 'all' ? pos : pos.filter(p => p.status === filter);
  const pending  = pos.filter(p => p.status === 'pending_approval').length;
  const totalVal = pos.reduce((s: number, p: any) => s + p.quantity_tonnes * p.quoted_price_per_tonne, 0);

  if (loading) return <AppLayout><Spinner /></AppLayout>;

  return (
    <AppLayout>
      <PageHeader title="Procurement" subtitle={`${pos.length} purchase orders · ${pending} pending approval`}
        action={isManager ? <button className="btn-primary" style={{fontSize:12}} onClick={() => setShowForm(true)}>+ New PO</button> : undefined} />
      {loadError && (
        <div style={{ margin:'0 24px 16px', padding:'10px 14px', background:'#FFEBEE', border:'1px solid #FFCDD2', borderRadius:9, display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
          <span style={{ fontSize:12, color:'#C62828' }}>{loadError}</span>
          <button className="btn-secondary" style={{fontSize:11, padding:'4px 10px'}} onClick={load}>Retry</button>
        </div>
      )}
      <KPIGrid>
        <KPICard label="Pending approval" value={pending}                         note="need sign-off"   accent={pending>0?'#E65100':'#2E7D32'} />
        <KPICard label="Total PO value"   value={fmt(totalVal)}                   note="all active"      accent="#534AB7" />
        <KPICard label="In production"    value={pos.filter(p=>p.status==='in_production').length} note="at mills" accent="#0288D1" />
        <KPICard label="Completed"        value={pos.filter(p=>p.status==='complete').length}      note="this month" accent="#2E7D32" />
        <KPICard label="Cost variance"    value={pos.filter((p:any)=>p.final_price_per_tonne&&Math.abs(p.final_price_per_tonne-p.quoted_price_per_tonne)/p.quoted_price_per_tonne>0.05).length} note=">5% overrun" accent="#C62828" />
      </KPIGrid>

      <div style={{ display:'grid', gridTemplateColumns:'320px 1fr', gap:0, margin:'16px 24px', height:'calc(100vh - 220px)', minHeight:360 }}>
        {/* List */}
        <div style={{ borderRight:'1px solid #EBEBEB', paddingRight:14, display:'flex', flexDirection:'column', overflow:'hidden' }}>
          <div style={{ display:'flex', gap:5, flexWrap:'wrap', marginBottom:10, flexShrink:0 }}>
            {['all',...STATUS_STEPS].map(s => (
              <button key={s} onClick={() => setFilter(s)} style={{ fontSize:10, fontWeight:600, padding:'3px 9px', borderRadius:99, border:'none', cursor:'pointer', background:filter===s?'#534AB7':'#F0F0F0', color:filter===s?'#fff':'#666' }}>
                {s==='all'?`All (${pos.length})`:s.replace(/_/g,' ')}
              </button>
            ))}
          </div>
          <div style={{ flex:1, overflowY:'auto' }}>
            {filtered.map(p => {
              const sc = SC[p.status] || SC.draft;
              const urgent = p.status === 'pending_approval';
              return (
                <div key={p.id} onClick={() => setSel(p)} style={{ background:sel?.id===p.id?'#F3F0FF':urgent?'#FFFDE7':'#fff', border:`1px solid ${sel?.id===p.id?'#7C6FE0':urgent?'#FFE082':'#EBEBEB'}`, borderRadius:11, padding:'11px 13px', cursor:'pointer', marginBottom:7, boxShadow:sel?.id===p.id?'0 0 0 3px #EDE9FE':'none' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', gap:8 }}>
                    <div style={{ flex:1 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3, flexWrap:'wrap' }}>
                        <span style={{ fontSize:11, fontWeight:700, fontFamily:'monospace', color:'#534AB7' }}>{p.po_number}</span>
                        <span style={{ fontSize:9, fontWeight:700, padding:'2px 7px', borderRadius:99, background:sc.bg, color:sc.text }}>{p.status.replace(/_/g,' ')}</span>
                      </div>
                      <div style={{ fontSize:12, fontWeight:600, color:'#222' }}>{p.steel_grade}</div>
                      <div style={{ fontSize:11, color:'#888', marginTop:2 }}>{p.mill_name} · {p.quantity_tonnes}t</div>
                    </div>
                    <div style={{ textAlign:'right', flexShrink:0 }}>
                      <div style={{ fontSize:13, fontWeight:700, color:'#333' }}>{fmt(p.quantity_tonnes*p.quoted_price_per_tonne, p.currency)}</div>
                      <div style={{ fontSize:10, color:'#aaa' }}>{fmt(p.quoted_price_per_tonne, p.currency)}/t</div>
                    </div>
                  </div>
                  {isManager && urgent && (
                    <button onClick={e => { e.stopPropagation(); approvePO(p.id); }} style={{ marginTop:8, width:'100%', padding:'6px 0', background:'#534AB7', color:'#fff', border:'none', borderRadius:7, fontSize:11, fontWeight:700, cursor:'pointer' }}>
                      ✓ Approve PO
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Detail */}
        {sel ? (
          <div style={{ paddingLeft:20, overflowY:'auto' }}>
            <div style={{ fontSize:18, fontWeight:800, fontFamily:'monospace', color:'#534AB7', marginBottom:3 }}>{sel.po_number}</div>
            <div style={{ fontSize:13, color:'#666', marginBottom:16 }}>{sel.mill_name} · {sel.steel_grade}</div>

            {/* Stepper */}
            <div style={{ fontSize:11, fontWeight:700, color:'#888', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:10 }}>Order status</div>
            <div style={{ display:'flex', alignItems:'flex-end', marginBottom:18 }}>
              {STATUS_STEPS.map((step, i) => {
                const ci = STATUS_STEPS.indexOf(sel.status);
                const done = i < ci, active = i === ci;
                return (
                  <React.Fragment key={step}>
                    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', flex:1 }}>
                      <div style={{ width:16, height:16, borderRadius:'50%', background:done?'#534AB7':active?'#fff':'#E0E0E0', border:active?'3px solid #534AB7':done?'none':'2px solid #CCC', display:'flex', alignItems:'center', justifyContent:'center' }}>
                        {done && <svg width="8" height="6" viewBox="0 0 8 6"><path d="M1 3l2 2L7 1" stroke="#fff" strokeWidth="1.6" fill="none" strokeLinecap="round"/></svg>}
                      </div>
                      <div style={{ fontSize:8.5, textAlign:'center', marginTop:4, lineHeight:1.3, color:active||done?'#534AB7':'#CCC', fontWeight:active?700:400, maxWidth:50, whiteSpace:'pre-line' }}>
                        {step.replace(/_/g,'\n')}
                      </div>
                    </div>
                    {i < STATUS_STEPS.length-1 && <div style={{ height:2, flex:0.4, marginBottom:18, background:i<STATUS_STEPS.indexOf(sel.status)?'#534AB7':'#E0E0E0' }} />}
                  </React.Fragment>
                );
              })}
            </div>

            {/* Value */}
            <div style={{ background:'#F8F5FF', border:'1px solid #D4C8FF', borderRadius:12, padding:'14px 16px', marginBottom:16, display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 }}>
              {[
                { l:'Total value',       v:fmt(sel.quantity_tonnes*sel.quoted_price_per_tonne, sel.currency), c:'#4527A0' },
                { l:'DDU insurance (1%)',v:fmt(sel.ddu_insurance_amount||sel.quantity_tonnes*sel.quoted_price_per_tonne*0.01, sel.currency), c:'#00796B' },
                { l:'Price/tonne',       v:fmt(sel.quoted_price_per_tonne, sel.currency), c:'#1565C0' },
              ].map(item => (
                <div key={item.l}>
                  <div style={{ fontSize:10, color:'#9575CD', textTransform:'uppercase', letterSpacing:'.04em', marginBottom:3 }}>{item.l}</div>
                  <div style={{ fontSize:15, fontWeight:800, color:item.c }}>{item.v}</div>
                </div>
              ))}
            </div>

            {/* Details grid */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px 16px', marginBottom:16 }}>
              {[
                ['Quantity',    `${sel.quantity_tonnes}t`],
                ['Grade',       sel.steel_grade],
                ['Mill',        sel.mill_name],
                ['Required by', new Date(sel.required_by_date).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})],
                ['Raised by',   sel.raised_by_name],
                ['Approved by', sel.approved_by_name || '—'],
              ].map(([k,v]) => (
                <div key={k} style={{ borderBottom:'1px solid #F0F0F0', paddingBottom:6 }}>
                  <div style={{ fontSize:10, color:'#bbb', textTransform:'uppercase', letterSpacing:'.04em', marginBottom:2 }}>{k}</div>
                  <div style={{ fontSize:12, fontWeight:600, color:'#333' }}>{v}</div>
                </div>
              ))}
            </div>

            {/* Variance alert */}
            {sel.final_price_per_tonne && (
              <div style={{ padding:'10px 14px', borderRadius:9, marginBottom:12, background:Math.abs(sel.final_price_per_tonne-sel.quoted_price_per_tonne)/sel.quoted_price_per_tonne>0.05?'#FFEBEE':'#E8F5E9', border:`1px solid ${Math.abs(sel.final_price_per_tonne-sel.quoted_price_per_tonne)/sel.quoted_price_per_tonne>0.05?'#FFCDD2':'#C8E6C9'}` }}>
                <div style={{ fontSize:11, fontWeight:700, marginBottom:3 }}>Final price: {fmt(sel.final_price_per_tonne, sel.currency)}/t (quoted: {fmt(sel.quoted_price_per_tonne, sel.currency)}/t)</div>
                <div style={{ fontSize:11, color:'#555' }}>Variance: {(((sel.final_price_per_tonne-sel.quoted_price_per_tonne)/sel.quoted_price_per_tonne)*100).toFixed(1)}%</div>
              </div>
            )}

            {isManager && sel.status === 'pending_approval' && (
              <button onClick={() => approvePO(sel.id)} style={{ width:'100%', padding:'10px 0', fontSize:13, fontWeight:700, background:'#534AB7', color:'#fff', border:'none', borderRadius:10, cursor:'pointer' }}>
                ✓ Approve PO — notify business partner
              </button>
            )}
          </div>
        ) : (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', color:'#bbb', fontSize:13 }}>Select a PO to view details</div>
        )}
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title="New purchase order">
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div><label className="label">Steel grade</label><input type="text" className="input" placeholder="HR Coil IS2062" value={form.steel_grade} onChange={e => setForm({...form, steel_grade:e.target.value})} /></div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
            <div><label className="label">Quantity (t)</label><input type="number" className="input" placeholder="250" value={form.quantity_tonnes} onChange={e => setForm({...form, quantity_tonnes:e.target.value})} /></div>
            <div><label className="label">Price/tonne</label><input type="number" className="input" placeholder="680" value={form.quoted_price_per_tonne} onChange={e => setForm({...form, quoted_price_per_tonne:e.target.value})} /></div>
          </div>
          {form.quantity_tonnes && form.quoted_price_per_tonne && (
            <div style={{ padding:'8px 12px', background:'#F3F0FF', borderRadius:8, fontSize:12 }}>
              Total: <strong>{fmt(parseFloat(form.quantity_tonnes)*parseFloat(form.quoted_price_per_tonne))}</strong>
              {' · '}DDU (1%): <strong>{fmt(parseFloat(form.quantity_tonnes)*parseFloat(form.quoted_price_per_tonne)*0.01)}</strong>
            </div>
          )}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
            <div><label className="label">Currency</label>
              <select className="input" value={form.currency} onChange={e => setForm({...form, currency:e.target.value})}>
                <option>USD</option><option>CAD</option><option>INR</option>
              </select>
            </div>
            <div><label className="label">Required by</label><input type="date" className="input" value={form.required_by_date} onChange={e => setForm({...form, required_by_date:e.target.value})} /></div>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button className="btn-primary" style={{flex:1}} onClick={async () => { try { await procurementAPI.createPO(form); } catch {} setShowForm(false); load(); }}>Submit for approval</button>
            <button className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </div>
      </Modal>
    </AppLayout>
  );
}

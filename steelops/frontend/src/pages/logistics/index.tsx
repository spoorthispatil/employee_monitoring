import React, { useEffect, useState } from 'react';
import { logisticsAPI } from '../../lib/api';
import { AppLayout, PageHeader, KPICard, KPIGrid, Spinner, Modal } from '../../components/shared';
import { useAuth } from '../../hooks/useAuth';

const SC: Record<string,{bg:string;text:string;dot:string}> = {
  loading:       {bg:'#FFF3E0',text:'#E65100',dot:'#FF9800'},
  in_transit:    {bg:'#E3F2FD',text:'#0D47A1',dot:'#2196F3'},
  at_origin_port:{bg:'#E8F5E9',text:'#1B5E20',dot:'#4CAF50'},
  on_vessel:     {bg:'#EDE7F6',text:'#311B92',dot:'#9C27B0'},
  sailing:       {bg:'#E0F7FA',text:'#006064',dot:'#00BCD4'},
  arrived:       {bg:'#F3E5F5',text:'#4A148C',dot:'#CE93D8'},
  delivered:     {bg:'#E8F5E9',text:'#2E7D32',dot:'#4CAF50'},
};
const STEPS = ['loading','in_transit','at_origin_port','on_vessel','sailing','arrived','delivered'];

function PortTimer({ start, portName, rate, currency }: { start:string; portName:string; rate:number; currency:string }) {
  const [hrs, setHrs] = useState(0);
  useEffect(() => {
    const s = new Date(start).getTime();
    const tick = () => setHrs((Date.now()-s)/3600000);
    tick(); const id = setInterval(tick,1000); return () => clearInterval(id);
  },[start]);
  const pct = Math.min(hrs/8*100,100);
  const isOT = hrs>=8, isWarn = hrs>=7&&hrs<8;
  const color = isOT?'#EF5350':isWarn?'#FF9800':'#26A69A';
  const hh = Math.floor(hrs), mm = Math.floor((hrs%1)*60);
  return (
    <div style={{ background:isOT?'#FFEBEE':isWarn?'#FFF3E0':'#E0F2F1', border:`1px solid ${isOT?'#FFCDD2':isWarn?'#FFE0B2':'#B2DFDB'}`, borderRadius:9, padding:'10px 12px', marginTop:8 }}>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
        <span style={{ fontSize:11, fontWeight:700, color, textTransform:'uppercase' }}>{isOT?'⚠ Overtime':isWarn?'⏱ Warning':'🟢 Active'} — {portName}</span>
        <span style={{ fontSize:14, fontWeight:800, fontFamily:'monospace', color }}>{String(hh).padStart(2,'0')}h {String(mm).padStart(2,'0')}m</span>
      </div>
      <div style={{ height:5, background:'rgba(0,0,0,0.1)', borderRadius:99, overflow:'hidden' }}>
        <div style={{ height:'100%', width:`${pct}%`, background:color, borderRadius:99, transition:'width .5s' }} />
      </div>
      <div style={{ display:'flex', justifyContent:'space-between', fontSize:9, color:'#888', marginTop:3 }}>
        <span>0h</span><span>7h warn</span><span>8h limit</span>
      </div>
      {isOT && <div style={{ fontSize:11, color:'#C62828', fontWeight:500, marginTop:4 }}>Overtime: {(hrs-8).toFixed(1)}h × {currency} {rate}/h = {currency} {((hrs-8)*rate).toFixed(0)} extra</div>}
    </div>
  );
}

export default function LogisticsPage() {
  const { isManager } = useAuth();
  const [ships, setShips]   = useState<any[]>([]);
  const [sel, setSel]       = useState<any>(null);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [showShipForm, setShowShipForm] = useState(false);
  const [showPortForm, setShowPortForm] = useState(false);
  const [shipForm, setShipForm] = useState({ origin_port:'', destination_port:'', weight_ordered_tonnes:'', eta:'' });
  const [portForm, setPortForm] = useState({ shipment_id:'', port_name:'', rate_per_hour:'120', currency:'USD' });

  const load = async () => {
    setLoading(true);
    try {
      const r = await logisticsAPI.shipments();
      const d = r.data.data || [];
      setShips(d); if (d.length && !sel) setSel(d[0]);
    } catch {
      const mock = [
        { id:'1', shipment_code:'SHP-2025-0017', status:'sailing', origin_port:'Mumbai Port', destination_port:'Vancouver, CA', container_number:'MSCU3847291', weight_ordered_tonnes:250, weight_loaded_tonnes:248.5, eta:new Date(Date.now()+3*86400000).toISOString(), steel_grade:'HR Coil IS2062', escrow_code:'ESC-2025-0009', days_outstanding:0, insurance_status:'active' },
        { id:'2', shipment_code:'SHP-2025-0016', status:'arrived', origin_port:'Chennai Port', destination_port:'Halifax, CA', weight_ordered_tonnes:180, eta:new Date(Date.now()-86400000).toISOString(), steel_grade:'TMT Bar Fe500', escrow_code:'ESC-2025-0008', days_outstanding:8 },
        { id:'3', shipment_code:'SHP-2025-0018', status:'loading', origin_port:'Kandla Port', destination_port:'Montreal, CA', weight_ordered_tonnes:320, steel_grade:'MS Plate IS2062' },
      ];
      setShips(mock); setSel(mock[0]);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); },[]);

  const updateStatus = async (id:string, status:string) => {
    try { await logisticsAPI.updateStatus(id,{status}); } catch {}
    setShips(p => p.map(s => s.id===id?{...s,status}:s));
    setSel((s:any) => s?.id===id?{...s,status}:s);
  };

  const filtered = filter==='all' ? ships : ships.filter(s=>s.status===filter);
  const active   = ships.filter(s=>s.status!=='delivered').length;
  const sailing  = ships.filter(s=>s.status==='sailing').length;
  const overdue  = ships.filter(s=>(s.days_outstanding||0)>=7).length;

  if (loading) return <AppLayout><Spinner /></AppLayout>;

  return (
    <AppLayout>
      <PageHeader title="Logistics" subtitle={`${ships.length} shipments · ${active} active`}
        action={isManager ? (
          <div style={{display:'flex',gap:8}}>
            <button className="btn-secondary" onClick={()=>setShowPortForm(true)}>+ Port charge</button>
            <button className="btn-primary" onClick={()=>setShowShipForm(true)}>+ Shipment</button>
          </div>
        ):undefined} />
      <KPIGrid>
        <KPICard label="Active"          value={active}                   note="in progress" accent="#534AB7" />
        <KPICard label="Sailing"         value={sailing}                  note="at sea"      accent="#0288D1" />
        <KPICard label="Delivered"       value={ships.filter(s=>s.status==='delivered').length} note="total" accent="#2E7D32" />
        <KPICard label="Overdue escrows" value={overdue}                  note="7+ days"     accent={overdue>0?'#C62828':'#2E7D32'} />
      </KPIGrid>

      <div style={{ display:'grid', gridTemplateColumns:'320px 1fr', gap:0, margin:'16px 24px', height:'calc(100vh - 220px)', minHeight:380 }}>
        {/* List */}
        <div style={{ borderRight:'1px solid #EBEBEB', paddingRight:14, display:'flex', flexDirection:'column', overflow:'hidden' }}>
          <div style={{ display:'flex', gap:5, flexWrap:'wrap', marginBottom:10, flexShrink:0 }}>
            {['all',...STEPS].map(f => (
              <button key={f} onClick={()=>setFilter(f)} style={{ fontSize:10, fontWeight:600, padding:'3px 9px', borderRadius:99, border:'none', cursor:'pointer', background:filter===f?'#534AB7':'#F0F0F0', color:filter===f?'#fff':'#666' }}>
                {f==='all'?`All (${ships.length})`:f.replace(/_/g,' ')}
              </button>
            ))}
          </div>
          <div style={{ flex:1, overflowY:'auto' }}>
            {filtered.map(s => {
              const sc = SC[s.status]||SC.loading;
              const eta = s.eta ? new Date(s.eta).toLocaleDateString('en-GB',{day:'numeric',month:'short'}) : '—';
              const daysLeft = s.eta ? Math.ceil((new Date(s.eta).getTime()-Date.now())/86400000) : null;
              return (
                <div key={s.id} onClick={()=>setSel(s)} style={{ background:sel?.id===s.id?'#F3F0FF':'#fff', border:`1px solid ${sel?.id===s.id?'#7C6FE0':'#EBEBEB'}`, borderRadius:11, padding:'11px 13px', cursor:'pointer', marginBottom:7, boxShadow:sel?.id===s.id?'0 0 0 3px #EDE9FE':'none' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', gap:8 }}>
                    <div>
                      <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3 }}>
                        <span style={{ fontSize:11, fontWeight:700, fontFamily:'monospace', color:'#534AB7' }}>{s.shipment_code}</span>
                        <span style={{ fontSize:9, fontWeight:700, padding:'2px 6px', borderRadius:99, background:sc.bg, color:sc.text }}>
                          <span style={{ display:'inline-block', width:5, height:5, borderRadius:'50%', background:sc.dot, marginRight:3, verticalAlign:'middle' }} />
                          {s.status.replace(/_/g,' ')}
                        </span>
                      </div>
                      <div style={{ fontSize:12, color:'#555', fontWeight:500 }}>{s.origin_port} → {s.destination_port}</div>
                      {s.steel_grade && <div style={{ fontSize:11, color:'#aaa', marginTop:2 }}>{s.steel_grade} · {s.weight_ordered_tonnes}t</div>}
                    </div>
                    <div style={{ textAlign:'right', flexShrink:0 }}>
                      <div style={{ fontSize:11, color:'#aaa' }}>ETA</div>
                      <div style={{ fontSize:13, fontWeight:700, color:daysLeft!==null&&daysLeft<3?'#C62828':'#333' }}>{eta}</div>
                      {daysLeft!==null && !['delivered','arrived'].includes(s.status) && <div style={{ fontSize:10, color:daysLeft<3?'#C62828':'#888' }}>{daysLeft>0?`${daysLeft}d left`:`${Math.abs(daysLeft)}d late`}</div>}
                    </div>
                  </div>
                  {(s.days_outstanding||0)>=7 && <div style={{ marginTop:7, padding:'4px 8px', background:'#FFEBEE', borderRadius:5, fontSize:10, fontWeight:600, color:'#C62828' }}>⚠ Escrow unsigned {s.days_outstanding}d — chase buyer</div>}
                </div>
              );
            })}
          </div>
        </div>

        {/* Detail */}
        {sel ? (
          <div style={{ paddingLeft:20, overflowY:'auto' }}>
            <div style={{ fontSize:18, fontWeight:800, fontFamily:'monospace', color:'#534AB7', marginBottom:3 }}>{sel.shipment_code}</div>
            <div style={{ fontSize:12, color:'#666', marginBottom:14 }}>{sel.origin_port} → {sel.destination_port} {sel.steel_grade&&`· ${sel.steel_grade} · ${sel.weight_ordered_tonnes}t`}</div>

            {/* Stepper */}
            <div style={{ fontSize:10, fontWeight:700, color:'#888', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:8 }}>Journey progress</div>
            <div style={{ display:'flex', alignItems:'flex-end', marginBottom:18 }}>
              {STEPS.map((step,i) => {
                const ci = STEPS.indexOf(sel.status);
                const done=i<ci, active=i===ci;
                return (
                  <React.Fragment key={step}>
                    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', flex:1 }}>
                      <div style={{ width:16, height:16, borderRadius:'50%', background:done?'#534AB7':active?'#fff':'#E0E0E0', border:active?'3px solid #534AB7':done?'none':'2px solid #CCC', display:'flex', alignItems:'center', justifyContent:'center' }}>
                        {done && <svg width="8" height="6" viewBox="0 0 8 6"><path d="M1 3l2 2L7 1" stroke="#fff" strokeWidth="1.6" fill="none" strokeLinecap="round"/></svg>}
                      </div>
                      <div style={{ fontSize:8.5, textAlign:'center', marginTop:4, lineHeight:1.3, color:active||done?'#534AB7':'#CCC', fontWeight:active?700:400, maxWidth:44, whiteSpace:'pre-line' }}>{step.replace(/_/g,'\n')}</div>
                    </div>
                    {i<STEPS.length-1 && <div style={{ height:2, flex:0.4, marginBottom:18, background:i<STEPS.indexOf(sel.status)?'#534AB7':'#E0E0E0' }} />}
                  </React.Fragment>
                );
              })}
            </div>

            {/* Details */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px 16px', marginBottom:14 }}>
              {[['Container',sel.container_number||'—'],['Seal',sel.seal_number||'—'],['Ordered',`${sel.weight_ordered_tonnes}t`],['Loaded',sel.weight_loaded_tonnes?`${sel.weight_loaded_tonnes}t`:'—'],['ETD',sel.etd?new Date(sel.etd).toLocaleDateString():'—'],['ATD',sel.atd?new Date(sel.atd).toLocaleDateString():'—'],['ETA',sel.eta?new Date(sel.eta).toLocaleDateString():'—'],['ATA',sel.ata?new Date(sel.ata).toLocaleDateString():'—']].map(([k,v])=>(
                <div key={k} style={{ borderBottom:'1px solid #F0F0F0', paddingBottom:5 }}>
                  <div style={{ fontSize:9, color:'#BBB', textTransform:'uppercase', letterSpacing:'.04em', marginBottom:1 }}>{k}</div>
                  <div style={{ fontSize:12, fontWeight:600, color:'#333' }}>{v}</div>
                </div>
              ))}
            </div>

            {/* Status update */}
            {isManager && sel.status !== 'delivered' && (
              <div style={{ marginTop:12 }}>
                <div style={{ fontSize:11, fontWeight:700, color:'#888', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:8 }}>Update status</div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
                  {STEPS.slice(STEPS.indexOf(sel.status)+1).map(s => (
                    <button key={s} onClick={()=>updateStatus(sel.id,s)} style={{ padding:'7px 10px', fontSize:11, fontWeight:600, background:s==='delivered'?'#534AB7':'#F5F5F5', color:s==='delivered'?'#fff':'#444', border:'none', borderRadius:8, cursor:'pointer', textTransform:'capitalize' }}>
                      → {s.replace(/_/g,' ')}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', color:'#bbb', fontSize:13 }}>Select a shipment</div>
        )}
      </div>

      <Modal open={showShipForm} onClose={()=>setShowShipForm(false)} title="Create shipment">
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {[{l:'Origin port',k:'origin_port',p:'Mumbai Port'},{l:'Destination port',k:'destination_port',p:'Vancouver, CA'},{l:'Weight (tonnes)',k:'weight_ordered_tonnes',p:'250',t:'number'},{l:'ETA',k:'eta',t:'date',p:''}].map(f=>(
            <div key={f.k}><label className="label">{f.l}</label><input type={f.t||'text'} className="input" placeholder={f.p} value={(shipForm as any)[f.k]} onChange={e=>setShipForm({...shipForm,[f.k]:e.target.value})} /></div>
          ))}
          <div style={{ display:'flex', gap:8 }}><button className="btn-primary" style={{flex:1}} onClick={async()=>{ try{await logisticsAPI.createShipment(shipForm);}catch{} setShowShipForm(false); load(); }}>Create</button><button className="btn-secondary" onClick={()=>setShowShipForm(false)}>Cancel</button></div>
        </div>
      </Modal>

      <Modal open={showPortForm} onClose={()=>setShowPortForm(false)} title="Start port charge timer">
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div><label className="label">Shipment</label>
            <select className="input" value={portForm.shipment_id} onChange={e=>setPortForm({...portForm,shipment_id:e.target.value})}>
              <option value="">Select...</option>
              {ships.filter(s=>['arrived','at_origin_port'].includes(s.status)).map(s=><option key={s.id} value={s.id}>{s.shipment_code}</option>)}
            </select>
          </div>
          <div><label className="label">Port name</label><input type="text" className="input" placeholder="Halifax Terminal" value={portForm.port_name} onChange={e=>setPortForm({...portForm,port_name:e.target.value})} /></div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            <div><label className="label">Rate/hr</label><input type="number" className="input" value={portForm.rate_per_hour} onChange={e=>setPortForm({...portForm,rate_per_hour:e.target.value})} /></div>
            <div><label className="label">Currency</label><select className="input" value={portForm.currency} onChange={e=>setPortForm({...portForm,currency:e.target.value})}><option>USD</option><option>CAD</option></select></div>
          </div>
          <div style={{padding:'8px 12px',background:'#FFF8E1',borderRadius:8,fontSize:11,color:'#E65100'}}>⏱ Timer starts now. Alert at hour 7, overtime at hour 8.</div>
          <div style={{display:'flex',gap:8}}><button className="btn-primary" style={{flex:1}} onClick={async()=>{ try{await logisticsAPI.createPortCharge({...portForm,unload_start:new Date().toISOString()});}catch{} setShowPortForm(false); }}>Start timer</button><button className="btn-secondary" onClick={()=>setShowPortForm(false)}>Cancel</button></div>
        </div>
      </Modal>
    </AppLayout>
  );
}

import React,{useEffect,useState}from'react';
import{financeAPI}from'../../lib/api';
import{AppLayout,PageHeader,KPICard,KPIGrid,Spinner,Modal}from'../../components/shared';
import{useAuth}from'../../hooks/useAuth';

const ESC_C:Record<string,{bg:string;text:string}>={
  not_opened:{bg:'#F5F5F5',text:'#888'},open:{bg:'#E3F2FD',text:'#0D47A1'},
  delivery_confirmed:{bg:'#FFF8E1',text:'#E65100'},signed:{bg:'#E8F5E9',text:'#2E7D32'},disputed:{bg:'#FFEBEE',text:'#C62828'},
};
const INV_C:Record<string,{bg:string;text:string}>={
  pending_approval:{bg:'#FFF3E0',text:'#E65100'},approved:{bg:'#E3F2FD',text:'#0D47A1'},paid:{bg:'#E8F5E9',text:'#2E7D32'},disputed:{bg:'#FFEBEE',text:'#C62828'},
};

const fmt=(v:number,c='USD')=>new Intl.NumberFormat('en-US',{style:'currency',currency:c,maximumFractionDigits:0}).format(v);

export default function FinancePage(){
  const{isManager}=useAuth();
  const[tab,setTab]=useState<'escrows'|'invoices'|'insurance'>('escrows');
  const[escrows,setEscrows]=useState<any[]>([]);
  const[invoices,setInvoices]=useState<any[]>([]);
  const[selEsc,setSelEsc]=useState<any>(null);
  const[ledger,setLedger]=useState<'all'|'india'|'canada'>('all');
  const[loading,setLoading]=useState(true);
  const[loadError,setLoadError]=useState<string|null>(null);

  const load=()=>{
    setLoading(true);
    setLoadError(null);
    Promise.all([financeAPI.escrows(),financeAPI.invoices()])
      .then(([e,i])=>{setEscrows(e.data.data||[]);setInvoices(i.data.data||[]);})
      .catch(()=>setLoadError('Could not load finance data — check your connection and try again.'))
      .finally(()=>setLoading(false));
  };

  useEffect(()=>{load();},[]);

  useEffect(()=>{if(escrows.length&&!selEsc)setSelEsc(escrows[0]);},[escrows]);

  const signEscrow=async(id:string)=>{
    try{
      await financeAPI.signEscrow(id);
      setEscrows(p=>p.map(e=>e.id===id?{...e,status:'signed',signed_at:new Date().toISOString()}:e));
    }catch{setLoadError('Could not sign escrow — please retry.');}
  };
  const approveInv=async(id:string)=>{
    try{
      await financeAPI.approveInvoice(id);
      setInvoices(p=>p.map(i=>i.id===id?{...i,status:'approved'}:i));
    }catch{setLoadError('Could not approve invoice — please retry.');}
  };

  const overdue=escrows.filter(e=>(e.days_outstanding||0)>=7).length;
  const locked=escrows.filter(e=>['open','delivery_confirmed'].includes(e.status)).reduce((s:number,e:any)=>s+e.value,0);
  const filtInv=ledger==='all'?invoices:invoices.filter(i=>i.ledger===ledger);

  if(loading)return<AppLayout><Spinner/></AppLayout>;

  return(
    <AppLayout>
      <PageHeader title="Finance" subtitle="Escrow · Invoices · Insurance · Dual-country ledger"
        action={isManager?(<div style={{display:'flex',gap:8}}><button className="btn-primary" style={{fontSize:12}}>+ Escrow</button></div>):undefined}/>
      {loadError && (
        <div style={{ margin:'0 24px 16px', padding:'10px 14px', background:'#FFEBEE', border:'1px solid #FFCDD2', borderRadius:9, display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
          <span style={{ fontSize:12, color:'#C62828' }}>{loadError}</span>
          <button className="btn-secondary" style={{fontSize:11, padding:'4px 10px'}} onClick={load}>Retry</button>
        </div>
      )}
      <KPIGrid>
        <KPICard label="Value in escrow"  value={fmt(locked)}         note="open+confirmed"   accent="#534AB7"/>
        <KPICard label="Overdue escrows"  value={overdue}             note="7+ days"          accent={overdue>0?'#C62828':'#1D9E75'}/>
        <KPICard label="Pending invoices" value={invoices.filter(i=>i.status==='pending_approval').length} note="need approval" accent="#E65100"/>
        <KPICard label="India costs"      value={fmt(invoices.filter(i=>i.ledger==='india').reduce((s:number,i:any)=>s+i.amount,0),'INR')} note="this month"/>
        <KPICard label="Canada costs"     value={fmt(invoices.filter(i=>i.ledger==='canada').reduce((s:number,i:any)=>s+i.amount,0),'CAD')} note="this month"/>
      </KPIGrid>

      <div style={{display:'flex',gap:0,padding:'14px 24px 0',borderBottom:'1px solid #EBEBEB',marginTop:4}}>
        {(['escrows','invoices','insurance'] as const).map(t=>(
          <button key={t} onClick={()=>setTab(t)} style={{padding:'8px 16px',fontSize:13,fontWeight:tab===t?700:400,color:tab===t?'#534AB7':'#888',background:'none',border:'none',cursor:'pointer',borderBottom:tab===t?'2px solid #534AB7':'2px solid transparent',marginBottom:-1}}>
            {t.charAt(0).toUpperCase()+t.slice(1)}
          </button>
        ))}
      </div>

      {tab==='escrows'&&(
        <div style={{display:'grid',gridTemplateColumns:'380px 1fr',gap:0,margin:'16px 24px',height:'calc(100vh - 260px)'}}>
          <div style={{borderRight:'1px solid #EBEBEB',paddingRight:16,overflowY:'auto'}}>
            {[...escrows].sort((a,b)=>(b.days_outstanding||0)-(a.days_outstanding||0)).map(e=>{
              const ec=ESC_C[e.status]||ESC_C.not_opened;
              const urgent=(e.days_outstanding||0)>=7;
              return(
                <div key={e.id} onClick={()=>setSelEsc(e)} style={{background:selEsc?.id===e.id?'#F3F0FF':urgent?'#FFFDE7':'#fff',border:`1px solid ${selEsc?.id===e.id?'#7C6FE0':urgent?'#FFE082':'#EBEBEB'}`,borderRadius:11,padding:'11px 13px',cursor:'pointer',marginBottom:7,boxShadow:selEsc?.id===e.id?'0 0 0 3px #EDE9FE':'none'}}>
                  <div style={{display:'flex',justifyContent:'space-between',gap:8}}>
                    <div>
                      <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:3,flexWrap:'wrap'}}>
                        <span style={{fontSize:11,fontWeight:700,fontFamily:'monospace',color:'#534AB7'}}>{e.escrow_code}</span>
                        <span style={{fontSize:9,fontWeight:700,padding:'2px 7px',borderRadius:99,background:ec.bg,color:ec.text}}>{e.status.replace(/_/g,' ')}</span>
                        {urgent&&<span style={{fontSize:9,fontWeight:700,padding:'2px 7px',borderRadius:99,background:'#FFEBEE',color:'#C62828'}}>⚠ {e.days_outstanding}d overdue</span>}
                      </div>
                      <div style={{fontSize:12,fontWeight:600,color:'#222'}}>{e.client_name}</div>
                      <div style={{fontSize:11,color:'#888'}}>{e.shipment_code}</div>
                    </div>
                    <div style={{fontSize:15,fontWeight:800,color:e.status==='signed'?'#2E7D32':'#1A1A1A',flexShrink:0}}>{fmt(e.value,e.currency)}</div>
                  </div>
                  {isManager&&e.status==='delivery_confirmed'&&(
                    <button onClick={ev=>{ev.stopPropagation();signEscrow(e.id);}} style={{marginTop:8,width:'100%',padding:'6px 0',background:'#534AB7',color:'#fff',border:'none',borderRadius:7,fontSize:11,fontWeight:700,cursor:'pointer'}}>
                      ✓ Mark signed — release commissions
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {selEsc&&(
            <div style={{paddingLeft:20,overflowY:'auto'}}>
              <div style={{fontSize:18,fontWeight:800,fontFamily:'monospace',color:'#534AB7',marginBottom:3}}>{selEsc.escrow_code}</div>
              <div style={{fontSize:13,color:'#666',marginBottom:16}}>{selEsc.client_name} · {selEsc.shipment_code}</div>
              <div style={{background:'#F8F5FF',border:'1px solid #D4C8FF',borderRadius:12,padding:'16px 18px',marginBottom:16}}>
                <div style={{fontSize:10,color:'#9575CD',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:4}}>Escrow value</div>
                <div style={{fontSize:28,fontWeight:800,color:'#4527A0'}}>{fmt(selEsc.value,selEsc.currency)}</div>
              </div>
              <div>
                {[{label:'Escrow opened',date:selEsc.opened_at,done:!!selEsc.opened_at},{label:'Delivery confirmed',date:selEsc.delivery_confirmed_at,done:!!selEsc.delivery_confirmed_at},{label:'Buyer signed — paid',date:selEsc.signed_at,done:!!selEsc.signed_at}].map((step,i)=>(
                  <div key={i} style={{display:'flex',alignItems:'flex-start',gap:12,marginBottom:12}}>
                    <div style={{display:'flex',flexDirection:'column',alignItems:'center',flexShrink:0}}>
                      <div style={{width:20,height:20,borderRadius:'50%',background:step.done?'#534AB7':'#F0F0F0',border:step.done?'none':'2px solid #DDD',display:'flex',alignItems:'center',justifyContent:'center'}}>
                        {step.done&&<svg width="10" height="8" viewBox="0 0 10 8"><path d="M1 4l2.5 2.5L9 1" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round"/></svg>}
                      </div>
                      {i<2&&<div style={{width:1,height:20,background:step.done?'#534AB7':'#EEE',marginTop:2}}/>}
                    </div>
                    <div>
                      <div style={{fontSize:12,fontWeight:600,color:step.done?'#333':'#BBB'}}>{step.label}</div>
                      {step.date&&<div style={{fontSize:11,color:'#aaa',marginTop:2}}>{new Date(step.date).toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab==='invoices'&&(
        <div style={{margin:'16px 24px'}}>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
            <span style={{fontSize:12,color:'#888'}}>Ledger:</span>
            {(['all','india','canada'] as const).map(l=>(
              <button key={l} onClick={()=>setLedger(l)} style={{padding:'4px 12px',fontSize:12,fontWeight:600,borderRadius:99,border:'none',cursor:'pointer',background:ledger===l?'#534AB7':'#F0F0F0',color:ledger===l?'#fff':'#666'}}>
                {l==='india'?'🇮🇳 ':l==='canada'?'🇨🇦 ':''}{l.charAt(0).toUpperCase()+l.slice(1)}
              </button>
            ))}
          </div>
          <div style={{background:'#fff',border:'1px solid #EBEBEB',borderRadius:12,overflow:'hidden'}}>
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead><tr style={{background:'#FAFAFA'}}>
                {['Invoice #','Type','Amount','Ledger','Status','Date','Action'].map(h=>(
                  <th key={h} style={{padding:'9px 12px',fontSize:10,fontWeight:700,color:'#AAA',textTransform:'uppercase',letterSpacing:'.05em',textAlign:'left',borderBottom:'1px solid #EBEBEB'}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {filtInv.map(inv=>{
                  const sc=INV_C[inv.status]||{bg:'#F5F5F5',text:'#888'};
                  return(
                    <tr key={inv.id}>
                      <td style={{padding:'9px 12px',borderBottom:'1px solid #F5F5F5',fontFamily:'monospace',fontSize:11,fontWeight:700,color:'#534AB7'}}>{inv.invoice_number}</td>
                      <td style={{padding:'9px 12px',borderBottom:'1px solid #F5F5F5',fontSize:11,color:'#555',textTransform:'capitalize'}}>{inv.invoice_type.replace(/_/g,' ')}</td>
                      <td style={{padding:'9px 12px',borderBottom:'1px solid #F5F5F5',fontWeight:700}}>{fmt(inv.amount,inv.currency)}</td>
                      <td style={{padding:'9px 12px',borderBottom:'1px solid #F5F5F5'}}><span style={{fontSize:10,padding:'2px 7px',borderRadius:99,background:inv.ledger==='india'?'#E8F5E9':'#E3F2FD',color:inv.ledger==='india'?'#2E7D32':'#0D47A1'}}>{inv.ledger==='india'?'🇮🇳':'🇨🇦'} {inv.ledger}</span></td>
                      <td style={{padding:'9px 12px',borderBottom:'1px solid #F5F5F5'}}><span style={{fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:99,background:sc.bg,color:sc.text}}>{inv.status.replace(/_/g,' ')}</span></td>
                      <td style={{padding:'9px 12px',borderBottom:'1px solid #F5F5F5',fontSize:11,color:'#aaa'}}>{new Date(inv.created_at).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</td>
                      <td style={{padding:'9px 12px',borderBottom:'1px solid #F5F5F5'}}>
                        {isManager&&inv.status==='pending_approval'&&<button onClick={()=>approveInv(inv.id)} style={{padding:'4px 10px',fontSize:11,fontWeight:700,background:'#534AB7',color:'#fff',border:'none',borderRadius:6,cursor:'pointer'}}>Approve</button>}
                        {inv.status==='approved'&&<span style={{fontSize:11,color:'#0D47A1'}}>✓ Approved</span>}
                        {inv.status==='paid'&&<span style={{fontSize:11,color:'#2E7D32'}}>✓ Paid</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab==='insurance'&&(
        <div style={{margin:'16px 24px'}}>
          <div style={{background:'#fff',border:'1px solid #EBEBEB',borderRadius:12,padding:20,textAlign:'center',color:'#888'}}>
            <div style={{fontSize:32,marginBottom:8}}>🛡️</div>
            <div style={{fontSize:13,fontWeight:500,color:'#555'}}>Insurance policies tracked per shipment</div>
            <div style={{fontSize:12,color:'#aaa',marginTop:4}}>DDU premium auto-calculated at 1% of shipment value on PO creation</div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}

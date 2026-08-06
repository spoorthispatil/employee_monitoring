import React,{useEffect,useState}from'react';
import{manufacturingAPI}from'../../lib/api';
import{AppLayout,PageHeader,KPICard,KPIGrid,Spinner,Modal,TierBadge}from'../../components/shared';
import{useAuth}from'../../hooks/useAuth';

const BATCH_C:Record<string,{bg:string;text:string;dot:string}>={
  ordered:{bg:'#F3F0FF',text:'#4527A0',dot:'#7C4DFF'},
  in_production:{bg:'#E3F2FD',text:'#0D47A1',dot:'#2196F3'},
  ready_at_mill:{bg:'#E8F5E9',text:'#2E7D32',dot:'#4CAF50'},
  dispatched:{bg:'#E0F7FA',text:'#006064',dot:'#00BCD4'},
  sgs_failed:{bg:'#FFEBEE',text:'#C62828',dot:'#EF5350'},
};

export default function ManufacturingPage(){
  const{isManager}=useAuth();
  const[tab,setTab]=useState<'agents'|'batches'|'mills'>('agents');
  const[agents,setAgents]=useState<any[]>([]);
  const[batches,setBatches]=useState<any[]>([]);
  const[loading,setLoading]=useState(true);
  const[selAgent,setSelAgent]=useState<any>(null);
  const[showTask,setShowTask]=useState(false);
  const[taskForm,setTaskForm]=useState({agent_id:'',steel_grade:'',quantity_tonnes:'',deadline:''});
  const[loadError,setLoadError]=useState<string|null>(null);

  const load=()=>{
    setLoading(true);
    setLoadError(null);
    Promise.all([manufacturingAPI.agents(),manufacturingAPI.batches()])
      .then(([a,b])=>{setAgents(a.data.data||[]);setBatches(b.data.data||[]);})
      .catch(()=>setLoadError('Could not load manufacturing data — check your connection and try again.'))
      .finally(()=>setLoading(false));
  };

  useEffect(()=>{load();},[]);

  const markReady=async(id:string)=>{
    try{
      await manufacturingAPI.markReady(id,{confirmed_tonnes:batches.find(b=>b.id===id)?.ordered_tonnes});
      setBatches(p=>p.map(b=>b.id===id?{...b,status:'ready_at_mill'}:b));
    }catch{setLoadError('Could not mark batch ready — please retry.');}
  };

  const totalTonnes=agents.reduce((s:number,a:any)=>s+(a.total_tonnes_this_month||0),0);
  const avgSGS=agents.length?(agents.reduce((s:number,a:any)=>s+(a.sgs_pass_rate||0),0)/agents.length).toFixed(1):0;

  if(loading)return<AppLayout><Spinner/></AppLayout>;

  return(
    <AppLayout>
      <PageHeader title="Manufacturing" subtitle={`${agents.length} sourcing agents · ${batches.length} active batches`}
        action={isManager?<button className="btn-primary" style={{fontSize:12}} onClick={()=>setShowTask(true)}>+ Assign task</button>:undefined}/>
      {loadError && (
        <div style={{ margin:'0 24px 16px', padding:'10px 14px', background:'#FFEBEE', border:'1px solid #FFCDD2', borderRadius:9, display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
          <span style={{ fontSize:12, color:'#C62828' }}>{loadError}</span>
          <button className="btn-secondary" style={{fontSize:11, padding:'4px 10px'}} onClick={load}>Retry</button>
        </div>
      )}
      <KPIGrid>
        <KPICard label="Active agents"     value={agents.filter((a:any)=>a.status!=='inactive').length} accent="#534AB7"/>
        <KPICard label="Tonnes this month" value={`${totalTonnes}t`} accent="#2E7D32"/>
        <KPICard label="Avg SGS pass"      value={`${avgSGS}%`} accent={parseFloat(String(avgSGS))>=85?'#2E7D32':'#E65100'}/>
        <KPICard label="Top performers"    value={agents.filter((a:any)=>a.perf_tier==='top').length} note="score ≥ 80" accent="#2E7D32"/>
        <KPICard label="Poor performers"   value={agents.filter((a:any)=>a.perf_tier==='poor').length} note="score < 50" accent={agents.filter((a:any)=>a.perf_tier==='poor').length>0?'#C62828':'#2E7D32'}/>
        <KPICard label="Overdue tasks"     value={agents.reduce((s:number,a:any)=>s+(a.overdue_tasks||0),0)} accent="#E65100"/>
      </KPIGrid>

      <div style={{display:'flex',gap:0,padding:'14px 24px 0',borderBottom:'1px solid #EBEBEB',marginTop:4}}>
        {['agents','batches','mills'].map(t=>(
          <button key={t} onClick={()=>setTab(t as any)} style={{padding:'8px 16px',fontSize:13,fontWeight:tab===t?700:400,color:tab===t?'#534AB7':'#888',background:'none',border:'none',cursor:'pointer',borderBottom:tab===t?'2px solid #534AB7':'2px solid transparent',marginBottom:-1}}>
            {t.charAt(0).toUpperCase()+t.slice(1)}
          </button>
        ))}
      </div>

      {tab==='agents'&&(
        <div style={{display:'grid',gridTemplateColumns:'1fr 300px',gap:16,margin:'16px 24px'}}>
          <div style={{background:'#fff',border:'1px solid #EBEBEB',borderRadius:12,overflow:'hidden'}}>
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead><tr style={{background:'#FAFAFA'}}>
                {['#','Agent','Region','Tonnes','SGS%','Turnaround','Overdue','Score','Tier'].map(h=>(
                  <th key={h} style={{padding:'9px 12px',fontSize:10,fontWeight:700,color:'#AAA',textTransform:'uppercase',letterSpacing:'.05em',textAlign:'left',borderBottom:'1px solid #EBEBEB'}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {[...agents].sort((a:any,b:any)=>(b.perf_score||0)-(a.perf_score||0)).map((a:any,i:number)=>(
                  <tr key={a.id} onClick={()=>setSelAgent(a)} style={{cursor:'pointer',background:selAgent?.id===a.id?'#F8F5FF':i%2===0?'#fff':'#FAFAFA'}}>
                    <td style={{padding:'9px 12px',borderBottom:'1px solid #F5F5F5',fontSize:12,fontWeight:700,color:i===0?'#FF8F00':i===1?'#9E9E9E':i===2?'#795548':'#CCC'}}>#{i+1}</td>
                    <td style={{padding:'9px 12px',borderBottom:'1px solid #F5F5F5'}}>
                      <div style={{fontSize:13,fontWeight:600}}>{a.full_name}</div>
                      <div style={{fontSize:11,color:'#aaa'}}>{a.email}</div>
                    </td>
                    <td style={{padding:'9px 12px',borderBottom:'1px solid #F5F5F5',fontSize:12,color:'#555'}}>{a.region||'—'}</td>
                    <td style={{padding:'9px 12px',borderBottom:'1px solid #F5F5F5',fontWeight:700,color:'#2E7D32'}}>{a.total_tonnes_this_month||0}t</td>
                    <td style={{padding:'9px 12px',borderBottom:'1px solid #F5F5F5',fontSize:12,fontWeight:600,color:(a.sgs_pass_rate||0)>=85?'#2E7D32':(a.sgs_pass_rate||0)>=70?'#E65100':'#C62828'}}>{a.sgs_pass_rate||0}%</td>
                    <td style={{padding:'9px 12px',borderBottom:'1px solid #F5F5F5',fontSize:12,color:'#555'}}>{a.avg_task_turnaround_days?parseFloat(a.avg_task_turnaround_days).toFixed(1):'—'}d</td>
                    <td style={{padding:'9px 12px',borderBottom:'1px solid #F5F5F5'}}>
                      {(a.overdue_tasks||0)>0?<span style={{fontSize:11,fontWeight:700,padding:'2px 7px',borderRadius:99,background:'#FFEBEE',color:'#C62828'}}>{a.overdue_tasks}</span>:<span style={{fontSize:11,color:'#4CAF50'}}>✓</span>}
                    </td>
                    <td style={{padding:'9px 12px',borderBottom:'1px solid #F5F5F5',fontWeight:700,color:(a.perf_score||0)>=80?'#2E7D32':(a.perf_score||0)>=50?'#534AB7':'#C62828'}}>{a.perf_score||0}</td>
                    <td style={{padding:'9px 12px',borderBottom:'1px solid #F5F5F5'}}><TierBadge tier={a.perf_tier}/></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            {selAgent?(
              <div style={{background:'#fff',border:'1px solid #EBEBEB',borderRadius:12,padding:16}}>
                <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}>
                  <div style={{width:40,height:40,borderRadius:'50%',background:'#EEEDFE',display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,fontWeight:700,color:'#534AB7'}}>{selAgent.full_name.slice(0,2).toUpperCase()}</div>
                  <div><div style={{fontSize:14,fontWeight:700}}>{selAgent.full_name}</div><div style={{fontSize:11,color:'#aaa'}}>{selAgent.region}</div></div>
                  <TierBadge tier={selAgent.perf_tier}/>
                </div>
                <div style={{textAlign:'center',padding:'12px 0',background:'#FAFAFA',borderRadius:10,marginBottom:14}}>
                  <div style={{fontSize:36,fontWeight:800,color:(selAgent.perf_score||0)>=80?'#2E7D32':(selAgent.perf_score||0)>=50?'#534AB7':'#C62828'}}>{selAgent.perf_score||0}</div>
                  <div style={{fontSize:11,color:'#aaa'}}>Weekly performance score</div>
                </div>
                {[['Tonnes/month',`${selAgent.total_tonnes_this_month||0}t`],['SGS pass rate',`${selAgent.sgs_pass_rate||0}%`],['Avg turnaround',`${selAgent.avg_task_turnaround_days?parseFloat(selAgent.avg_task_turnaround_days).toFixed(1)+'d':'—'}`],['Overdue tasks',String(selAgent.overdue_tasks||0)]].map(([k,v])=>(
                  <div key={k} style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid #F5F5F5',fontSize:12}}>
                    <span style={{color:'#888'}}>{k}</span><span style={{fontWeight:700}}>{v}</span>
                  </div>
                ))}
                {isManager&&<button onClick={()=>{setTaskForm({...taskForm,agent_id:selAgent.id});setShowTask(true);}} className="btn-primary" style={{width:'100%',marginTop:14,fontSize:12,textAlign:'center'}}>Assign task</button>}
              </div>
            ):<div style={{background:'#F9F9F9',border:'1px dashed #DDD',borderRadius:12,padding:40,textAlign:'center',color:'#bbb',fontSize:13}}>Click an agent to see details</div>}
          </div>
        </div>
      )}

      {tab==='batches'&&(
        <div style={{margin:'16px 24px',display:'flex',flexDirection:'column',gap:8}}>
          {batches.map(b=>{
            const sc=BATCH_C[b.status]||BATCH_C.ordered;
            return(
              <div key={b.id} style={{background:b.status==='sgs_failed'?'#FFEBEE':b.status==='ready_at_mill'?'#F1F8E9':'#fff',border:`1px solid ${b.status==='sgs_failed'?'#FFCDD2':b.status==='ready_at_mill'?'#C8E6C9':'#EBEBEB'}`,borderRadius:12,padding:'12px 16px',display:'grid',gridTemplateColumns:'1fr auto',gap:12,alignItems:'center'}}>
                <div>
                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4,flexWrap:'wrap'}}>
                    <span style={{fontSize:12,fontFamily:'monospace',fontWeight:700,color:'#534AB7'}}>{b.batch_code}</span>
                    <span style={{fontSize:9,fontWeight:700,padding:'2px 7px',borderRadius:99,background:sc.bg,color:sc.text}}>{b.status.replace(/_/g,' ')}</span>
                    {b.sgs_status==='pass'&&<span style={{fontSize:9,fontWeight:700,padding:'2px 7px',borderRadius:99,background:'#E8F5E9',color:'#2E7D32'}}>SGS ✓</span>}
                    {b.sgs_status==='fail'&&<span style={{fontSize:9,fontWeight:700,padding:'2px 7px',borderRadius:99,background:'#FFEBEE',color:'#C62828'}}>SGS ✗ FAILED</span>}
                  </div>
                  <div style={{fontSize:13,fontWeight:600,color:'#222'}}>{b.steel_grade}</div>
                  <div style={{fontSize:11,color:'#888',marginTop:2}}>{b.mill_name}{b.agent_name&&` · Agent: ${b.agent_name}`} · {b.ordered_tonnes}t</div>
                  <div style={{fontSize:11,color:'#aaa',marginTop:2}}>Ready by: <strong>{b.promised_ready_date}</strong></div>
                </div>
                <div>
                  {isManager&&b.status==='in_production'&&<button onClick={()=>markReady(b.id)} style={{padding:'6px 12px',fontSize:11,fontWeight:700,background:'#4CAF50',color:'#fff',border:'none',borderRadius:8,cursor:'pointer'}}>Mark ready ✓</button>}
                  {b.status==='sgs_failed'&&isManager&&<button style={{padding:'6px 12px',fontSize:11,fontWeight:700,background:'#EF5350',color:'#fff',border:'none',borderRadius:8,cursor:'pointer'}}>Re-source</button>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab==='mills'&&(
        <div style={{margin:'16px 24px',textAlign:'center',padding:40,color:'#888'}}>
          <div style={{fontSize:32,marginBottom:8}}>🏭</div>
          <div style={{fontSize:13,fontWeight:500,color:'#555'}}>5 mills seeded in database</div>
          <div style={{fontSize:12,color:'#aaa',marginTop:4}}>Tata Steel, JSW Steel, SAIL Bhilai, Vizag Steel, Shyam Metalics (flagged)</div>
        </div>
      )}

      <Modal open={showTask} onClose={()=>setShowTask(false)} title="Assign sourcing task">
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          <div><label className="label">Agent</label>
            <select className="input" value={taskForm.agent_id} onChange={e=>setTaskForm({...taskForm,agent_id:e.target.value})}>
              <option value="">Select agent...</option>
              {agents.map((a:any)=><option key={a.id} value={a.id}>{a.full_name} — {a.region}</option>)}
            </select>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            <div><label className="label">Steel grade</label><input type="text" className="input" placeholder="HR Coil IS2062" value={taskForm.steel_grade} onChange={e=>setTaskForm({...taskForm,steel_grade:e.target.value})}/></div>
            <div><label className="label">Tonnes</label><input type="number" className="input" placeholder="250" value={taskForm.quantity_tonnes} onChange={e=>setTaskForm({...taskForm,quantity_tonnes:e.target.value})}/></div>
          </div>
          <div><label className="label">Deadline</label><input type="date" className="input" value={taskForm.deadline} onChange={e=>setTaskForm({...taskForm,deadline:e.target.value})}/></div>
          <div style={{display:'flex',gap:8}}>
            <button className="btn-primary" style={{flex:1}} onClick={async()=>{try{await manufacturingAPI.createTask(taskForm);}catch{}setShowTask(false);}}>Assign</button>
            <button className="btn-secondary" onClick={()=>setShowTask(false)}>Cancel</button>
          </div>
        </div>
      </Modal>
    </AppLayout>
  );
}

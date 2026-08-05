import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { hrAPI } from '../../lib/api';
import { AppLayout, PageHeader, KPICard, KPIGrid, Spinner, Modal, TierBadge, StatusBadge } from '../../components/shared';
import { useAuth } from '../../hooks/useAuth';

const LOC_ICON: Record<string,string> = { india:'🇮🇳', canada:'🇨🇦', field:'🏗️' };
const TYPE_C: Record<string,{bg:string;text:string}> = {
  employee:  {bg:'#E3F2FD',text:'#0D47A1'},
  contractor:{bg:'#F3E5F5',text:'#6A1B9A'},
  agent:     {bg:'#E8F5E9',text:'#2E7D32'},
};

export default function HREmployeesPage() {
  const { isHR, isManager } = useAuth();
  const [employees, setEmployees] = useState<any[]>([]);
  const [selected, setSelected]   = useState<any>(null);
  const [perf, setPerf]           = useState<any[]>([]);
  const [warnings, setWarnings]   = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [deptFilter, setDeptFilter] = useState('all');
  const [showWarn, setShowWarn]   = useState(false);
  const [showAdd, setShowAdd]     = useState(false);
  const [warnForm, setWarnForm]   = useState({ level:'verbal', reason:'' });
  const [addForm, setAddForm]     = useState({ full_name:'', email:'', password:'', contract_type:'employee', location:'india', join_date:'' });
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadEmployees = () => {
    setLoading(true);
    setLoadError(null);
    hrAPI.employees()
      .then(r => setEmployees(r.data.data || []))
      .catch(() => setLoadError('Could not load employees — check your connection and try again.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadEmployees(); }, []);

  const selectEmp = async (emp: any) => {
    setSelected(emp);
    try { const r = await hrAPI.performance(emp.id); setPerf(r.data.data || []); }
    catch { setPerf([]); }
    try { const w = await hrAPI.warnings(emp.id); setWarnings(w.data.data || []); }
    catch { setWarnings([]); }
  };

  const issueWarning = async () => {
    if (!selected) return;
    try {
      await hrAPI.issueWarning({ employee_id: selected.id, ...warnForm });
      const w = await hrAPI.warnings(selected.id);
      setWarnings(w.data.data || []);
    } catch {
      // leave the modal's error state to the button below; don't fabricate a warning entry
    }
    setShowWarn(false); setWarnForm({ level:'verbal', reason:'' });
  };

  const depts = ['all', ...Array.from(new Set(employees.map(e => e.department_name).filter(Boolean)))];
  const filtered = employees.filter(e => {
    const ms = !search || e.full_name.toLowerCase().includes(search.toLowerCase()) || e.email.toLowerCase().includes(search.toLowerCase());
    const md = deptFilter === 'all' || e.department_name === deptFilter;
    return ms && md;
  });

  const chartData = [...perf].sort((a,b) => a.week_start.localeCompare(b.week_start)).slice(-8).map(s => ({ week: s.week_start.slice(5), score: s.raw_score, tier: s.tier }));

  const WARN_C: Record<string,{bg:string;text:string;border:string}> = {
    verbal: {bg:'#FFF8E1',text:'#E65100',border:'#FFE0B2'},
    written:{bg:'#FFF3E0',text:'#BF360C',border:'#FFCCBC'},
    final:  {bg:'#FFEBEE',text:'#C62828',border:'#FFCDD2'},
  };

  if (loading) return <AppLayout><Spinner /></AppLayout>;

  return (
    <AppLayout>
      <PageHeader title="HR — Employees" subtitle={`${employees.length} total · ${employees.filter(e=>e.status==='active').length} active`}
        action={isHR ? <button className="btn-primary" style={{fontSize:12}} onClick={() => setShowAdd(true)}>+ Add employee</button> : undefined} />

      {loadError && (
        <div style={{ margin:'0 24px 16px', padding:'10px 14px', background:'#FFEBEE', border:'1px solid #FFCDD2', borderRadius:9, display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
          <span style={{ fontSize:12, color:'#C62828' }}>{loadError}</span>
          <button className="btn-secondary" style={{fontSize:11, padding:'4px 10px'}} onClick={loadEmployees}>Retry</button>
        </div>
      )}

      <KPIGrid>
        <KPICard label="Total staff"      value={employees.length}                                              accent="#534AB7" />
        <KPICard label="Employees"        value={employees.filter(e=>e.contract_type==='employee').length}      accent="#0288D1" />
        <KPICard label="Contractors"      value={employees.filter(e=>e.contract_type==='contractor').length}    accent="#7B1FA2" />
        <KPICard label="Agents"           value={employees.filter(e=>e.contract_type==='agent').length}         accent="#2E7D32" />
        <KPICard label="Poor performers"  value={employees.filter(e=>e.current_tier==='poor').length}           accent={employees.filter(e=>e.current_tier==='poor').length>0?'#C62828':'#2E7D32'} />
        <KPICard label="Top performers"   value={employees.filter(e=>e.current_tier==='top').length}            accent="#2E7D32" />
      </KPIGrid>

      <div style={{ display:'grid', gridTemplateColumns:'340px 1fr', gap:0, margin:'16px 24px', height:'calc(100vh - 220px)', minHeight:380 }}>
        {/* List */}
        <div style={{ borderRight:'1px solid #EBEBEB', paddingRight:14, display:'flex', flexDirection:'column', overflow:'hidden' }}>
          <input type="text" placeholder="Search name, email..." className="input" style={{ fontSize:12, marginBottom:8, flexShrink:0 }} value={search} onChange={e => setSearch(e.target.value)} />
          <div style={{ display:'flex', gap:5, flexWrap:'wrap', marginBottom:10, flexShrink:0 }}>
            {depts.map(d => (
              <button key={d} onClick={() => setDeptFilter(d)} style={{ fontSize:10, fontWeight:600, padding:'3px 9px', borderRadius:99, border:'none', cursor:'pointer', background:deptFilter===d?'#534AB7':'#F0F0F0', color:deptFilter===d?'#fff':'#666' }}>
                {d === 'all' ? `All (${employees.length})` : d}
              </button>
            ))}
          </div>
          <div style={{ flex:1, overflowY:'auto' }}>
            {filtered.map(emp => {
              const tc = TYPE_C[emp.contract_type] || TYPE_C.employee;
              return (
                <div key={emp.id} onClick={() => selectEmp(emp)} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', borderRadius:10, cursor:'pointer', marginBottom:4, background:selected?.id===emp.id?'#F3F0FF':'#fff', border:`1px solid ${selected?.id===emp.id?'#7C6FE0':'#EBEBEB'}`, boxShadow:selected?.id===emp.id?'0 0 0 2px #EDE9FE':'none' }}>
                  <div style={{ width:36, height:36, borderRadius:'50%', flexShrink:0, background:emp.current_tier==='poor'?'#FFEBEE':emp.current_tier==='top'?'#E8F5E9':'#EEEDFE', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700, color:emp.current_tier==='poor'?'#C62828':emp.current_tier==='top'?'#2E7D32':'#534AB7' }}>
                    {emp.full_name.split(' ').map((n:string)=>n[0]).join('').slice(0,2)}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                      <span style={{ fontSize:13, fontWeight:600, color:'#222', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{emp.full_name}</span>
                      <span style={{ fontSize:10 }}>{LOC_ICON[emp.location]}</span>
                    </div>
                    <div style={{ fontSize:11, color:'#888', display:'flex', alignItems:'center', gap:5 }}>
                      <span>{emp.department_name}</span>
                      <span style={{ fontSize:9, padding:'1px 5px', borderRadius:99, background:tc.bg, color:tc.text }}>{emp.contract_type}</span>
                    </div>
                  </div>
                  {emp.current_tier && <TierBadge tier={emp.current_tier} />}
                </div>
              );
            })}
            {filtered.length === 0 && <div style={{ textAlign:'center', padding:'40px 0', color:'#bbb', fontSize:13 }}>No employees found</div>}
          </div>
        </div>

        {/* Detail */}
        {selected ? (
          <div style={{ paddingLeft:20, overflowY:'auto' }}>
            <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:18 }}>
              <div style={{ width:56, height:56, borderRadius:'50%', background:selected.current_tier==='poor'?'#FFEBEE':selected.current_tier==='top'?'#E8F5E9':'#EEEDFE', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, fontWeight:700, color:selected.current_tier==='poor'?'#C62828':selected.current_tier==='top'?'#2E7D32':'#534AB7', flexShrink:0 }}>
                {selected.full_name.split(' ').map((n:string)=>n[0]).join('').slice(0,2)}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                  <span style={{ fontSize:18, fontWeight:700, color:'#1A1A1A' }}>{selected.full_name}</span>
                  {selected.current_tier && <TierBadge tier={selected.current_tier} />}
                  <StatusBadge status={selected.status} />
                </div>
                <div style={{ fontSize:12, color:'#888', marginTop:3 }}>
                  {selected.employee_code} · {selected.role_name} · {selected.department_name} {LOC_ICON[selected.location]}
                </div>
              </div>
              {isManager && (
                <button className="btn-secondary" style={{ fontSize:12, flexShrink:0 }} onClick={() => setShowWarn(true)}>Issue warning</button>
              )}
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px 20px', marginBottom:18 }}>
              {[
                ['Email',         selected.email],
                ['Contract type', selected.contract_type],
                ['Location',      `${selected.location} ${LOC_ICON[selected.location]}`],
                ['Joined',        new Date(selected.join_date).toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'})],
                ['Department',    selected.department_name],
                ['Role',          selected.role_name],
              ].map(([k,v]) => (
                <div key={k} style={{ borderBottom:'1px solid #F0F0F0', paddingBottom:6 }}>
                  <div style={{ fontSize:10, color:'#bbb', textTransform:'uppercase', letterSpacing:'.04em', marginBottom:2 }}>{k}</div>
                  <div style={{ fontSize:12, fontWeight:600, color:'#333' }}>{v}</div>
                </div>
              ))}
            </div>

            {chartData.length > 0 && (
              <div style={{ marginBottom:18 }}>
                <div style={{ fontSize:12, fontWeight:700, color:'#555', marginBottom:10 }}>Performance score — last 8 weeks</div>
                <ResponsiveContainer width="100%" height={140}>
                  <BarChart data={chartData} barSize={20} margin={{ top:4, right:4, left:-20, bottom:0 }}>
                    <XAxis dataKey="week" tick={{ fontSize:10 }} />
                    <YAxis domain={[0,100]} tick={{ fontSize:10 }} />
                    <Tooltip formatter={(v: any) => [`${v}`, 'Score']} />
                    <Bar dataKey="score" radius={[3,3,0,0]}>
                      {chartData.map((e,i) => <Cell key={i} fill={e.tier==='top'?'#4CAF50':e.tier==='mid'?'#534AB7':'#EF5350'} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {warnings.length > 0 && (
              <div>
                <div style={{ fontSize:12, fontWeight:700, color:'#C62828', marginBottom:8 }}>Formal warnings ({warnings.length})</div>
                {warnings.map(w => {
                  const wc = WARN_C[w.level] || WARN_C.verbal;
                  return (
                    <div key={w.id} style={{ background:wc.bg, border:`1px solid ${wc.border}`, borderRadius:9, padding:'10px 12px', marginBottom:6 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:5 }}>
                        <span style={{ fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:99, background:wc.bg, color:wc.text, border:`1px solid ${wc.border}` }}>{w.level.toUpperCase()} WARNING</span>
                        <span style={{ fontSize:11, color:'#888' }}>{new Date(w.issued_at).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}{w.issued_by_name&&` · ${w.issued_by_name}`}</span>
                      </div>
                      <div style={{ fontSize:12, color:'#555', lineHeight:1.5 }}>{w.reason}</div>
                    </div>
                  );
                })}
              </div>
            )}

            {chartData.length === 0 && warnings.length === 0 && (
              <div style={{ textAlign:'center', padding:'30px 0', color:'#bbb', fontSize:12 }}>No performance data yet for this employee</div>
            )}
          </div>
        ) : (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', color:'#bbb', fontSize:13 }}>Select an employee to view their profile</div>
        )}
      </div>

      <Modal open={showWarn} onClose={() => setShowWarn(false)} title={`Issue warning — ${selected?.full_name}`}>
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div><label className="label">Warning level</label>
            <select className="input" value={warnForm.level} onChange={e => setWarnForm({...warnForm, level:e.target.value})}>
              <option value="verbal">Verbal warning (1st)</option>
              <option value="written">Written warning (2nd)</option>
              <option value="final">Final warning — termination review</option>
            </select>
          </div>
          <div><label className="label">Reason / evidence</label><textarea className="input" rows={4} placeholder="Describe clearly. This is permanent." value={warnForm.reason} onChange={e => setWarnForm({...warnForm, reason:e.target.value})} /></div>
          <div style={{ padding:'8px 12px', background:'#FFF8E1', borderRadius:8, fontSize:12, color:'#E65100' }}>⚠ This warning will be permanently recorded.</div>
          <div style={{ display:'flex', gap:8 }}><button className="btn-danger" style={{flex:1}} onClick={issueWarning}>Issue warning</button><button className="btn-secondary" onClick={() => setShowWarn(false)}>Cancel</button></div>
        </div>
      </Modal>

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add new employee">
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div><label className="label">Full name</label><input type="text" className="input" placeholder="First Last" value={addForm.full_name} onChange={e => setAddForm({...addForm, full_name:e.target.value})} /></div>
          <div><label className="label">Email</label><input type="email" className="input" placeholder="employee@steelops.com" value={addForm.email} onChange={e => setAddForm({...addForm, email:e.target.value})} /></div>
          <div><label className="label">Temporary password</label><input type="password" className="input" value={addForm.password} onChange={e => setAddForm({...addForm, password:e.target.value})} /></div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
            <div><label className="label">Contract type</label>
              <select className="input" value={addForm.contract_type} onChange={e => setAddForm({...addForm, contract_type:e.target.value})}>
                <option value="employee">Employee</option><option value="contractor">Contractor</option><option value="agent">Agent</option>
              </select>
            </div>
            <div><label className="label">Location</label>
              <select className="input" value={addForm.location} onChange={e => setAddForm({...addForm, location:e.target.value})}>
                <option value="india">🇮🇳 India</option><option value="canada">🇨🇦 Canada</option><option value="field">🏗️ Field</option>
              </select>
            </div>
          </div>
          <div><label className="label">Join date</label><input type="date" className="input" value={addForm.join_date} onChange={e => setAddForm({...addForm, join_date:e.target.value})} /></div>
          <div style={{ display:'flex', gap:8 }}>
            <button className="btn-primary" style={{flex:1}} onClick={async () => { try { await hrAPI.createEmployee(addForm); } catch {} setShowAdd(false); }}>Create employee</button>
            <button className="btn-secondary" onClick={() => setShowAdd(false)}>Cancel</button>
          </div>
        </div>
      </Modal>
    </AppLayout>
  );
}

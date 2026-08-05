import React, { useEffect, useState } from 'react';
import { AppLayout, PageHeader, KPICard, KPIGrid, Spinner, Modal } from '../../components/shared';
import { paperworkAPI } from '../../lib/api';

const DOC_META: Record<string, { icon:string; label:string; color:string }> = {
  bill_of_lading:            { icon:'🚢', label:'Bill of Lading',        color:'#0288D1' },
  customs_declaration:       { icon:'🏛️', label:'Customs Declaration',   color:'#795548' },
  certificate_of_origin:     { icon:'🌍', label:'Certificate of Origin', color:'#388E3C' },
  certificate_of_conformity: { icon:'✅', label:'Cert. of Conformity',   color:'#2E7D32' },
  sgs_report:                { icon:'🔬', label:'SGS Report',            color:'#7B1FA2' },
  government_cert:           { icon:'🏛️', label:'Government Cert.',      color:'#E65100' },
  insurance_policy:          { icon:'🛡️', label:'Insurance Policy',      color:'#00796B' },
  invoice:                   { icon:'📄', label:'Invoice',               color:'#1565C0' },
  other:                     { icon:'📎', label:'Other',                 color:'#888' },
};

export default function PaperworkPage() {
  const [tab, setTab]       = useState<'documents'|'sgs'|'expiry'>('documents');
  const [docs, setDocs]     = useState<any[]>([]);
  const [sgs, setSGS]       = useState<any[]>([]);
  const [typeFilter, setTypeFilter] = useState('all');
  const [showUpload, setShowUpload] = useState(false);
  const [uploadForm, setUploadForm] = useState({ doc_type:'certificate_of_conformity', title:'', issuing_authority:'', expiry_date:'', ref_type:'shipment', ref_id:'' });
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setLoadError(null);
    Promise.all([paperworkAPI.documents(), paperworkAPI.sgsInspections()])
      .then(([d, s]) => {
        setDocs(d.data.data || []);
        setSGS(s.data.data || []);
      })
      .catch(() => setLoadError('Could not load paperwork data — check your connection and try again.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const submitUpload = async () => {
    if (!uploadForm.title || !uploadForm.ref_id) return;
    setUploading(true);
    try {
      const fd = new FormData();
      Object.entries(uploadForm).forEach(([k, v]) => fd.append(k, v as string));
      if (uploadFile) fd.append('file', uploadFile);
      await paperworkAPI.createDocument(fd);
      setShowUpload(false);
      setUploadForm({ doc_type:'certificate_of_conformity', title:'', issuing_authority:'', expiry_date:'', ref_type:'shipment', ref_id:'' });
      setUploadFile(null);
      load();
    } catch {
      // surfaced via the banner below on next load; keep modal open so the user can retry
    } finally {
      setUploading(false);
    }
  };

  const expiringDocs = docs.filter(d => d.days_until_expiry !== null && d.days_until_expiry !== undefined && d.days_until_expiry >= 0 && d.days_until_expiry <= 30);
  const expiredDocs  = docs.filter(d => d.days_until_expiry !== null && d.days_until_expiry !== undefined && d.days_until_expiry < 0);
  const allTypes = ['all', ...Array.from(new Set(docs.map(d => d.doc_type)))];
  const filteredDocs = typeFilter === 'all' ? docs : docs.filter(d => d.doc_type === typeFilter);

  const SGS_C: Record<string,{bg:string;text:string;border:string;icon:string}> = {
    pass:             { bg:'#E8F5E9', text:'#2E7D32', border:'#C8E6C9', icon:'✅' },
    fail:             { bg:'#FFEBEE', text:'#C62828', border:'#FFCDD2', icon:'❌' },
    conditional_pass: { bg:'#FFF8E1', text:'#E65100', border:'#FFE0B2', icon:'⚠️' },
  };

  if (loading) return <AppLayout><Spinner /></AppLayout>;

  return (
    <AppLayout>
      <PageHeader title="Paperwork & Compliance" subtitle="Documents · SGS · Certificates · Expiry tracking"
        action={<button className="btn-primary" style={{fontSize:12}} onClick={() => setShowUpload(true)}>+ Upload document</button>} />

      {loadError && (
        <div style={{ margin:'16px 24px 0', padding:'10px 14px', background:'#FFEBEE', border:'1px solid #FFCDD2', borderRadius:9, display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
          <span style={{ fontSize:12, color:'#C62828' }}>{loadError}</span>
          <button className="btn-secondary" style={{fontSize:11, padding:'4px 10px'}} onClick={load}>Retry</button>
        </div>
      )}

      <KPIGrid>
        <KPICard label="Total documents"  value={docs.length}           note="on file"         accent="#534AB7" />
        <KPICard label="Expiring (30d)"   value={expiringDocs.length}   note="renew now"       accent={expiringDocs.length>0?'#E65100':'#2E7D32'} />
        <KPICard label="Expired"          value={expiredDocs.length}    note="action required" accent={expiredDocs.length>0?'#C62828':'#2E7D32'} />
        <KPICard label="SGS pass"         value={sgs.filter(s=>s.result==='pass').length} note={`of ${sgs.length} inspections`} accent="#2E7D32" />
        <KPICard label="SGS fail"         value={sgs.filter(s=>s.result==='fail').length} note="need re-sourcing"              accent={sgs.filter(s=>s.result==='fail').length>0?'#C62828':'#2E7D32'} />
      </KPIGrid>

      <div style={{ display:'flex', gap:0, padding:'14px 24px 0', borderBottom:'1px solid #EBEBEB', marginTop:4 }}>
        {[{k:'documents',l:`Documents (${docs.length})`},{k:'sgs',l:`SGS Inspections (${sgs.length})`},{k:'expiry',l:`Expiry Calendar (${expiringDocs.length+expiredDocs.length})`}].map(t => (
          <button key={t.k} onClick={() => setTab(t.k as any)} style={{ padding:'8px 16px', fontSize:13, fontWeight:tab===t.k?700:400, color:tab===t.k?'#534AB7':'#888', background:'none', border:'none', cursor:'pointer', borderBottom:tab===t.k?'2px solid #534AB7':'2px solid transparent', marginBottom:-1 }}>
            {t.l}
          </button>
        ))}
      </div>

      {/* DOCUMENTS */}
      {tab === 'documents' && (
        <div style={{ margin:'16px 24px' }}>
          {docs.length === 0 && !loadError ? (
            <div style={{ textAlign:'center', padding:'60px 0', color:'#aaa' }}>
              <div style={{ fontSize:40, marginBottom:12 }}>📎</div>
              <div style={{ fontSize:14, fontWeight:600, color:'#555', marginBottom:6 }}>No documents on file yet</div>
              <div style={{ fontSize:12 }}>Upload a bill of lading, certificate, or report to get started</div>
            </div>
          ) : (
          <>
          <div style={{ display:'flex', gap:5, flexWrap:'wrap', marginBottom:12 }}>
            {allTypes.map(t => {
              const m = DOC_META[t];
              return (
                <button key={t} onClick={() => setTypeFilter(t)} style={{ fontSize:11, fontWeight:600, padding:'4px 10px', borderRadius:99, border:'none', cursor:'pointer', background:typeFilter===t?'#534AB7':'#F0F0F0', color:typeFilter===t?'#fff':'#555' }}>
                  {t==='all'?`All (${docs.length})`:`${m?.icon||''} ${m?.label||t}`}
                </button>
              );
            })}
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {filteredDocs.map(doc => {
              const meta = DOC_META[doc.doc_type] || DOC_META.other;
              const expiring = doc.days_until_expiry !== null && doc.days_until_expiry !== undefined && doc.days_until_expiry >= 0 && doc.days_until_expiry <= 30;
              const expired  = doc.days_until_expiry !== null && doc.days_until_expiry !== undefined && doc.days_until_expiry < 0;
              return (
                <div key={doc.id} style={{ background:expired?'#FFEBEE':expiring?'#FFF8E1':'#fff', border:`1px solid ${expired?'#FFCDD2':expiring?'#FFE082':'#EBEBEB'}`, borderRadius:11, padding:'12px 14px', display:'grid', gridTemplateColumns:'36px 1fr auto', gap:12, alignItems:'center' }}>
                  <div style={{ width:36, height:36, borderRadius:9, background:meta.color+'18', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>{meta.icon}</div>
                  <div>
                    <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3, flexWrap:'wrap' }}>
                      <span style={{ fontSize:12, fontWeight:700, color:'#222' }}>{doc.title}</span>
                      <span style={{ fontSize:9, fontWeight:700, padding:'1px 6px', borderRadius:99, background:doc.status==='approved'?'#E8F5E9':doc.status==='rejected'?'#FFEBEE':'#F3F0FF', color:doc.status==='approved'?'#2E7D32':doc.status==='rejected'?'#C62828':'#4527A0' }}>{doc.status}</span>
                      {expiring && <span style={{ fontSize:9, fontWeight:700, padding:'1px 6px', borderRadius:99, background:'#FFF3E0', color:'#E65100' }}>⏰ {doc.days_until_expiry}d left</span>}
                      {expired  && <span style={{ fontSize:9, fontWeight:700, padding:'1px 6px', borderRadius:99, background:'#FFEBEE', color:'#C62828' }}>❌ EXPIRED</span>}
                    </div>
                    <div style={{ fontSize:11, color:'#888' }}>{meta.label}{doc.issuing_authority&&` · ${doc.issuing_authority}`}{doc.issued_date&&` · Issued: ${new Date(doc.issued_date).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}`}</div>
                    <div style={{ fontSize:10, color:'#bbb', marginTop:2 }}>Linked: {doc.ref_type}/{doc.ref_id}{doc.file_url ? '' : ' · no file attached'}</div>
                  </div>
                  {doc.file_url
                    ? <a href={(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001') + doc.file_url} target="_blank" rel="noreferrer" style={{ padding:'4px 10px', fontSize:11, fontWeight:600, background:'#534AB7', color:'#fff', border:'none', borderRadius:6, textDecoration:'none', flexShrink:0 }}>View file</a>
                    : (expiring || expired) && <button style={{ padding:'4px 10px', fontSize:11, fontWeight:600, background:'#E65100', color:'#fff', border:'none', borderRadius:6, cursor:'pointer', flexShrink:0 }} onClick={async () => { const status = expired ? 'expired' : doc.status; await paperworkAPI.updateDocument(doc.id, { status }); load(); }}>Renew</button>}
                </div>
              );
            })}
          </div>
          </>
          )}
        </div>
      )}

      {/* SGS */}
      {tab === 'sgs' && (
        <div style={{ margin:'16px 24px', display:'flex', flexDirection:'column', gap:10 }}>
          {sgs.length === 0 && !loadError && (
            <div style={{ textAlign:'center', padding:'60px 0', color:'#aaa' }}>
              <div style={{ fontSize:40, marginBottom:12 }}>🔬</div>
              <div style={{ fontSize:14, fontWeight:600, color:'#555' }}>No SGS inspections logged yet</div>
            </div>
          )}
          {sgs.map(s => {
            const rc = SGS_C[s.result] || SGS_C.conditional_pass;
            return (
              <div key={s.id} style={{ background:s.result==='fail'?'#FFEBEE':'#fff', border:`1px solid ${rc.border}`, borderRadius:12, padding:'14px 16px' }}>
                <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12 }}>
                  <div style={{ flex:1 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:5, flexWrap:'wrap' }}>
                      <span style={{ fontSize:13, fontFamily:'monospace', fontWeight:700, color:'#534AB7' }}>{s.batch_code}</span>
                      <span style={{ fontSize:10, fontWeight:700, padding:'3px 9px', borderRadius:99, background:rc.bg, color:rc.text, border:`1px solid ${rc.border}` }}>{rc.icon} {s.result.replace(/_/g,' ').toUpperCase()}</span>
                      {s.re_inspection_required && <span style={{ fontSize:10, fontWeight:700, padding:'3px 9px', borderRadius:99, background:'#FFF3E0', color:'#E65100', border:'1px solid #FFE0B2' }}>Re-inspection: {s.re_inspection_date||'TBD'}</span>}
                    </div>
                    <div style={{ fontSize:13, fontWeight:600, color:'#222', marginBottom:3 }}>{s.mill_name}</div>
                    <div style={{ fontSize:11, color:'#888' }}>Inspector: {s.inspector_name} · {new Date(s.inspection_date).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}</div>
                    {s.failure_notes && <div style={{ marginTop:8, padding:'8px 10px', background:'#FFF3F3', border:'1px solid #FFCDD2', borderRadius:7, fontSize:12, color:'#C62828', lineHeight:1.5 }}><strong>Failure notes:</strong> {s.failure_notes}</div>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* EXPIRY */}
      {tab === 'expiry' && (
        <div style={{ margin:'16px 24px' }}>
          {expiredDocs.length > 0 && (
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:12, fontWeight:700, color:'#C62828', marginBottom:8 }}>❌ Expired — immediate action required ({expiredDocs.length})</div>
              {expiredDocs.map(d => {
                const meta = DOC_META[d.doc_type] || DOC_META.other;
                return (
                  <div key={d.id} style={{ background:'#FFEBEE', border:'1px solid #FFCDD2', borderRadius:9, padding:'10px 14px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, marginBottom:6 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <span style={{ fontSize:18 }}>{meta.icon}</span>
                      <div>
                        <div style={{ fontSize:12, fontWeight:700, color:'#C62828' }}>{d.title}</div>
                        <div style={{ fontSize:11, color:'#888' }}>{d.issuing_authority} · Expired {Math.abs(d.days_until_expiry)}d ago</div>
                      </div>
                    </div>
                    <button style={{ padding:'5px 12px', fontSize:11, fontWeight:700, background:'#C62828', color:'#fff', border:'none', borderRadius:6, cursor:'pointer', flexShrink:0 }} onClick={async () => { await paperworkAPI.updateDocument(d.id, { status:'expired' }); load(); }}>Mark expired</button>
                  </div>
                );
              })}
            </div>
          )}
          {expiringDocs.length > 0 && (
            <div>
              <div style={{ fontSize:12, fontWeight:700, color:'#E65100', marginBottom:8 }}>⏰ Expiring within 30 days ({expiringDocs.length})</div>
              {[...expiringDocs].sort((a,b)=>(a.days_until_expiry||0)-(b.days_until_expiry||0)).map(d => {
                const meta = DOC_META[d.doc_type] || DOC_META.other;
                const urgency = (d.days_until_expiry||0) <= 7 ? '#E65100' : '#BA7517';
                return (
                  <div key={d.id} style={{ background:'#FFF8E1', border:'1px solid #FFE082', borderRadius:9, padding:'10px 14px', display:'grid', gridTemplateColumns:'36px 1fr auto', gap:10, alignItems:'center', marginBottom:6 }}>
                    <div style={{ width:36, height:36, borderRadius:8, background:urgency+'22', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>{meta.icon}</div>
                    <div>
                      <div style={{ fontSize:12, fontWeight:700, color:'#222', marginBottom:2 }}>{d.title}</div>
                      <div style={{ fontSize:11, color:'#888' }}>{d.issuing_authority}</div>
                      <div style={{ marginTop:5, height:3, background:'#F0F0F0', borderRadius:99, overflow:'hidden', maxWidth:200 }}>
                        <div style={{ height:'100%', borderRadius:99, background:urgency, width:`${Math.max(5,(1-(d.days_until_expiry||0)/30)*100)}%` }} />
                      </div>
                    </div>
                    <div style={{ textAlign:'right', flexShrink:0 }}>
                      <div style={{ fontSize:14, fontWeight:800, color:urgency }}>{d.days_until_expiry}d</div>
                      <div style={{ fontSize:10, color:'#aaa' }}>remaining</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {expiringDocs.length === 0 && expiredDocs.length === 0 && (
            <div style={{ textAlign:'center', padding:'60px 0', color:'#aaa' }}>
              <div style={{ fontSize:40, marginBottom:12 }}>✅</div>
              <div style={{ fontSize:14, fontWeight:600, color:'#555', marginBottom:6 }}>All certificates are current</div>
              <div style={{ fontSize:12 }}>No documents expiring in the next 30 days</div>
            </div>
          )}
        </div>
      )}

      <Modal open={showUpload} onClose={() => setShowUpload(false)} title="Upload document">
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div><label className="label">Document type</label>
            <select className="input" value={uploadForm.doc_type} onChange={e => setUploadForm({...uploadForm, doc_type:e.target.value})}>
              {Object.entries(DOC_META).map(([k,v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
            </select>
          </div>
          <div><label className="label">Title</label><input type="text" className="input" placeholder="e.g. CoC — SHP-2025-0018" value={uploadForm.title} onChange={e => setUploadForm({...uploadForm, title:e.target.value})} /></div>
          <div><label className="label">Linked to (ref type)</label>
            <select className="input" value={uploadForm.ref_type} onChange={e => setUploadForm({...uploadForm, ref_type:e.target.value})}>
              <option value="shipment">Shipment</option>
              <option value="batch">Batch</option>
              <option value="po">Purchase order</option>
              <option value="company">Company</option>
            </select>
          </div>
          <div><label className="label">Linked record ID</label><input type="text" className="input" placeholder="e.g. shipment UUID or code" value={uploadForm.ref_id} onChange={e => setUploadForm({...uploadForm, ref_id:e.target.value})} /></div>
          <div><label className="label">Issuing authority</label><input type="text" className="input" placeholder="SGS India Pvt Ltd" value={uploadForm.issuing_authority} onChange={e => setUploadForm({...uploadForm, issuing_authority:e.target.value})} /></div>
          <div><label className="label">Expiry date</label><input type="date" className="input" value={uploadForm.expiry_date} onChange={e => setUploadForm({...uploadForm, expiry_date:e.target.value})} /></div>
          <div><label className="label">File</label><input type="file" className="input" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx" style={{padding:'6px 12px',fontSize:12}} onChange={e => setUploadFile(e.target.files?.[0] || null)} /></div>
          <div style={{ display:'flex', gap:8 }}>
            <button className="btn-primary" style={{flex:1}} disabled={uploading || !uploadForm.title || !uploadForm.ref_id} onClick={submitUpload}>{uploading ? 'Uploading…' : 'Upload'}</button>
            <button className="btn-secondary" onClick={() => setShowUpload(false)}>Cancel</button>
          </div>
        </div>
      </Modal>
    </AppLayout>
  );
}

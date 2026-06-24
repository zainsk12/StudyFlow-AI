// client/src/components/Setup/SyllabusImport.jsx
import { useState, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { FileUp, X, CheckCircle2, Circle, AlertCircle, FileText, Sparkles, Lock } from 'lucide-react';
import PaywallModal from '../Payment/PaywallModal';

const COLORS   = ['#f59e0b','#818cf8','#34d399','#f87171','#38bdf8','#a78bfa','#fb923c','#4ade80'];
const DIFF_CLR = { easy: '#34d399', medium: '#f59e0b', hard: '#f87171' };

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export default function SyllabusImport({ onImport, isPro }) {
  const { refreshUser } = useAuth();
  const [open,        setOpen]        = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [status,    setStatus]    = useState('idle');  // idle | uploading | preview | error
  const [error,     setError]     = useState('');
  const [subjects,  setSubjects]  = useState([]);
  const [selected,  setSelected]  = useState({});
  const [dragging,  setDragging]  = useState(false);
  const [progress,  setProgress]  = useState(0);
  const [progMsg,   setProgMsg]   = useState('');
  const [chunkInfo, setChunkInfo] = useState({ current: 0, total: 0 });
  const fileRef = useRef();

  const reset = () => {
    setStatus('idle'); setError(''); setSubjects([]);
    setSelected({}); setDragging(false);
    setProgress(0); setProgMsg('');
    setChunkInfo({ current: 0, total: 0 });
    // Reset file input so the same file can be re-selected after an error
    if (fileRef.current) fileRef.current.value = '';
  };

  const close = () => { reset(); setOpen(false); };

  const processFile = async (file) => {
    if (!file) return;

    if (file.type !== 'application/pdf') {
      setError('Please upload a valid PDF file.');
      setStatus('error');
      return;
    }

    // Client-side size guard — prevents wasting bandwidth and gives instant feedback
    if (file.size > MAX_FILE_SIZE_BYTES) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
      setError(`File is too large (${sizeMB} MB). Please upload a PDF under 10 MB.`);
      setStatus('error');
      return;
    }

    setStatus('uploading');
    setProgress(0);
    setProgMsg('Uploading PDF…');
    setError('');

    try {
      const formData = new FormData();
      formData.append('pdf', file);

      const res = await fetch('/api/syllabus/import', {
        method:      'POST',
        credentials: 'include',
        body:        formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 403 && data.code === 'PRO_REQUIRED') {
          await refreshUser();
          reset();
          setOpen(false);
          setShowPaywall(true);
          return;
        }
        setError(data.message || 'Failed to process PDF');
        setStatus('error');
        return;
      }

      // Read SSE stream
      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let   buffer  = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));

            if (event.type === 'status' || event.type === 'chunk') {
              if (event.progress != null) setProgress(event.progress);
              setProgMsg(event.message ?? '');
              if (event.current) setChunkInfo({ current: event.current, total: event.total });
            }

            if (event.type === 'error') {
              setError(event.message);
              setStatus('error');
              break;
            }

            if (event.type === 'done') {
              setProgress(100);
              setProgMsg('Done!');

              const sel = {};
              event.subjects.forEach((s, si) => {
                sel[si] = {};
                s.topics.forEach((_, ti) => { sel[si][ti] = true; });
              });
              setSubjects(event.subjects);
              setSelected(sel);
              setStatus('preview');
            }

          } catch { /* skip malformed event */ }
        }
      }

    } catch {
      setError('Server error. Make sure your server is running.');
      setStatus('error');
    }
  };

  const toggleSubject = (si) => {
    const allOn = subjects[si].topics.every((_, ti) => selected[si]?.[ti]);
    setSelected(prev => ({
      ...prev,
      [si]: Object.fromEntries(subjects[si].topics.map((_, ti) => [ti, !allOn])),
    }));
  };

  const toggleTopic = (si, ti) =>
    setSelected(prev => ({ ...prev, [si]: { ...prev[si], [ti]: !prev[si]?.[ti] } }));

  const handleImport = () => {
    const genId = () => Math.random().toString(36).slice(2, 9);
    const toImport = subjects
      .map((s, si) => {
        const topics = s.topics
          .filter((_, ti) => selected[si]?.[ti])
          .map(t => ({ id: genId(), name: t.name, difficulty: t.difficulty, status: 'pending' }));
        return topics.length > 0
          ? { id: genId(), name: s.name, color: COLORS[si % COLORS.length], topics }
          : null;
      })
      .filter(Boolean);
    if (toImport.length === 0) return;
    onImport(toImport, { fromPDF: true });
    close();
  };

  const totalSelected = Object.values(selected)
    .flatMap(s => Object.values(s))
    .filter(Boolean).length;

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => isPro ? setOpen(true) : setShowPaywall(true)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'rgba(129,140,248,0.08)',
          border: '1px solid rgba(129,140,248,0.25)',
          borderRadius: 8, padding: '6px 14px',
          color: '#818cf8', cursor: 'pointer',
          fontSize: 12, fontWeight: 500,
        }}
      >
        {isPro ? <Sparkles size={13} /> : <Lock size={13} />} Import from PDF
      </button>

      {/* Paywall modal */}
      {showPaywall && (
        <PaywallModal featureName="PDF Syllabus Import" onClose={() => setShowPaywall(false)} />
      )}

      {/* Modal */}
      {open && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: 20,
        }}>
          <div style={{
            background: '#1c2030', border: '1px solid #252d42',
            borderRadius: 16, width: '100%', maxWidth: 560,
            maxHeight: '85vh', display: 'flex', flexDirection: 'column',
            overflow: 'hidden',
          }}>

            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '20px 24px', borderBottom: '1px solid #252d42',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 34, height: 34,
                  background: 'rgba(129,140,248,0.12)',
                  border: '1px solid rgba(129,140,248,0.2)',
                  borderRadius: 9, display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <FileText size={16} color="#818cf8" />
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9' }}>Import Syllabus</div>
                  <div style={{ fontSize: 11, color: '#475569' }}>AI extracts subjects &amp; topics from your PDF</div>
                </div>
              </div>
              <button onClick={close} style={{ background: 'transparent', border: 'none', color: '#475569', cursor: 'pointer', padding: 4 }}>
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

              {/* IDLE — drop zone */}
              {status === 'idle' && (
                <div
                  onDragOver={e => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={e => { e.preventDefault(); setDragging(false); processFile(e.dataTransfer.files[0]); }}
                  onClick={() => fileRef.current.click()}
                  style={{
                    border: `2px dashed ${dragging ? '#818cf8' : '#252d42'}`,
                    borderRadius: 12, padding: '48px 24px',
                    textAlign: 'center', cursor: 'pointer',
                    transition: 'all 0.2s',
                    background: dragging ? 'rgba(129,140,248,0.04)' : 'transparent',
                  }}
                >
                  <FileUp size={36} color={dragging ? '#818cf8' : '#334155'} style={{ margin: '0 auto 14px' }} />
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>
                    {dragging ? 'Drop your PDF here' : 'Drop your syllabus PDF here'}
                  </div>
                  <div style={{ fontSize: 12, color: '#475569', marginBottom: 16 }}>or click to browse</div>
                  <div style={{ display: 'inline-block', background: 'rgba(129,140,248,0.1)', border: '1px solid rgba(129,140,248,0.2)', borderRadius: 6, padding: '4px 12px', fontSize: 11, color: '#818cf8' }}>
                    PDF up to 10 MB
                  </div>
                  <input ref={fileRef} type="file" accept=".pdf,application/pdf" style={{ display: 'none' }}
                    onChange={e => processFile(e.target.files[0])} />
                </div>
              )}

              {/* UPLOADING — live progress */}
              {status === 'uploading' && (
                <div style={{ padding: '32px 8px' }}>
                  <div style={{ textAlign: 'center', marginBottom: 28 }}>
                    <div style={{
                      width: 56, height: 56, borderRadius: '50%',
                      border: '3px solid #1e293b',
                      borderTop: '3px solid #818cf8',
                      margin: '0 auto 16px',
                      animation: 'spin 0.9s linear infinite',
                    }} />
                    <div style={{ fontSize: 15, fontWeight: 600, color: '#94a3b8', marginBottom: 4 }}>
                      {progMsg || 'Analyzing your syllabus…'}
                    </div>
                    {chunkInfo.total > 1 && (
                      <div style={{ fontSize: 12, color: '#475569' }}>
                        Section {chunkInfo.current} of {chunkInfo.total}
                      </div>
                    )}
                  </div>

                  <div style={{ background: '#111827', borderRadius: 8, height: 8, overflow: 'hidden', marginBottom: 8 }}>
                    <div style={{
                      height: '100%',
                      width: `${progress}%`,
                      background: 'linear-gradient(90deg, #6366f1, #818cf8)',
                      borderRadius: 8,
                      transition: 'width 0.4s ease',
                    }} />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#334155' }}>
                    <span style={{ color: progress >=  5 ? '#818cf8' : '#334155' }}>Reading PDF</span>
                    <span style={{ color: progress >= 20 ? '#818cf8' : '#334155' }}>Extracting text</span>
                    <span style={{ color: progress >= 70 ? '#818cf8' : '#334155' }}>AI analysis</span>
                    <span style={{ color: progress >= 93 ? '#818cf8' : '#334155' }}>Merging results</span>
                  </div>

                  <div style={{ textAlign: 'right', fontSize: 11, color: '#475569', marginTop: 6 }}>
                    {progress}%
                  </div>

                  <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
                </div>
              )}

              {/* ERROR */}
              {status === 'error' && (
                <div style={{ textAlign: 'center', padding: '32px 24px' }}>
                  <AlertCircle size={36} color="#f87171" style={{ margin: '0 auto 14px' }} />
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#f87171', marginBottom: 8 }}>Something went wrong</div>
                  <div style={{ fontSize: 13, color: '#64748b', marginBottom: 24 }}>{error}</div>
                  <button onClick={reset} style={{
                    background: 'rgba(129,140,248,0.1)', border: '1px solid rgba(129,140,248,0.2)',
                    borderRadius: 8, padding: '8px 20px', color: '#818cf8', cursor: 'pointer', fontSize: 13,
                  }}>
                    Try Again
                  </button>
                </div>
              )}

              {/* PREVIEW */}
              {status === 'preview' && (
                <div>
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 14 }}>
                    AI found <span style={{ color: '#818cf8', fontWeight: 600 }}>{subjects.length} subjects</span> — select what to import
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {subjects.map((s, si) => {
                      const allOn = s.topics.every((_, ti) => selected[si]?.[ti]);
                      return (
                        <div key={si} style={{
                          background: '#111827',
                          border: `1px solid ${allOn ? 'rgba(129,140,248,0.25)' : '#1e293b'}`,
                          borderLeft: `3px solid ${COLORS[si % COLORS.length]}`,
                          borderRadius: 10, padding: '12px 14px',
                        }}>
                          <div
                            style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, cursor: 'pointer' }}
                            onClick={() => toggleSubject(si)}
                          >
                            {allOn
                              ? <CheckCircle2 size={16} color="#818cf8" />
                              : <Circle       size={16} color="#334155" />}
                            <span style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9', flex: 1 }}>{s.name}</span>
                            <span style={{ fontSize: 11, color: '#475569' }}>{s.topics.length} topics</span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, paddingLeft: 26 }}>
                            {s.topics.map((t, ti) => (
                              <div
                                key={ti}
                                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', cursor: 'pointer' }}
                                onClick={() => toggleTopic(si, ti)}
                              >
                                {selected[si]?.[ti]
                                  ? <CheckCircle2 size={13} color="#34d399" />
                                  : <Circle       size={13} color="#1e293b" />}
                                <span style={{
                                  fontSize: 12, flex: 1,
                                  color: selected[si]?.[ti] ? '#cbd5e1' : '#334155',
                                }}>
                                  {t.name}
                                </span>
                                <span style={{
                                  fontSize: 10,
                                  color: DIFF_CLR[t.difficulty],
                                  background: `${DIFF_CLR[t.difficulty]}15`,
                                  padding: '1px 6px', borderRadius: 4,
                                }}>
                                  {t.difficulty}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Footer — only on preview */}
            {status === 'preview' && (
              <div style={{
                padding: '16px 24px', borderTop: '1px solid #252d42',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <span style={{ fontSize: 12, color: '#475569' }}>
                  <span style={{ color: '#818cf8', fontWeight: 600 }}>{totalSelected}</span> topics selected
                </span>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={close} style={{
                    background: 'transparent', border: '1px solid #252d42',
                    borderRadius: 8, padding: '8px 18px',
                    color: '#64748b', cursor: 'pointer', fontSize: 13,
                  }}>
                    Cancel
                  </button>
                  <button
                    onClick={handleImport}
                    disabled={totalSelected === 0}
                    style={{
                      background: totalSelected > 0
                        ? 'linear-gradient(135deg,#818cf8,#6366f1)'
                        : '#1e293b',
                      border: 'none', borderRadius: 8, padding: '8px 20px',
                      color: totalSelected > 0 ? '#fff' : '#334155',
                      cursor: totalSelected > 0 ? 'pointer' : 'not-allowed',
                      fontSize: 13, fontWeight: 600,
                    }}
                  >
                    Import {totalSelected > 0 ? `${totalSelected} Topics` : ''}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
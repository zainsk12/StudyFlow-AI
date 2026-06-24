import { useState, useEffect } from 'react';
import { AlertTriangle, RefreshCw, Sparkles, X, CheckCircle2, Lock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import PaywallModal from '../Payment/PaywallModal';

export default function SmartRegenBanner({
  behindCount,
  daysLeft,
  doneTopics,
  totalTopics,
  onRegenerate,
}) {
  const { user } = useAuth();
  const [dismissed,   setDismissed]   = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [aiMessage,   setAiMessage]   = useState('');
  const [regenDone,   setRegenDone]   = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);

  useEffect(() => {
    if (behindCount > 0) {
      setRegenDone(false);
      setDismissed(false);
      setAiMessage('');
    }
  }, [behindCount]);

  if (dismissed || behindCount <= 0) return null;

  const fetchAdviceAndRegen = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const res  = await fetch('/api/ai/regen-advice', {
        method:      'POST',
        credentials: 'include',
        headers:     { 'Content-Type': 'application/json' },
        body:        JSON.stringify({ behindCount, daysLeft, doneTopics, totalTopics }),
      });
      const data = await res.json();
      if (res.ok) setAiMessage(data.advice);
    } catch { /* show regen without AI message */ }

    onRegenerate();
    setRegenDone(true);
    setLoading(false);
  };

  if (regenDone) {
    return (
      <div style={{
        background: 'rgba(52,211,153,0.07)', border: '1px solid rgba(52,211,153,0.2)',
        borderRadius: 12, padding: '14px 18px', marginBottom: 18,
        display: 'flex', alignItems: 'flex-start', gap: 12,
      }}>
        <CheckCircle2 size={18} color="#34d399" style={{ flexShrink: 0, marginTop: 1 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#34d399', marginBottom: 4 }}>
            Schedule Regenerated ✓
          </div>
          {aiMessage && (
            <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.5 }}>{aiMessage}</div>
          )}
        </div>
        <button
          onClick={() => setDismissed(true)}
          style={{ background: 'transparent', border: 'none', color: '#334155', cursor: 'pointer', padding: 2 }}
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <div style={{
      background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.2)',
      borderRadius: 12, padding: '14px 18px', marginBottom: 18,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <AlertTriangle size={18} color="#f87171" style={{ flexShrink: 0, marginTop: 1 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#f87171', marginBottom: 4 }}>
            You're behind schedule
          </div>
          <div style={{ fontSize: 13, color: '#64748b', marginBottom: 12, lineHeight: 1.5 }}>
            <span style={{ color: '#f87171', fontWeight: 600 }}>{behindCount} topic{behindCount > 1 ? 's' : ''}</span> should
            have been completed by now but {behindCount > 1 ? 'are' : 'is'} still pending.
            AI can rebuild your plan to fit everything into the remaining{' '}
            <span style={{ color: '#f59e0b', fontWeight: 600 }}>{daysLeft} day{daysLeft !== 1 ? 's' : ''}</span>.
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              onClick={() => user?.isPro ? fetchAdviceAndRegen() : setShowPaywall(true)}
              disabled={loading}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                background: loading ? '#1e293b' : 'linear-gradient(135deg,#f87171,#ef4444)',
                border: 'none', borderRadius: 8, padding: '8px 16px',
                color: loading ? '#475569' : '#fff',
                fontSize: 13, fontWeight: 600,
                transition: 'opacity 0.15s, background 0.15s',
              }}
            >
              {loading
                ? <><RefreshCw size={13} className="spin" /> Regenerating…</>
                : user?.isPro
                  ? <><Sparkles size={13} /> Smart Regenerate</>
                  : <><Lock size={13} /> Smart Regenerate</>}
            </button>
            <button
              onClick={() => setDismissed(true)}
              disabled={loading}
              style={{
                background: 'transparent', border: '1px solid #1e293b',
                borderRadius: 8, padding: '8px 14px',
                color: '#475569', fontSize: 13,
              }}
            >
              Dismiss
            </button>
          </div>
        </div>
        <button
          onClick={() => setDismissed(true)}
          style={{ background: 'transparent', border: 'none', color: '#334155', cursor: 'pointer', padding: 2, flexShrink: 0 }}
        >
          <X size={14} />
        </button>
      </div>

      {showPaywall && (
        <PaywallModal
          featureName="Smart Schedule Regeneration"
          onClose={() => setShowPaywall(false)}
          onSuccess={() => {
            setShowPaywall(false);
            fetchAdviceAndRegen();
          }}
        />
      )}
    </div>
  );
}
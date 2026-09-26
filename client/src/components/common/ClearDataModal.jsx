import { AlertTriangle, Trash2, X } from 'lucide-react';

export default function ClearDataModal({ reason, examDate, pct, onConfirm, onDismiss }) {
  const isExamOver = reason === 'exam_over';
  const isAllDone  = reason === 'all_done';
  const isManual   = reason === 'manual';

  const getIcon = () => {
    if (isExamOver) return <AlertTriangle size={24} color="var(--accent-soft)" />;
    if (isAllDone)  return <span style={{ fontSize: 24 }}>🎉</span>;
    return <Trash2 size={24} color="var(--red)" />;
  };

  const getIconBg = () => {
    if (isExamOver) return { bg: 'rgba(167,139,250,0.1)', border: 'rgba(167,139,250,0.2)' };
    if (isAllDone)  return { bg: 'rgba(45,212,191,0.1)',  border: 'rgba(45,212,191,0.2)'  };
    return              { bg: 'rgba(251,113,133,0.1)',  border: 'rgba(251,113,133,0.2)'  };
  };

  const getTitle = () => {
    if (isExamOver) return '🎓 Exam date has passed!';
    if (isAllDone)  return "🎉 You've completed everything!";
    return 'Clear all data?';
  };

  const getMessage = () => {
    if (isExamOver) return (
      <>
        Your exam date <span style={{ color: 'var(--accent-soft)', fontWeight: 600 }}>{examDate}</span> has
        passed. Would you like to clear all subjects and topics to start fresh for your next exam?
      </>
    );
    if (isAllDone) return (
      <>
        You've completed <span style={{ color: 'var(--green)', fontWeight: 600 }}>100%</span> of your
        topics — great work! Would you like to clear everything and start planning your next exam?
      </>
    );
    return (
      <>
        You currently have{' '}
        <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{pct}% progress</span> on your study
        plan. Are you sure you want to clear all subjects, topics, and your schedule?
        {pct > 0 && (
          <><br /><br />
          <span style={{ color: 'var(--text-dimmer)', fontSize: 13 }}>
            💡 Your progress will be permanently lost.
          </span></>
        )}
      </>
    );
  };

  const getBtnColor = () => {
    if (isExamOver) return 'linear-gradient(135deg,var(--accent-soft),var(--accent))';
    if (isAllDone)  return 'linear-gradient(135deg,var(--green),var(--green-dark))';
    return 'linear-gradient(135deg,var(--red),var(--red))';
  };

  const { bg, border } = getIconBg();

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 2000, padding: 20,
    }}>
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border-card)',
        borderRadius: 16, width: '100%', maxWidth: 440,
        padding: '32px 28px', position: 'relative',
      }}>
        {/* Icon */}
        <div style={{
          width: 52, height: 52, borderRadius: 14,
          background: bg, border: `1px solid ${border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 20,
        }}>
          {getIcon()}
        </div>

        {/* Title */}
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-bright)', marginBottom: 10 }}>
          {getTitle()}
        </div>

        {/* Message */}
        <div style={{ fontSize: 14, color: 'var(--text-dim)', lineHeight: 1.7, marginBottom: 28 }}>
          {getMessage()}
          {/* Only show the permanent delete warning for exam_over and all_done */}
          {!isManual && (
            <>
              <br /><br />
              <span style={{ color: 'var(--text-dimmer)', fontSize: 13 }}>
                ⚠️ This will permanently delete all subjects, topics, and your schedule.
              </span>
            </>
          )}
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={onDismiss}
            style={{
              flex: 1, background: 'transparent',
              border: '1px solid var(--border-card)', borderRadius: 8,
              padding: 11, color: 'var(--text-dim)',
              cursor: 'pointer', fontSize: 14, fontWeight: 500,
            }}
          >
            {isManual ? 'Cancel' : 'Keep My Data'}
          </button>
          <button
            onClick={onConfirm}
            style={{
              flex: 1, background: getBtnColor(),
              border: 'none', borderRadius: 8,
              padding: 11, color: '#fff',
              cursor: 'pointer', fontSize: 14, fontWeight: 700,
              display: 'flex', alignItems: 'center',
              justifyContent: 'center', gap: 7,
            }}
          >
            <Trash2 size={14} /> Clear & Start Fresh
          </button>
        </div>

        {/* X */}
        <button
          onClick={onDismiss}
          style={{
            position: 'absolute', top: 16, right: 16,
            background: 'transparent', border: 'none',
            color: 'var(--text-dimmest)', cursor: 'pointer', padding: 4,
          }}
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

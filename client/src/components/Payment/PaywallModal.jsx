import { useState, useEffect } from 'react';
import { X, Zap, CheckCircle2, Tag, Loader, Lock, Sparkles, Brain, FileText, RefreshCw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

function paise2inr(paise) {
  return '₹' + Number((paise / 100).toFixed(0)).toLocaleString('en-IN');
}

const PLAN_PERIOD = {
  monthly:  '/mo',
  yearly:   '/yr',
  lifetime: '',
};

const FEATURES = [
  { icon: <Brain size={15} />,     label: 'AI Study Coach',              desc: 'Unlimited personalised coaching' },
  { icon: <FileText size={15} />,  label: 'Import Syllabus from PDF',    desc: 'AI extracts every subject & topic' },
  { icon: <RefreshCw size={15} />, label: 'Smart Schedule Regeneration', desc: 'Auto-rebuild your plan when behind' },
];

export default function PaywallModal({ onClose, onSuccess, featureName }) {
  const { refreshUser } = useAuth();

  const [plans,        setPlans]        = useState([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [plansError,   setPlansError]   = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res  = await fetch('/api/payment/plans');
        const data = await res.json();
        if (res.ok && Array.isArray(data.plans) && data.plans.length > 0) {
          const enabled = data.plans
            .filter(p => p.isEnabled)
            .sort((a, b) => a.sortOrder - b.sortOrder);
          if (enabled.length > 0) {
            setPlans(enabled);
            setSelectedPlan(enabled[0]);
            return;
          }
        }
        // API returned OK but no active plans — admin must enable at least one plan
        setPlansError(true);
      } catch {
        setPlansError(true);
      }
    })().finally(() => setPlansLoading(false));
  }, []);

  const [couponInput,  setCouponInput]  = useState('');
  const [couponStatus, setCouponStatus] = useState(null);
  const [couponData,   setCouponData]   = useState(null);
  const [couponMsg,    setCouponMsg]    = useState('');
  const [loading,      setLoading]      = useState(false);
  const [success,      setSuccess]      = useState(false);
  const [error,        setError]        = useState('');

  function handleSelectPlan(plan) {
    setSelectedPlan(plan);
    setCouponInput('');
    setCouponStatus(null);
    setCouponData(null);
    setCouponMsg('');
    setError('');
  }

  const BASE_PRICE    = couponData?.originalAmountPaise ?? selectedPlan?.pricePaise ?? 0;
  const finalPaise    = couponData?.finalAmountPaise    ?? selectedPlan?.pricePaise ?? 0;
  const discountPct   = couponData?.discountPct         ?? 0;
  const isFree        = couponData?.isFree              ?? false;
  const appliedCoupon = couponStatus === 'valid' ? couponInput.trim().toUpperCase() : '';
  const period        = PLAN_PERIOD[selectedPlan?.planType] ?? '';

  const handlePaymentSuccess = async (updatedUser) => {
    await refreshUser(updatedUser);
    setSuccess(true);
    setLoading(false);
    onSuccess?.();
  };

  const handleApplyCoupon = async () => {
    const code = couponInput.trim().toUpperCase();
    if (!code) return;
    setCouponStatus('checking');
    setCouponMsg('');
    try {
      const res  = await fetch('/api/payment/validate-coupon', {
        method:      'POST',
        credentials: 'include',
        headers:     { 'Content-Type': 'application/json' },
        body:        JSON.stringify({ code, planType: selectedPlan?.planType || 'lifetime' }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCouponStatus('invalid');
        setCouponMsg(data.message || 'Invalid coupon.');
        setCouponData(null);
      } else {
        setCouponStatus('valid');
        setCouponMsg(data.discountPct + '% discount applied!');
        setCouponData(data);
      }
    } catch {
      setCouponStatus('invalid');
      setCouponMsg('Could not validate coupon. Try again.');
    }
  };

  const removeCoupon = () => {
    setCouponInput('');
    setCouponStatus(null);
    setCouponMsg('');
    setCouponData(null);
  };

  const handleCheckout = async () => {
    if (!selectedPlan) return;
    setError('');
    setLoading(true);
    try {
      const orderRes  = await fetch('/api/payment/create-order', {
        method:      'POST',
        credentials: 'include',
        headers:     { 'Content-Type': 'application/json' },
        body:        JSON.stringify({
          planType:   selectedPlan.planType,
          couponCode: appliedCoupon || undefined,
        }),
      });
      const orderData = await orderRes.json();
      if (!orderRes.ok) {
        setError(orderData.message || 'Could not initiate payment.');
        setLoading(false);
        return;
      }

      if (orderData.free) {
        await handlePaymentSuccess(orderData.user);
        return;
      }

      const rzp = new window.Razorpay({
        key:         orderData.keyId,
        amount:      orderData.amountPaise,
        currency:    'INR',
        name:        'StudyFlow AI',
        description: selectedPlan.label + ' Access',
        order_id:    orderData.orderId,
        theme:       { color: '#f59e0b' },
        handler: async (response) => {
          try {
            const verifyRes  = await fetch('/api/payment/verify', {
              method:      'POST',
              credentials: 'include',
              headers:     { 'Content-Type': 'application/json' },
              body:        JSON.stringify({
                razorpayOrderId:   response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
                couponCode:        appliedCoupon || undefined,
              }),
            });
            const verifyData = await verifyRes.json();
            if (!verifyRes.ok) {
              setError(verifyData.message || 'Verification failed.');
              setLoading(false);
              return;
            }
            await handlePaymentSuccess(verifyData.user);
          } catch {
            setError('Payment verified by Razorpay but our server could not confirm. Please contact support.');
            setLoading(false);
          }
        },
        modal: { ondismiss: () => setLoading(false) },
      });
      rzp.open();
    } catch {
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  if (success) {
    return (
      <Overlay>
        <div style={s.card}>
          <div style={{ textAlign: 'center', padding: '12px 0 4px' }}>
            <div style={{ fontSize: 52, marginBottom: 16 }}>🎉</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#f1f5f9', marginBottom: 8 }}>
              You're now Pro!
            </div>
            <div style={{ fontSize: 14, color: '#64748b', marginBottom: 28 }}>
              All features are unlocked. A confirmation email is on its way.
            </div>
            <button onClick={onClose} style={s.primaryBtn}>
              Start Using {featureName} →
            </button>
          </div>
        </div>
      </Overlay>
    );
  }

  const btnLabel = isFree
    ? 'Claim Free Access'
    : 'Pay ' + paise2inr(finalPaise) + period + ' — Unlock Now';

  return (
    <Overlay>
      <div style={s.card}>
        <button onClick={onClose} style={s.closeBtn}><X size={18} /></button>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <div style={s.iconBox}><Zap size={20} color="#f59e0b" /></div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#f1f5f9' }}>Unlock Pro Access</div>
            <div style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>
              All AI features · No limits
            </div>
          </div>
        </div>

        {featureName && (
          <div style={s.featureCallout}>
            <Lock size={13} color="#f59e0b" />
            <span style={{ fontSize: 13, color: '#94a3b8' }}>
              <strong style={{ color: '#f59e0b' }}>{featureName}</strong> requires Pro access
            </span>
          </div>
        )}

        {/* Features */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          {FEATURES.map(f => (
            <div key={f.label} style={s.featureRow}>
              <div style={s.featureIcon}>{f.icon}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>{f.label}</div>
                <div style={{ fontSize: 11, color: '#475569' }}>{f.desc}</div>
              </div>
              <CheckCircle2 size={15} color="#34d399" style={{ marginLeft: 'auto', flexShrink: 0 }} />
            </div>
          ))}
        </div>

        {/* Plan tabs */}
        {plansLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#475569', fontSize: 13, marginBottom: 16 }}>
            <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> Loading plans…
          </div>
        ) : plansError || plans.length === 0 ? (
          <div style={s.errorBox}>
            No active plans available. Please contact support.
          </div>
        ) : (
          <>
            <div style={s.planTabs}>
              {plans.map(plan => {
                const isActive = selectedPlan?.planType === plan.planType;
                const planPeriod = PLAN_PERIOD[plan.planType] ?? '';
                return (
                  <button
                    key={plan.planType}
                    onClick={() => handleSelectPlan(plan)}
                    style={{ ...s.planTab, ...(isActive ? s.planTabActive : {}) }}
                  >
                    {plan.badge && <span style={s.badge}>{plan.badge}</span>}
                    <div style={{ fontSize: 11, fontWeight: 600, color: isActive ? '#f59e0b' : '#94a3b8', marginBottom: 4 }}>
                      {plan.label}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 1, justifyContent: 'center' }}>
                      <span style={{ fontSize: 18, fontWeight: 800, color: isActive ? '#f1f5f9' : '#64748b' }}>
                        {paise2inr(plan.pricePaise)}
                      </span>
                      {planPeriod && (
                        <span style={{ fontSize: 10, color: '#475569' }}>{planPeriod}</span>
                      )}
                    </div>
                    {plan.originalPricePaise && (
                      <div style={{ fontSize: 9, color: '#475569', textDecoration: 'line-through' }}>
                        {paise2inr(plan.originalPricePaise)}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            {selectedPlan?.description && (
              <div style={{ fontSize: 11, color: '#475569', marginBottom: 14, textAlign: 'center' }}>
                {selectedPlan.description}
              </div>
            )}
          </>
        )}

        {/* Coupon */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
            <Tag size={12} /> Have a coupon code?
          </div>
          {couponStatus === 'valid' ? (
            <div style={s.couponApplied}>
              <CheckCircle2 size={14} color="#34d399" />
              <span style={{ fontSize: 13, color: '#34d399', flex: 1 }}>
                <strong>{appliedCoupon}</strong> — {couponMsg}
              </span>
              <button onClick={removeCoupon} style={s.removeCouponBtn}><X size={13} /></button>
            </div>
          ) : (
            <div style={s.couponRow}>
              <input
                value={couponInput}
                onChange={e => setCouponInput(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && handleApplyCoupon()}
                placeholder="ENTER CODE"
                style={s.couponInput}
              />
              <button
                onClick={handleApplyCoupon}
                disabled={!couponInput.trim() || couponStatus === 'checking'}
                style={s.applyBtn}
              >
                {couponStatus === 'checking'
                  ? <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} />
                  : 'Apply'}
              </button>
            </div>
          )}
          {couponStatus === 'invalid' && (
            <div style={{ fontSize: 12, color: '#f87171', marginTop: 5 }}>{couponMsg}</div>
          )}
        </div>

        {/* Price summary */}
        {!plansLoading && selectedPlan && (
          <div style={s.priceBox}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              {discountPct > 0 && (
                <span style={{ fontSize: 16, color: '#475569', textDecoration: 'line-through' }}>
                  {paise2inr(BASE_PRICE)}
                </span>
              )}
              <span style={{ fontSize: 32, fontWeight: 800, color: isFree ? '#34d399' : '#f59e0b' }}>
                {isFree ? 'FREE' : paise2inr(finalPaise)}
              </span>
              {period && !isFree && (
                <span style={{ fontSize: 13, color: '#475569' }}>{period}</span>
              )}
              {discountPct > 0 && !isFree && (
                <span style={s.discountBadge}>-{discountPct}%</span>
              )}
            </div>
            <div style={{ fontSize: 11, color: '#334155', marginTop: 4 }}>
              {selectedPlan.planType === 'lifetime'
                ? 'Lifetime · One-time · All future features included'
                : selectedPlan.description || (selectedPlan.label + ' plan · All Pro features')}
            </div>
          </div>
        )}

        {error && <div style={s.errorBox}>{error}</div>}

        <button
          onClick={handleCheckout}
          disabled={loading || plansLoading || !selectedPlan || plansError}
          style={{ ...s.primaryBtn, opacity: (loading || plansLoading || !selectedPlan || plansError) ? 0.7 : 1, marginTop: 4 }}
        >
          {loading
            ? <><Loader size={15} style={{ animation: 'spin 1s linear infinite' }} /> Processing…</>
            : <><Sparkles size={15} /> {btnLabel}</>
          }
        </button>

        <p style={{ fontSize: 11, color: '#334155', textAlign: 'center', marginTop: 12 }}>
          Secured by Razorpay · UPI, Cards, Netbanking accepted
        </p>
        <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
      </div>
    </Overlay>
  );
}

function Overlay({ children }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 2000, padding: 20,
    }}>
      {children}
    </div>
  );
}

const s = {
  card: {
    background: '#1c2030', border: '1px solid #252d42', borderRadius: 18,
    padding: '32px 28px', width: '100%', maxWidth: 440, position: 'relative',
    maxHeight: '90vh', overflowY: 'auto',
  },
  closeBtn: {
    position: 'absolute', top: 16, right: 16,
    background: 'transparent', border: 'none', color: '#475569', cursor: 'pointer',
  },
  iconBox: {
    width: 42, height: 42, borderRadius: 12,
    background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  featureCallout: {
    display: 'flex', alignItems: 'center', gap: 8,
    background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)',
    borderRadius: 8, padding: '8px 12px', marginBottom: 16,
  },
  featureRow: {
    display: 'flex', alignItems: 'center', gap: 12,
    background: '#111827', border: '1px solid #1e293b',
    borderRadius: 10, padding: '9px 14px',
  },
  featureIcon: {
    width: 30, height: 30, borderRadius: 8, flexShrink: 0,
    background: 'rgba(129,140,248,0.1)', border: '1px solid rgba(129,140,248,0.2)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#818cf8',
  },
  planTabs: {
    display: 'flex', gap: 8, marginBottom: 10,
  },
  planTab: {
    flex: 1, position: 'relative',
    background: '#111827', border: '1px solid #1e293b',
    borderRadius: 10, padding: '12px 6px 10px', cursor: 'pointer',
    textAlign: 'center',
  },
  planTabActive: {
    border: '1.5px solid rgba(245,158,11,0.6)',
    background: 'rgba(245,158,11,0.06)',
  },
  badge: {
    position: 'absolute', top: -9, left: '50%', transform: 'translateX(-50%)',
    background: '#f59e0b', color: '#0d1117',
    fontSize: 9, fontWeight: 700, borderRadius: 4,
    padding: '2px 6px', whiteSpace: 'nowrap',
  },
  couponRow: { display: 'flex', gap: 8 },
  couponInput: {
    flex: 1, background: '#111827', border: '1px solid #252d42',
    borderRadius: 8, padding: '9px 12px', color: '#e2e8f0',
    fontSize: 13, letterSpacing: '0.05em', fontFamily: 'monospace',
  },
  applyBtn: {
    background: 'rgba(129,140,248,0.1)', border: '1px solid rgba(129,140,248,0.25)',
    borderRadius: 8, padding: '9px 16px', color: '#818cf8',
    fontSize: 13, fontWeight: 600, cursor: 'pointer',
  },
  couponApplied: {
    display: 'flex', alignItems: 'center', gap: 8,
    background: 'rgba(52,211,153,0.07)', border: '1px solid rgba(52,211,153,0.2)',
    borderRadius: 8, padding: '9px 12px',
  },
  removeCouponBtn: {
    background: 'transparent', border: 'none', color: '#475569', cursor: 'pointer', padding: 2,
  },
  priceBox: {
    background: '#111827', border: '1px solid #1e293b',
    borderRadius: 12, padding: '14px 18px', marginBottom: 14,
  },
  discountBadge: {
    background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.25)',
    color: '#34d399', fontSize: 12, fontWeight: 700,
    borderRadius: 6, padding: '2px 8px',
  },
  primaryBtn: {
    width: '100%', background: 'linear-gradient(135deg,#f59e0b,#d97706)',
    border: 'none', borderRadius: 10, padding: '13px',
    color: '#0d1117', fontSize: 15, fontWeight: 700,
    cursor: 'pointer', display: 'flex', alignItems: 'center',
    justifyContent: 'center', gap: 8,
  },
  errorBox: {
    background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)',
    color: '#f87171', borderRadius: 8, padding: '10px 14px',
    fontSize: 13, marginBottom: 12,
  },
};
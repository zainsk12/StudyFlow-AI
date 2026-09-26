import { Component } from 'react';

/**
 * Global error boundary — catches uncaught render/lifecycle errors anywhere
 * in the tree and shows a recovery UI instead of a blank white screen.
 *
 * Must be a class component: React's error boundary API (componentDidCatch /
 * getDerivedStateFromError) is not available as hooks.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(err) {
    return { hasError: true, message: err?.message || 'An unexpected error occurred.' };
  }

  componentDidCatch(err, info) {
    // Log to console in all envs; replace with a logging service if needed.
    console.error('[ErrorBoundary]', err, info?.componentStack);
  }

  handleReload = () => {
    // Clear error state first so the tree can re-mount cleanly.
    this.setState({ hasError: false, message: '' });
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div style={{
        minHeight: '100vh', background: 'var(--bg-base)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24, fontFamily: "'DM Sans','Segoe UI',system-ui,sans-serif",
      }}>
        <div style={{
          background: 'var(--bg-card)', border: '1px solid rgba(248,113,113,0.25)',
          borderRadius: 16, padding: '40px 36px', maxWidth: 440, width: '100%',
          textAlign: 'center',
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14, margin: '0 auto 20px',
            background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 26,
          }}>⚠️</div>

          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-bright)', marginBottom: 8 }}>
            Something went wrong
          </div>
          <div style={{
            fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.6, marginBottom: 8,
          }}>
            An unexpected error occurred. Your study data is safe — it's stored
            in your account and will reload automatically.
          </div>
          {this.state.message && (
            <div style={{
              fontSize: 11, color: 'var(--text-dimmer)', background: 'var(--bg-deep)',
              border: '1px solid var(--border-card)', borderRadius: 8,
              padding: '8px 12px', marginBottom: 24,
              fontFamily: 'monospace', textAlign: 'left', wordBreak: 'break-word',
            }}>
              {this.state.message}
            </div>
          )}

          <button
            onClick={this.handleReload}
            style={{
              width: '100%', background: 'linear-gradient(135deg,#9333ea,#7e22ce)',
              color: '#0d1117', border: 'none', borderRadius: 8,
              padding: '12px', fontSize: 14, fontWeight: 700, cursor: 'pointer',
            }}
          >
            Reload App
          </button>
        </div>
      </div>
    );
  }
}

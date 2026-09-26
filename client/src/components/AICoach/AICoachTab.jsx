import { useRef, useEffect, useState } from 'react';
import { Brain, Sparkles, Send, RefreshCw } from 'lucide-react';
import Card from '../common/Card';
import { QUICK_PROMPTS } from '../../constants';

const MAX_CHAT_MESSAGES = 100;

function trimMessages(msgs) {
  if (msgs.length <= MAX_CHAT_MESSAGES + 1) return msgs;
  return [msgs[0], ...msgs.slice(-(MAX_CHAT_MESSAGES))];
}

export default function AICoachTab({ subjects, stats, examDate, dailyHours, messages, setMessages }) {
  const [input,       setInput]       = useState('');
  const [isLoading,   setIsLoading]   = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Send message ──────────────────────────────────────────────────────────
  const send = async (text) => {
    const userMsg = text.trim();
    if (!userMsg || isLoading) return;
    setInput('');

    const nextMessages = trimMessages([...messages, { role: 'user', text: userMsg }]);
    setMessages(nextMessages);
    setIsLoading(true);
    await Promise.resolve();

    try {
      const res = await fetch('/api/ai/chat', {
        method:      'POST',
        credentials: 'include',
        headers:     { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextMessages
            .slice(1)
            .map(m => ({ role: m.role, text: m.text })),
          subjects: subjects.map(s => ({
            name:   s.name,
            topics: s.topics.map(t => ({ status: t.status })),
          })),
          stats,
          examDate,
          dailyHours,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `HTTP ${res.status}`);
      }

      const data = await res.json();
      setMessages(prev => trimMessages([...prev, { role: 'assistant', text: data.reply }]));
    } catch (err) {
      setMessages(prev => trimMessages([...prev, { role: 'assistant', text: `Sorry, something went wrong: ${err.message}` }]));
    } finally {
      setIsLoading(false);
    }
  };

  const canSend = !!input.trim() && !isLoading;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '72vh', gap: 12 }}>
      {/* Chat history */}
      <Card style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, padding: 20 }}>
        {messages.map((m, i) => (
          <div key={i} className="msg-in" style={{
            display: 'flex',
            justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
          }}>
            <div style={{
              maxWidth: '80%',
              padding: '10px 14px',
              borderRadius: m.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
              background: m.role === 'user'
                ? 'linear-gradient(135deg,#818cf8,#6366f1)'
                : 'var(--bg-deep)',
              border: m.role === 'assistant' ? '1px solid var(--border-card)' : 'none',
              fontSize: 13,
              lineHeight: 1.6,
              color: 'var(--text-primary)',
              whiteSpace: 'pre-wrap',
            }}>
              {m.text}
            </div>
          </div>
        ))}

        {isLoading && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{
              padding: '10px 16px', background: 'var(--bg-deep)',
              border: '1px solid var(--border-card)', borderRadius: '16px 16px 16px 4px',
              display: 'flex', gap: 4, alignItems: 'center',
            }}>
              {[0, 1, 2].map(i => (
                <span key={i} style={{
                  width: 6, height: 6, borderRadius: '50%', background: 'var(--text-dimmer)',
                  display: 'inline-block',
                  animation: 'sfTyping 1s infinite',
                  animationDelay: `${i * 0.2}s`,
                }} />
              ))}
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </Card>

      {/* Quick prompts */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {QUICK_PROMPTS.map(p => (
          <button
            key={p}
            className="chip-btn"
            onClick={() => send(p)}
            disabled={isLoading}
            style={{
              fontSize: 11, padding: '5px 10px',
              background: 'rgba(129,140,248,0.08)',
              border: '1px solid rgba(129,140,248,0.2)',
              borderRadius: 20, color: '#818cf8',
              transition: 'background 0.15s, opacity 0.15s',
            }}
          >
            {p}
          </button>
        ))}
      </div>

      {/* Input row */}
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send(input)}
          disabled={isLoading}
          placeholder="Ask your AI coach anything…"
          style={{
            flex: 1, background: 'var(--input-bg)', border: '1px solid var(--border-card)',
            borderRadius: 10, padding: '10px 14px',
            color: 'var(--text-primary)', fontSize: 13, outline: 'none',
            transition: 'border-color 0.15s',
            opacity: isLoading ? 0.6 : 1,
          }}
        />
        <button
          onClick={() => send(input)}
          disabled={!canSend}
          style={{
            background: canSend
              ? 'linear-gradient(135deg,#818cf8,#6366f1)'
              : 'var(--border-mid)',
            border: 'none', borderRadius: 10, padding: '10px 16px',
            color: canSend ? '#fff' : 'var(--text-dimmest)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background 0.15s, opacity 0.15s',
          }}
        >
          {isLoading
            ? <RefreshCw size={15} className="spin" />
            : <Send size={15} />}
        </button>
      </div>
    </div>
  );
}

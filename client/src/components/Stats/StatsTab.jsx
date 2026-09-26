import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import { BarChart2, BookOpen, Target, AlertTriangle } from 'lucide-react';
import Card from '../common/Card';
import { SecLabel, MetricCard, Pill } from '../common/index.jsx';
import { DIFF_CLR, DIFF_HRS } from '../../constants';

const TOOLTIP_STYLE = {
  background:   'var(--bg-card)',
  border:       '1px solid var(--border-card)',
  borderRadius: 6,
  fontSize:     12,
  color:        'var(--text-primary)',
};

export default function StatsTab({ subjects, stats, dailyHours }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Metric cards ────────────────────── */}
      <div className="sf-grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
        <MetricCard label="Days Left"   value={stats.daysLeft}         sub="until exam"  color="var(--red)" />
        <MetricCard label="Completion"  value={`${stats.pct}%`}         sub="topics done" color="var(--green)" />
        <MetricCard label="Study Hours" value={`${stats.totalHours}h`}  sub="total needed" color="var(--accent-soft)" />
        <MetricCard label="Daily Load"  value={`${dailyHours}h`}        sub="per day"     color="var(--accent)" />
      </div>

      {/* ── Charts row ──────────────────────── */}
      <div className="sf-charts" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* Donut – hours per subject */}
        <Card>
          <SecLabel icon={<BarChart2 size={13} />}>Hours per Subject</SecLabel>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={stats.pieData}
                cx="50%" cy="50%"
                innerRadius={52} outerRadius={80}
                dataKey="value" paddingAngle={3}
              >
                {stats.pieData.map((e, i) => <Cell key={i} fill={e.color} />)}
              </Pie>
              <Tooltip formatter={(v, n) => [`${v}h`, n]} contentStyle={TOOLTIP_STYLE} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 4 }}>
            {stats.pieData.map((e, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: e.color, flexShrink: 0 }} />
                <span style={{ flex: 1, color: 'var(--text-muted)' }}>{e.name}</span>
                <span style={{ color: e.color, fontWeight: 600 }}>{e.value}h</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Stacked bar – done vs pending */}
        <Card>
          <SecLabel icon={<Target size={13} />}>Topics Progress</SecLabel>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={stats.barData} barSize={18} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <XAxis dataKey="name" tick={{ fill: 'var(--text-dimmer)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'var(--text-dimmer)', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Bar dataKey="Done" stackId="a" radius={[0, 0, 0, 0]}>
                {stats.barData.map((e, i) => <Cell key={i} fill={e.color} />)}
              </Bar>
              <Bar dataKey="Pending" stackId="a" fill="var(--border-mid)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* ── Subject breakdown table ──────────── */}
      <Card>
        <SecLabel icon={<BookOpen size={13} />}>Subject Breakdown</SecLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {subjects.map(s => {
            const hours  = s.topics.reduce((a, t) => a + DIFF_HRS[t.difficulty], 0);
            const hard   = s.topics.filter(t => t.difficulty === 'hard').length;
            const medium = s.topics.filter(t => t.difficulty === 'medium').length;
            const easy   = s.topics.filter(t => t.difficulty === 'easy').length;
            const done   = s.topics.filter(t => t.status === 'done').length;
            const pct    = s.topics.length ? Math.round((done / s.topics.length) * 100) : 0;

            return (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: 'var(--bg-deep)', borderRadius: 8 }}>
                <div style={{ width: 3, height: 38, borderRadius: 2, background: s.color, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4 }}>{s.name}</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {hard   > 0 && <Pill label={`${hard} hard`}   color="var(--red)" />}
                    {medium > 0 && <Pill label={`${medium} med`}  color="var(--accent-soft)" />}
                    {easy   > 0 && <Pill label={`${easy} easy`}   color="var(--green)" />}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: s.color }}>{hours.toFixed(1)}h</div>
                  <div style={{ fontSize: 11, color: 'var(--text-dimmer)' }}>{pct}% done</div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* ── Difficulty distribution ──────────── */}
      <Card>
        <SecLabel icon={<AlertTriangle size={13} />}>Difficulty Distribution</SecLabel>
        <div className="sf-row-wrap" style={{ display: 'flex', gap: 12, marginTop: 4 }}>
          {['hard', 'medium', 'easy'].map(d => {
            const count = subjects.reduce((a, s) => a + s.topics.filter(t => t.difficulty === d).length, 0);
            const total = subjects.reduce((a, s) => a + s.topics.length, 0);
            const pct   = total ? Math.round((count / total) * 100) : 0;
            return (
              <div
                key={d}
                style={{
                  flex:        1,
                  background:  'var(--bg-deep)',
                  borderRadius: 8,
                  padding:     '12px 14px',
                  borderTop:   `2px solid ${DIFF_CLR[d]}`,
                }}
              >
                <div style={{ fontSize: 22, fontWeight: 700, color: DIFF_CLR[d] }}>{count}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, textTransform: 'capitalize' }}>{d} topics</div>
                <div style={{ fontSize: 11, color: 'var(--text-dimmer)' }}>{pct}% of plan</div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

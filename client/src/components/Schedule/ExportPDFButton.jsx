// client/src/components/Schedule/ExportPDFButton.jsx
// Exports the full study schedule to a clean PDF using jsPDF.
// Requires: npm install jspdf   (in client/)
//
// FIX: jsPDF v4 dropped the named export {jsPDF}.
// v2/v3: const { jsPDF } = await import('jspdf')   ← broke in v4
// v4:    const jsPDF = (await import('jspdf')).default

import { useState } from 'react';
import { Download, Loader } from 'lucide-react';

const DIFF_CLR_HEX = { easy: '#34d399', medium: '#f59e0b', hard: '#f87171' };

// ── FIX C: Truncate long strings before passing to doc.text() ─────────────
// jsPDF does not word-wrap or clip text — long strings simply overflow their
// column and render on top of adjacent cells. This helper appends "…" when
// the string exceeds maxChars so every column stays within its allotted width.
function truncate(text, maxChars) {
  if (!text) return '';
  return text.length > maxChars ? text.slice(0, maxChars - 1) + '…' : text;
}

export default function ExportPDFButton({ schedule, subjects, examDate, dailyHours, stats }) {
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    setLoading(true);
    try {
      // jsPDF v4 removed the named {jsPDF} export — it is now the default export.
      const jsPDF = (await import('jspdf')).default;

      const doc  = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
      const PW   = 210; // page width  mm
      const PH   = 297; // page height mm
      const ML   = 14;  // margin left
      const MR   = 14;  // margin right
      const CW   = PW - ML - MR; // content width  (182 mm)
      let   y    = 0;  // current Y cursor

      // ── Helpers ──────────────────────────────────────────────────────────
      const newPage = () => {
        doc.addPage();
        y = 16;
        // page border
        doc.setDrawColor(37, 45, 66);
        doc.setLineWidth(0.3);
        doc.rect(ML - 4, 8, CW + 8, PH - 16, 'S');
      };

      const checkPageBreak = (needed = 10) => {
        if (y + needed > PH - 16) newPage();
      };

      // ── Cover page ───────────────────────────────────────────────────────
      // Dark background strip
      doc.setFillColor(13, 17, 23);
      doc.rect(0, 0, PW, 80, 'F');

      // App name
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(26);
      doc.setTextColor(241, 245, 249);
      doc.text('StudyFlow AI', PW / 2, 34, { align: 'center' });

      // Subtitle
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      doc.setTextColor(71, 85, 105);
      doc.text('Personalised Study Plan Export', PW / 2, 43, { align: 'center' });

      // Gold divider
      doc.setDrawColor(245, 158, 11);
      doc.setLineWidth(0.8);
      doc.line(PW / 2 - 28, 50, PW / 2 + 28, 50);

      // Exam date
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(245, 158, 11);
      doc.text(`Exam Date: ${examDate ?? 'Not set'}`, PW / 2, 60, { align: 'center' });

      // Stats row
      y = 96;
      const statItems = [
        { label: 'Total Days',    value: String(schedule.length) },
        { label: 'Daily Hours',   value: `${dailyHours}h` },
        { label: 'Total Topics',  value: String(stats?.totalTopics ?? '—') },
        { label: 'Completion',    value: `${stats?.pct ?? 0}%` },
      ];

      const boxW = CW / statItems.length;
      statItems.forEach((item, i) => {
        const bx = ML + i * boxW;
        doc.setFillColor(28, 32, 48);
        doc.roundedRect(bx, y, boxW - 3, 22, 3, 3, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.setTextColor(241, 245, 249);
        doc.text(item.value, bx + (boxW - 3) / 2, y + 10, { align: 'center' });

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(71, 85, 105);
        doc.text(item.label, bx + (boxW - 3) / 2, y + 17, { align: 'center' });
      });

      // Subjects summary
      y = 134;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(129, 140, 248);
      doc.text('SUBJECTS', ML, y);

      y += 5;
      subjects?.forEach(s => {
        checkPageBreak(8);
        const done    = s.topics.filter(t => t.status === 'done').length;
        const pct     = s.topics.length ? Math.round((done / s.topics.length) * 100) : 0;
        // FIX C: truncate long subject names in the cover summary (max ~55 chars fits the line)
        const subLine = `${truncate(s.name, 40)}  ·  ${s.topics.length} topics  ·  ${pct}% done`;

        // Colour dot
        const hex = s.color || '#818cf8';
        const r   = parseInt(hex.slice(1, 3), 16);
        const g   = parseInt(hex.slice(3, 5), 16);
        const b   = parseInt(hex.slice(5, 7), 16);
        doc.setFillColor(r, g, b);
        doc.circle(ML + 1.5, y + 1, 1.5, 'F');

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(148, 163, 184);
        doc.text(subLine, ML + 5, y + 2);

        // Progress bar
        doc.setFillColor(30, 41, 59);
        doc.roundedRect(ML + 5, y + 4, CW - 5, 2, 1, 1, 'F');
        if (pct > 0) {
          doc.setFillColor(r, g, b);
          doc.roundedRect(ML + 5, y + 4, (CW - 5) * pct / 100, 2, 1, 1, 'F');
        }
        y += 11;
      });

      // Generated stamp
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(51, 65, 85);
      doc.text(
        `Generated on ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`,
        PW / 2, PH - 12, { align: 'center' }
      );

      // ── Schedule pages ───────────────────────────────────────────────────
      newPage();

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(241, 245, 249);
      doc.text('Full Study Schedule', ML, y);
      y += 8;

      schedule.forEach((day, di) => {
        const dayDate  = new Date(day.date + 'T00:00:00');
        const dayLabel = dayDate.toLocaleDateString('en', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
        const dayHours = day.sessions.reduce((a, s) => a + s.hours, 0);
        const rowsNeeded = 10 + day.sessions.length * 9;
        checkPageBreak(rowsNeeded);

        // Day header strip
        doc.setFillColor(28, 32, 48);
        doc.roundedRect(ML - 2, y - 3, CW + 4, 10, 2, 2, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(241, 245, 249);
        // FIX C: truncate day label to prevent header overflow (max ~50 chars is safe)
        doc.text(`Day ${di + 1} — ${truncate(dayLabel, 50)}`, ML + 1, y + 4);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(245, 158, 11);
        doc.text(`${dayHours.toFixed(1)}h`, PW - MR - 2, y + 4, { align: 'right' });
        y += 13;

        day.sessions.forEach(session => {
          checkPageBreak(9);

          // Difficulty colour bar
          const dclr = DIFF_CLR_HEX[session.difficulty] || '#475569';
          const dr = parseInt(dclr.slice(1, 3), 16);
          const dg = parseInt(dclr.slice(3, 5), 16);
          const db = parseInt(dclr.slice(5, 7), 16);
          doc.setFillColor(dr, dg, db);
          doc.rect(ML - 2, y - 1, 2, 7, 'F');

          // Session row background
          doc.setFillColor(17, 24, 39);
          doc.roundedRect(ML, y - 1, CW, 7, 1, 1, 'F');

          // ── FIX C: Column budget (mm from left margin, content width = 182 mm)
          // Hours col:      ~10 mm  (right-aligned at PW - MR - 2 = 194)
          // Difficulty col: ~14 mm  (right-aligned at PW - MR - 14 = 182)
          // Gap between topic/subject and right cols: 26 mm reserved
          // Topic name column: ML+4 … PW-MR-28  → ~154 mm wide → ~52 chars @ 9pt
          // Subject name col:  ML+4 … PW-MR-28  → same zone,  → ~60 chars @ 7.5pt
          // These limits are conservative — actual printable width varies with font.

          // Topic name — reserve right 26 mm for difficulty + hours
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9);
          doc.setTextColor(226, 232, 240);
          doc.text(truncate(session.topicName, 52), ML + 4, y + 3.5);

          // Subject name
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7.5);
          doc.setTextColor(71, 85, 105);
          doc.text(truncate(session.subjectName, 58), ML + 4, y + 6.5);

          // Difficulty badge (right-aligned zone)
          doc.setFontSize(7);
          doc.setTextColor(dr, dg, db);
          doc.text(
            truncate((session.difficulty ?? '').toUpperCase(), 6),
            PW - MR - 14,
            y + 3.5
          );

          // Hours
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9);
          doc.setTextColor(245, 158, 11);
          doc.text(`${session.hours}h`, PW - MR - 2, y + 3.5, { align: 'right' });

          y += 9;
        });

        y += 4; // gap between days
      });

      // ── Footer on every page ─────────────────────────────────────────────
      const totalPages = doc.internal.getNumberOfPages();
      for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(51, 65, 85);
        doc.text(`StudyFlow AI  ·  Page ${p} of ${totalPages}`, PW / 2, PH - 5, { align: 'center' });
      }

      // ── Save ─────────────────────────────────────────────────────────────
      const filename = `StudyFlow_Plan_${examDate ?? 'export'}.pdf`;
      doc.save(filename);
    } catch (err) {
      console.error('PDF export failed:', err);
      alert('PDF export failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={loading || !schedule?.length}
      style={{
        display:      'flex',
        alignItems:   'center',
        gap:          7,
        background:   'rgba(129,140,248,0.08)',
        border:       '1px solid rgba(129,140,248,0.25)',
        borderRadius: 8,
        padding:      '8px 16px',
        color:        '#818cf8',
        fontSize:     13,
        fontWeight:   600,
        cursor:       loading || !schedule?.length ? 'not-allowed' : 'pointer',
        opacity:      loading || !schedule?.length ? 0.5 : 1,
        transition:   'all 0.15s',
        marginTop:    16,
      }}
    >
      {loading
        ? <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Exporting…</>
        : <><Download size={14} /> Export Plan as PDF</>
      }
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </button>
  );
}
// client/src/components/Schedule/ExportPDFButton.jsx
// Exports the full study schedule to a clean PDF using jsPDF.
// Requires: npm install jspdf   (in client/)
//
// FIX: jsPDF v4 dropped the named export {jsPDF}.
// v2/v3: const { jsPDF } = await import('jspdf')   ← broke in v4
// v4:    const jsPDF = (await import('jspdf')).default

import { useState } from 'react';
import { Download, Loader } from 'lucide-react';

const DIFF_CLR_HEX = { easy: '#0f766e', medium: '#6d5ce8', hard: '#be123c' };

export default function ExportPDFButton({ schedule, subjects, examDate, dailyHours }) {
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

      const drawDayHeader = (label, hours, continued = false) => {
        checkPageBreak(16);
        doc.setFillColor(35, 20, 52);
        doc.roundedRect(ML - 2, y - 3, CW + 4, 11, 2, 2, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(248, 244, 252);
        doc.text(`${label}${continued ? ' (continued)' : ''}`, ML + 1, y + 4);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(216, 180, 254);
        doc.text(`${hours.toFixed(1)}h`, PW - MR - 2, y + 4, { align: 'right' });
        y += 14;
      };

      // ── Cover page ───────────────────────────────────────────────────────
      // Dark background strip
      doc.setFillColor(16, 8, 26);
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
      doc.setDrawColor(192, 132, 252);
      doc.setLineWidth(0.8);
      doc.line(PW / 2 - 28, 50, PW / 2 + 28, 50);

      // Exam date
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(216, 180, 254);
      doc.text(`Exam Date: ${examDate ?? 'Not set'}`, PW / 2, 60, { align: 'center' });

      // General plan overview (no completion or progress information).
      y = 96;
      const statItems = [
        { label: 'Total Days',  value: String(schedule.length) },
        { label: 'Daily Hours', value: `${dailyHours}h` },
        { label: 'Subjects',    value: String(subjects?.length ?? 0) },
      ];

      const boxW = CW / statItems.length;
      statItems.forEach((item, i) => {
        const bx = ML + i * boxW;
        doc.setFillColor(35, 20, 52);
        doc.roundedRect(bx, y, boxW - 3, 22, 3, 3, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.setTextColor(241, 245, 249);
        doc.text(item.value, bx + (boxW - 3) / 2, y + 10, { align: 'center' });

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(216, 180, 254);
        doc.text(item.label, bx + (boxW - 3) / 2, y + 17, { align: 'center' });
      });

      // Subjects summary
      y = 134;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(126, 34, 206);
      doc.text('SUBJECTS IN THIS PLAN', ML, y);

      y += 8;
      subjects?.forEach(s => {
        const lines = doc.splitTextToSize(s.name || 'Untitled subject', CW - 10);
        const rowHeight = Math.max(8, lines.length * 4 + 2);
        checkPageBreak(rowHeight + 2);
        doc.setFillColor(192, 132, 252);
        doc.circle(ML + 1.5, y + 1, 1.3, 'F');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(71, 55, 88);
        doc.text(lines, ML + 5, y + 2);
        y += rowHeight;
      });

      // Generated stamp
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(95, 75, 112);
      doc.text(
        `Generated on ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`,
        PW / 2, PH - 12, { align: 'center' }
      );

      // ── Schedule pages ───────────────────────────────────────────────────
      newPage();

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(35, 20, 52);
      doc.text('Full Study Schedule', ML, y);
      y += 8;

      schedule.forEach((day, di) => {
        const dayDate  = new Date(day.date + 'T00:00:00');
        const dayLabel = dayDate.toLocaleDateString('en', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
        const dayHours = day.sessions.reduce((a, s) => a + s.hours, 0);
        const dayTitle = `Day ${di + 1} - ${dayLabel}`;
        drawDayHeader(dayTitle, dayHours);

        day.sessions.forEach(session => {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8.5);
          const topicLines = doc.splitTextToSize(session.topicName || 'Untitled topic', CW - 48);
          const rowHeight = Math.max(12, topicLines.length * 4 + 8);
          const previousPage = doc.internal.getCurrentPageInfo().pageNumber;
          checkPageBreak(rowHeight + 3);
          if (doc.internal.getCurrentPageInfo().pageNumber !== previousPage) {
            drawDayHeader(dayTitle, dayHours, true);
          }

          // Difficulty colour bar
          const dclr = DIFF_CLR_HEX[session.difficulty] || '#9aa6d5';
          const dr = parseInt(dclr.slice(1, 3), 16);
          const dg = parseInt(dclr.slice(3, 5), 16);
          const db = parseInt(dclr.slice(5, 7), 16);
          // Session row grows with wrapped topic names so the subject line never overlaps.
          doc.setFillColor(249, 246, 252);
          doc.roundedRect(ML, y - 1, CW, rowHeight, 1.5, 1.5, 'F');
          doc.setFillColor(dr, dg, db);
          doc.roundedRect(ML - 2, y - 1, 2, rowHeight, 0.8, 0.8, 'F');

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8.5);
          doc.setTextColor(35, 20, 52);
          doc.text(topicLines, ML + 4, y + 3.5, { lineHeightFactor: 1.15 });

          // Subject name
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7);
          doc.setTextColor(104, 85, 119);
          const subjectY = y + 3.5 + (topicLines.length - 1) * 4 + 4;
          doc.text(session.subjectName || '', ML + 4, subjectY);

          // Difficulty badge (right-aligned zone)
          doc.setFontSize(7);
          doc.setTextColor(dr, dg, db);
          doc.text(
            (session.difficulty ?? '').toUpperCase(),
            PW - MR - 20,
            y + 3.5
          );

          // Hours
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9);
          doc.setTextColor(245, 158, 11);
          doc.text(`${session.hours}h`, PW - MR - 2, y + 3.5, { align: 'right' });

          y += rowHeight + 2;
        });

        y += 3; // gap between days
      });

      // ── Footer on every page ─────────────────────────────────────────────
      const totalPages = doc.internal.getNumberOfPages();
      for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(95, 75, 112);
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
        background:   'rgba(167,139,250,0.08)',
        border:       '1px solid rgba(167,139,250,0.25)',
        borderRadius: 8,
        padding:      '8px 16px',
        color:        'var(--accent-soft)',
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

import { FileDown } from "lucide-react";
import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type ClassRow = Database["public"]["Tables"]["classes"]["Row"];
type LogRow = Database["public"]["Tables"]["lesson_logs"]["Row"];

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const short = (t: string) => t.slice(0, 5);
const fmtDay = (d: string) =>
  new Date(`${d}T12:00:00`).toLocaleDateString("ar-DZ", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

function monthBounds(dateKey: string) {
  const [y, m] = dateKey.split("-").map(Number);
  const last = new Date(y!, m!, 0).getDate();
  const mm = String(m).padStart(2, "0");
  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(last).padStart(2, "0")}` };
}

function buildHtml(
  rows: LogRow[],
  classes: ClassRow[],
  from: string,
  to: string,
  teacherName: string,
  levelNames: string[],
) {
  const byDay = new Map<string, LogRow[]>();
  rows.forEach((r) => byDay.set(r.log_date, [...(byDay.get(r.log_date) ?? []), r]));
  const cls = (id: string) => classes.find((c) => c.id === id)?.name ?? "—";
  const usedClassIds = new Set(rows.map((r) => r.class_id));
  const usedClassNames = classes.filter((c) => usedClassIds.has(c.id)).map((c) => c.name);
  const hours = rows.reduce((s, r) => {
    const m = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
    return s + (m(r.end_time) - m(r.start_time)) / 60;
  }, 0);
  const days = [...byDay.entries()]
    .map(
      ([d, list]) => `
    <section class="day">
      <h2><span class="dot"></span>${esc(fmtDay(d))}</h2>
      ${list
        .map(
          (r) => `
        <article class="entry">
          <div class="time"><b>${short(r.start_time)}</b><span>${short(r.end_time)}</span></div>
          <div class="body"><span class="tag">${esc(cls(r.class_id))}</span><p>${esc(r.content)}</p></div>
        </article>`,
        )
        .join("")}
    </section>`,
    )
    .join("");
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<title>دفتر الدروس ${from} — ${to}</title>
<link href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Cairo:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: Cairo, sans-serif; color: #1f2a24; margin: 0; font-size: 11.5pt; width: 794px; padding: 40px 34px; background: #fff; }
  header { border-radius: 14px; padding: 22px 26px; color: #fff;
    background: linear-gradient(135deg, #14532d 0%, #1f7a4a 60%, #c9a227 140%); position: relative; overflow: hidden; }
  header h1 { font-family: Amiri, serif; font-size: 28pt; margin: 0 0 4px; }
  header p { margin: 0 0 3px; opacity: .92; font-size: 11pt; }
  header .teacher { font-family: Amiri, serif; font-size: 21pt; font-weight: 700; opacity: 1; margin: 12px 0 8px; line-height: 1.35; }
  header .teacher span { display: block; font-family: Cairo, sans-serif; font-size: 11pt; font-weight: 600; opacity: .85; margin-bottom: 2px; }
  header .classes { font-size: 15pt; font-weight: 700; opacity: 1; margin-top: 8px; }
  .stats { display: flex; gap: 10px; margin: 14px 0 18px; }
  .stat { flex: 1; border: 1px solid #e3e8e4; border-radius: 10px; padding: 10px 14px; background: #f7faf8; }
  .stat b { display: block; font-size: 16pt; color: #14532d; }
  .stat span { font-size: 9pt; color: #6b7a71; }
  .day { margin-bottom: 14px; }
  .day h2 { font-size: 12.5pt; color: #14532d; margin: 0 0 8px; padding-bottom: 5px;
    border-bottom: 2px solid #c9a227; display: flex; align-items: center; gap: 8px; }
  .dot { width: 9px; height: 9px; border-radius: 50%; background: #c9a227; display: inline-block; }
  .entry { display: flex; gap: 12px; margin-bottom: 8px; }
  .time { width: 68px; flex-shrink: 0; text-align: center; border-radius: 8px; background: #e8f3ec;
    color: #14532d; padding: 8px 4px; direction: ltr; }
  .time b { display: block; font-size: 12pt; } .time span { font-size: 9pt; }
  .body { flex: 1; border: 1px solid #e3e8e4; border-right: 4px solid #1f7a4a; border-radius: 8px; padding: 8px 12px; }
  .tag { font-size: 15pt; font-weight: 700; background: #fbf4dc; color: #8a6d12; padding: 6px 20px; border-radius: 99px; }
  .body p { margin: 6px 0 0; white-space: pre-wrap; line-height: 1.7; }
  .empty { text-align: center; color: #6b7a71; padding: 40px; }
  footer { margin-top: 24px; display: flex; justify-content: space-between; font-size: 9pt; color: #6b7a71;
    border-top: 1px solid #e3e8e4; padding-top: 8px; }
  .sign { margin-top: 30px; display: flex; justify-content: space-between; font-size: 10pt; }
  .sign div { width: 40%; border-top: 1px dashed #9aa79f; padding-top: 6px; text-align: center; }
</style></head><body>
<header>
  <h1>دفتر الدروس</h1>
  ${teacherName ? `<p class="teacher"><span>الأستاذ(ة)</span>${esc(teacherName)}</p>` : ""}
  ${levelNames.length ? `<p>المستويات: ${esc(levelNames.join("، "))}</p>` : ""}
  ${usedClassNames.length ? `<p class="classes">الأقسام: ${esc(usedClassNames.join("، "))}</p>` : ""}
  <p>الفترة: من ${esc(fmtDay(from))} إلى ${esc(fmtDay(to))}</p>
</header>
<div class="stats">
  <div class="stat"><b>${rows.length}</b><span>حصة مسجلة</span></div>
  <div class="stat"><b>${hours}</b><span>ساعة</span></div>
  <div class="stat"><b>${byDay.size}</b><span>يوم عمل</span></div>
  <div class="stat"><b>${usedClassIds.size}</b><span>قسم</span></div>
</div>
${days || `<p class="empty">لا توجد حصص مسجلة في هذه الفترة.</p>`}
<div class="sign"><div>إمضاء الأستاذ(ة)</div><div>إمضاء وختم المدير(ة)</div></div>
<footer><span>Madauros</span><span>أُنشئ في ${esc(new Date().toLocaleDateString("ar-DZ"))}</span></footer>
</body></html>`;
}

export function LessonLogPdfButton({
  client,
  teacherId,
  classes,
  dateKey,
  teacherName = "",
}: {
  client: SupabaseClient<Database>;
  teacherId: string;
  classes: ClassRow[];
  dateKey: string;
  teacherName?: string;
}) {
  const init = monthBounds(dateKey);
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(init.from);
  const [to, setTo] = useState(init.to);
  const [classId, setClassId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    if (from > to) return setError("تاريخ البداية بعد تاريخ النهاية.");
    setError(null);
    setBusy(true);
    try {
      let query = client
        .from("lesson_logs")
        .select("*")
        .eq("teacher_id", teacherId)
        .gte("log_date", from)
        .lte("log_date", to)
        .order("log_date")
        .order("start_time");
      if (classId) query = query.eq("class_id", classId);
      const [logsRes, profileRes, levelsRes] = await Promise.all([
        query,
        client.from("profiles").select("full_name").eq("id", teacherId).maybeSingle(),
        client.from("levels").select("id, name"),
      ]);
      if (logsRes.error) return setError("تعذّر تحميل الحصص.");
      const rows = logsRes.data ?? [];
      const name = teacherName || profileRes.data?.full_name?.trim() || "";
      const levelById = new Map((levelsRes.data ?? []).map((l) => [l.id, l.name]));
      const scopeClasses = classId ? classes.filter((c) => c.id === classId) : classes;
      const levelNames = [
        ...new Set(scopeClasses.map((c) => (c.level_id ? levelById.get(c.level_id) : undefined)).filter(Boolean)),
      ] as string[];

      const html = buildHtml(rows, scopeClasses, from, to, name, levelNames);

      // Render the document off-screen, capture it, then save a real PDF file.
      const iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.left = "-10000px";
      iframe.style.top = "0";
      iframe.style.width = "794px";
      iframe.style.height = "1123px";
      document.body.appendChild(iframe);
      try {
        const doc = iframe.contentDocument!;
        doc.open();
        doc.write(html);
        doc.close();
        await (iframe.contentWindow as Window & { document: Document }).document.fonts.ready;
        await new Promise((r) => setTimeout(r, 400));
        iframe.style.height = `${doc.body.scrollHeight}px`;

        // html2canvas draws the iframe content using the *main* document's fonts:
        // load the Arabic fonts here too, otherwise Arabic falls back and breaks.
        if (!document.getElementById("lesson-pdf-fonts")) {
          const link = document.createElement("link");
          link.id = "lesson-pdf-fonts";
          link.rel = "stylesheet";
          link.href =
            "https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Cairo:wght@400;600;700&display=swap";
          document.head.appendChild(link);
        }
        await Promise.all([
          document.fonts.load('400 16px "Cairo"'),
          document.fonts.load('600 16px "Cairo"'),
          document.fonts.load('700 16px "Cairo"'),
          document.fonts.load('400 16px "Amiri"'),
          document.fonts.load('700 16px "Amiri"'),
        ]);
        await document.fonts.ready;

        const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
        const canvas = await html2canvas(doc.body, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
        const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
        const pageW = pdf.internal.pageSize.getWidth();
        const pageH = pdf.internal.pageSize.getHeight();
        const imgH = (canvas.height * pageW) / canvas.width;
        const pxPerMm = canvas.height / imgH;
        let rendered = 0;
        let page = 0;
        while (rendered < canvas.height) {
          const sliceH = Math.min(canvas.height - rendered, pageH * pxPerMm);
          const slice = document.createElement("canvas");
          slice.width = canvas.width;
          slice.height = Math.ceil(sliceH);
          const ctx = slice.getContext("2d")!;
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, slice.width, slice.height);
          ctx.drawImage(canvas, 0, rendered, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
          if (page > 0) pdf.addPage();
          pdf.addImage(slice.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, pageW, sliceH / pxPerMm);
          rendered += sliceH;
          page += 1;
        }
        const clsName = classId ? `-${classes.find((c) => c.id === classId)?.name ?? ""}` : "";
        pdf.save(`دفتر-الدروس${clsName}-${from}_${to}.pdf`);
      } finally {
        iframe.remove();
      }
    } catch {
      setError("تعذّر إنشاء الملف.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="inline-flex flex-col gap-2">
      <button type="button" className="btn-text inline-flex items-center gap-1" onClick={() => setOpen((o) => !o)}>
        <FileDown size={16} /> تنزيل PDF
      </button>
      {open ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-background/70 p-2 text-sm">
          <label className="flex items-center gap-1">من <input type="date" className="field-input" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="flex items-center gap-1">إلى <input type="date" className="field-input" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          <select className="field-input" value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">كل الأقسام</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <button type="button" className="btn-primary" disabled={busy} onClick={() => void generate()}>
            {busy ? "…" : "إنشاء"}
          </button>
          {error ? <span className="w-full text-destructive">{error}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

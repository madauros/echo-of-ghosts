import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export function SchoolPanel({ client }: { client: SupabaseClient<Database> }) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    void (client as any)
      .from("school_settings")
      .select("*")
      .maybeSingle()
      .then(({ data }: { data: any }) => {
        if (data) {
          setName(data.name);
          setAddress(data.address);
          setPhone(data.phone);
        }
      });
  }, [client]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await (client as any)
      .from("school_settings")
      .upsert({ id: true, name: name.trim(), address: address.trim(), phone: phone.trim() });
    setMsg(error ? { ok: false, text: "تعذّر حفظ المعلومات." } : { ok: true, text: "تم الحفظ." });
    setBusy(false);
  };

  return (
    <section>
      <h2 className="text-lg font-semibold text-foreground">المؤسسة</h2>
      <p className="mt-1 text-sm text-muted-foreground">معلومات المؤسسة التعليمية. يظهر اسمها في المذكرة.</p>
      <form onSubmit={submit} className="mt-6 grid gap-3 rounded-2xl border border-border bg-card p-4">
        <label className="grid gap-1 text-sm text-foreground">
          اسم المؤسسة
          <input className="field-input" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="grid gap-1 text-sm text-foreground">
          العنوان
          <input className="field-input" value={address} onChange={(e) => setAddress(e.target.value)} />
        </label>
        <label className="grid gap-1 text-sm text-foreground">
          رقم الهاتف
          <input className="field-input" dir="ltr" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
        <div>
          <button type="submit" className="btn-primary" disabled={busy}>حفظ</button>
        </div>
        {msg ? <p className={`text-sm ${msg.ok ? "text-muted-foreground" : "text-destructive"}`}>{msg.text}</p> : null}
      </form>
    </section>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Loader2, MessageCircle, Minus, Plus, Search, Send, X } from "lucide-react";
import { toast } from "sonner";
import { adminAPI } from "@food/api";
import { vt } from "@food/utils/adminVerticalLabels";

/**
 * Admin > WhatsApp Messages: send an approved WhatsApp template (promotions)
 * to customers, sellers, riders, picked people or a pasted list of numbers.
 * Separate from push broadcasts. Sending runs in the background on the server;
 * the history below shows the counts as they finish.
 */

const AUDIENCE_OPTIONS = [
  { value: "USER", label: "All customers" },
  { value: "RESTAURANT", label: vt("All sellers") },
  { value: "DELIVERY", label: "All delivery partners" },
  { value: "ALL", label: "Everyone (customers, sellers, delivery partners)" },
  { value: "CUSTOM", label: "Particular persons" },
  { value: "NUMBERS", label: "Phone numbers (paste a list)" },
];
const AUDIENCE_LABEL = Object.fromEntries(AUDIENCE_OPTIONS.map((o) => [o.value, o.label]));
const MAX_TEMPLATE_VALUES = 10;

const getRows = (response) => {
  const payload = response?.data?.data;
  return (
    payload?.items || payload?.restaurants || payload?.partners || payload?.customers ||
    payload?.users || payload?.data || payload?.rows || response?.data?.items || []
  );
};

const toRecipients = (response, ownerType, mapper) =>
  getRows(response).map((item) => mapper(item, ownerType)).filter((item) => item.ownerId);

// Same rule as the server: split on new lines / commas / semicolons (not spaces,
// so "+91 95222 11125" is one number), counting each number once.
const countPasted = (text) =>
  new Set(
    String(text || "")
      .split(/[\n\r,;]+/)
      .map((p) => p.replace(/\D/g, ""))
      .filter(Boolean)
      .map((d) => (d.length === 12 && d.startsWith("91") ? d.slice(2) : d))
  ).size;

const toDateLabel = (value) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true,
  });
};

const resultLabel = (c) => {
  if (c.status === "sending") return "Sending…";
  if (c.status === "failed") return "Failed";
  return `${c.sent || 0} sent${c.failed ? `, ${c.failed} failed` : ""}${c.skipped ? `, ${c.skipped} no valid phone` : ""}`;
};

const inputCls =
  "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100";

export default function WhatsAppMessages() {
  const [configured, setConfigured] = useState(null);
  const [template, setTemplate] = useState("");
  const [language, setLanguage] = useState("en");
  const [values, setValues] = useState([]);
  const [audience, setAudience] = useState("USER");
  const [phonesText, setPhonesText] = useState("");
  const [testPhone, setTestPhone] = useState("");
  const [testing, setTesting] = useState(false);
  const [sending, setSending] = useState(false);

  const [templates, setTemplates] = useState([]);
  const [suggestOpen, setSuggestOpen] = useState(false);

  const [allRecipients, setAllRecipients] = useState([]);
  const [recipientLoading, setRecipientLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState([]);

  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const loadTemplates = () =>
    adminAPI.getWhatsAppTemplates()
      .then((res) => setTemplates(res?.data?.data?.templates || []))
      .catch(() => setTemplates([]));

  const loadHistory = async () => {
    try {
      const res = await adminAPI.getWhatsAppCampaigns({ page: 1, limit: 50 });
      setHistory(res?.data?.data?.items || []);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    adminAPI.getWhatsAppStatus()
      .then((res) => setConfigured(Boolean(res?.data?.data?.configured)))
      .catch(() => setConfigured(false));
    loadTemplates();
    loadHistory();
  }, []);

  // Sends finish in the background; refresh until none is still running.
  const anySending = history.some((c) => c.status === "sending");
  useEffect(() => {
    if (!anySending) return undefined;
    const timer = setInterval(() => { loadHistory(); loadTemplates(); }, 5000);
    return () => clearInterval(timer);
  }, [anySending]);

  useEffect(() => {
    if (audience !== "CUSTOM" || allRecipients.length > 0) return;
    (async () => {
      try {
        setRecipientLoading(true);
        const [customersRes, restaurantsRes, deliveryRes] = await Promise.all([
          adminAPI.getCustomers({ page: 1, limit: 500 }),
          adminAPI.getRestaurants({ page: 1, limit: 500 }),
          adminAPI.getDeliveryPartners({ page: 1, limit: 500 }),
        ]);
        setAllRecipients([
          ...toRecipients(customersRes, "USER", (item, ownerType) => ({
            ownerType, ownerId: String(item?._id || item?.id || ""),
            label: String(item?.name || item?.phone || "Customer").trim(),
            subLabel: [item?.phone, item?.email].filter(Boolean).join(" • "),
          })),
          ...toRecipients(restaurantsRes, "RESTAURANT", (item, ownerType) => ({
            ownerType, ownerId: String(item?._id || item?.id || ""),
            label: String(item?.restaurantName || item?.ownerName || vt("Seller")).trim(),
            subLabel: [item?.ownerPhone, item?.ownerEmail].filter(Boolean).join(" • "),
          })),
          ...toRecipients(deliveryRes, "DELIVERY_PARTNER", (item, ownerType) => ({
            ownerType, ownerId: String(item?._id || item?.id || ""),
            label: String(item?.name || item?.phone || "Delivery Partner").trim(),
            subLabel: [item?.phone, item?.email].filter(Boolean).join(" • "),
          })),
        ]);
      } catch {
        setAllRecipients([]);
      } finally {
        setRecipientLoading(false);
      }
    })();
  }, [audience, allRecipients.length]);

  const suggestions = useMemo(() => {
    const q = template.trim().toLowerCase();
    return q ? templates.filter((t) => t.name.toLowerCase().includes(q)) : templates;
  }, [templates, template]);

  const filteredRecipients = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allRecipients;
    return allRecipients.filter((r) => [r.label, r.subLabel, r.ownerType].join(" ").toLowerCase().includes(q));
  }, [allRecipients, search]);

  const selectedKeys = useMemo(() => new Set(selected.map((r) => `${r.ownerType}:${r.ownerId}`)), [selected]);

  const toggleRecipient = (r) => {
    const key = `${r.ownerType}:${r.ownerId}`;
    setSelected((prev) =>
      prev.some((x) => `${x.ownerType}:${x.ownerId}` === key)
        ? prev.filter((x) => `${x.ownerType}:${x.ownerId}` !== key)
        : [...prev, r]
    );
  };

  const pickTemplate = (t) => {
    const count = Math.min(MAX_TEMPLATE_VALUES, Number(t.variables) || 0);
    setTemplate(t.name);
    setLanguage(t.language || "en");
    setValues(Array.from({ length: count }, (_, i) => t.lastValues?.[i] || ""));
    setSuggestOpen(false);
  };

  const forgetTemplate = async (t) => {
    try {
      await adminAPI.deleteWhatsAppTemplate(t._id);
      setTemplates((prev) => prev.filter((x) => x._id !== t._id));
    } catch {
      toast.error("Could not remove that suggestion");
    }
  };

  const setValueAt = (i, text) => setValues((prev) => prev.map((v, j) => (j === i ? text : v)));

  /** Shared checks for the test and the real send; returns the payload or null. */
  const buildMessage = () => {
    const name = template.trim();
    if (!name) { toast.error("Choose or type a template name"); return null; }
    const cleaned = values.map((v) => String(v ?? "").trim());
    if (cleaned.some((v) => !v)) { toast.error("Fill in every template value"); return null; }
    return { template: name, language: language.trim() || "en", bodyParams: cleaned };
  };

  const handleTest = async () => {
    const msg = buildMessage();
    if (!msg) return;
    if (!testPhone.trim()) return toast.error("Enter a phone number for the test");
    try {
      setTesting(true);
      await adminAPI.sendWhatsAppTest({ phone: testPhone.trim(), ...msg });
      toast.success(`Test sent to ${testPhone.trim()}`);
      loadTemplates();
    } catch (error) {
      toast.error(error?.response?.data?.message || "WhatsApp test failed");
    } finally {
      setTesting(false);
    }
  };

  const recipientSummary =
    audience === "CUSTOM" ? `${selected.length} selected`
      : audience === "NUMBERS" ? `${countPasted(phonesText)} numbers`
        : AUDIENCE_LABEL[audience];

  const handleSend = async () => {
    const msg = buildMessage();
    if (!msg) return;
    if (audience === "CUSTOM" && selected.length === 0) return toast.error("Select at least one person");
    if (audience === "NUMBERS" && countPasted(phonesText) === 0) return toast.error("Paste at least one phone number");
    if (!window.confirm(`Send WhatsApp template "${msg.template}" to ${recipientSummary}?`)) return;
    try {
      setSending(true);
      await adminAPI.createWhatsAppCampaign({
        ...msg,
        audience,
        ...(audience === "CUSTOM"
          ? { targets: selected.map(({ ownerType, ownerId, label, subLabel }) => ({ ownerType, ownerId, label, subLabel })) }
          : {}),
        ...(audience === "NUMBERS" ? { phones: phonesText } : {}),
      });
      toast.success("Sending started. Progress shows in the history below.");
      setSelected([]);
      setPhonesText("");
      await loadHistory();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to start the WhatsApp send");
    } finally {
      setSending(false);
    }
  };

  const disabled = configured === false;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-start gap-4 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <MessageCircle className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">WhatsApp Messages</h1>
            <p className="text-sm text-slate-500 mt-1">
              Send an approved WhatsApp template, such as an offer, to customers, sellers, delivery partners or a list of numbers.
            </p>
          </div>
        </div>

        {configured === false && (
          <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            WhatsApp is not set up on the server yet, so nothing can be sent from here.
          </div>
        )}

        <div className="space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 relative">
              <span className="text-sm font-semibold text-slate-700">Template name</span>
              <input
                value={template}
                onChange={(e) => { setTemplate(e.target.value.toLowerCase().replace(/\s+/g, "_")); setSuggestOpen(true); }}
                onFocus={() => setSuggestOpen(true)}
                onBlur={() => setTimeout(() => setSuggestOpen(false), 150)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setSuggestOpen(false);
                  if (e.key === "Enter" && suggestOpen && suggestions[0]) { e.preventDefault(); pickTemplate(suggestions[0]); }
                }}
                placeholder={templates.length ? "Pick a template or type a new name" : "e.g. weekend_offer"}
                autoComplete="off"
                className={`mt-2 ${inputCls}`}
              />
              {suggestOpen && suggestions.length > 0 && (
                <div className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-lg">
                  <div className="px-4 pt-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Sent successfully before
                  </div>
                  {suggestions.map((t) => (
                    <div key={t._id} className="flex items-center gap-2 px-2 hover:bg-emerald-50">
                      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pickTemplate(t)}
                        className="flex-1 min-w-0 text-left px-2 py-2.5">
                        <div className="text-sm font-semibold text-slate-900 truncate">{t.name}</div>
                        <div className="text-xs text-slate-500">
                          {t.language} · {t.variables} value{t.variables === 1 ? "" : "s"} · used {t.useCount || 1}×
                        </div>
                      </button>
                      <button type="button" title="Stop suggesting this template"
                        onMouseDown={(e) => e.preventDefault()} onClick={() => forgetTemplate(t)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">Language code</span>
              <input value={language} onChange={(e) => setLanguage(e.target.value)} placeholder="en" className={`mt-2 ${inputCls}`} />
            </label>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-700">Template values</span>
              <div className="flex items-center gap-1">
                <button type="button" title="Remove the last value" disabled={values.length === 0}
                  onClick={() => setValues((v) => v.slice(0, -1))}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40">
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="text-xs text-slate-500 w-16 text-center">
                  {values.length} value{values.length === 1 ? "" : "s"}
                </span>
                <button type="button" title="Add a value" disabled={values.length >= MAX_TEMPLATE_VALUES}
                  onClick={() => setValues((v) => [...v, ""])}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40">
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            {values.length === 0 ? (
              <p className="mt-2 text-xs text-slate-500">
                No values. Use + if the template's text has placeholders like {"{{1}}"}.
              </p>
            ) : (
              <div className="mt-2 space-y-2">
                {values.map((value, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-12 shrink-0 text-xs font-mono text-emerald-700">{`{{${i + 1}}}`}</span>
                    <input value={value} onChange={(e) => setValueAt(i, e.target.value)}
                      placeholder={`Value for {{${i + 1}}}`} className={inputCls.replace("py-3", "py-2.5")} />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-emerald-200 bg-emerald-50/40 p-4">
            <div className="flex flex-col sm:flex-row sm:items-end gap-3">
              <label className="block flex-1">
                <span className="text-sm font-semibold text-slate-700">Send a test first</span>
                <input value={testPhone} onChange={(e) => setTestPhone(e.target.value)}
                  placeholder="Your phone number" inputMode="tel" className={`mt-2 ${inputCls}`} />
              </label>
              <button type="button" onClick={handleTest} disabled={testing || disabled}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-emerald-300 bg-white px-5 py-3 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-60">
                {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4" />}
                Send test
              </button>
            </div>
          </div>

          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Send to</span>
            <select value={audience} onChange={(e) => setAudience(e.target.value)} className={`mt-2 ${inputCls}`}>
              {AUDIENCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>

          {audience === "NUMBERS" && (
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">Phone numbers</span>
              <textarea value={phonesText} onChange={(e) => setPhonesText(e.target.value)} rows={5}
                placeholder={"One per line, or separated by commas\n9876543210\n9123456780"}
                className={`mt-2 ${inputCls} resize-y`} />
              <span className="text-xs text-slate-500">
                {countPasted(phonesText)} numbers. One per line or comma-separated; 10-digit Indian mobiles. Duplicates and invalid numbers are skipped.
              </span>
            </label>
          )}

          {audience === "CUSTOM" && (
            <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4 space-y-4">
              <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <Search className="w-4 h-4 text-slate-400" />
                <input value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder={vt("Search customers, sellers, or delivery partners")}
                  className="w-full text-sm bg-transparent outline-none" />
              </div>
              <div className="text-xs font-medium text-slate-500">Selected: {selected.length}</div>
              <div className="max-h-72 overflow-y-auto rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
                {recipientLoading ? (
                  <div className="p-6 text-sm text-slate-500 flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading…
                  </div>
                ) : filteredRecipients.length === 0 ? (
                  <div className="p-6 text-sm text-slate-500">No one found.</div>
                ) : (
                  filteredRecipients.map((r) => {
                    const key = `${r.ownerType}:${r.ownerId}`;
                    return (
                      <label key={key} className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50">
                        <input type="checkbox" checked={selectedKeys.has(key)} onChange={() => toggleRecipient(r)}
                          className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-900">{r.label}</div>
                          <div className="text-xs text-slate-500">
                            {r.ownerType.replaceAll("_", " ")}{r.subLabel ? ` • ${r.subLabel}` : ""}
                          </div>
                        </div>
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-xs text-slate-500 max-w-xl">
              Only templates approved in your WhatsApp business account are delivered. Send marketing messages only
              to people who agreed to receive them.
            </p>
            <button type="button" onClick={handleSend} disabled={sending || disabled}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Send on WhatsApp
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
        <h2 className="text-xl font-bold text-slate-900">History</h2>
        <p className="text-sm text-slate-500 mb-4">WhatsApp sends from this page, newest first.</p>
        {historyLoading ? (
          <div className="py-10 text-sm text-slate-500 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading history…
          </div>
        ) : history.length === 0 ? (
          <div className="py-10 text-sm text-slate-500">No WhatsApp messages sent yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200">
                  <th className="py-3 pr-4 font-semibold">Template</th>
                  <th className="py-3 pr-4 font-semibold">Values</th>
                  <th className="py-3 pr-4 font-semibold">Sent to</th>
                  <th className="py-3 pr-4 font-semibold">Result</th>
                  <th className="py-3 pr-4 font-semibold">Date</th>
                </tr>
              </thead>
              <tbody>
                {history.map((c) => (
                  <tr key={c._id} className="border-b border-slate-100 align-top">
                    <td className="py-4 pr-4 font-semibold text-slate-900">
                      {c.template}<span className="ml-1 text-xs font-normal text-slate-400">{c.language}</span>
                    </td>
                    <td className="py-4 pr-4 text-slate-600 max-w-xs">{(c.bodyParams || []).join(" · ") || "-"}</td>
                    <td className="py-4 pr-4 text-slate-700">
                      {AUDIENCE_LABEL[c.audience] || c.audience}
                      <div className="text-xs text-slate-400">{c.recipientCount} recipients</div>
                    </td>
                    <td className="py-4 pr-4 text-slate-700 whitespace-nowrap"
                      title={(c.failures || []).map((e) => `${e.to}: ${e.error}`).join("\n")}>
                      {resultLabel(c)}
                    </td>
                    <td className="py-4 pr-4 text-slate-500 whitespace-nowrap">{toDateLabel(c.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

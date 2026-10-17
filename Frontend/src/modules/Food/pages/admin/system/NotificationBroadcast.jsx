import { useEffect, useMemo, useState } from "react";
import { BellRing, Loader2, MessageCircle, Minus, Plus, Search, Send, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { adminAPI } from "@food/api";
import { vt } from "@food/utils/adminVerticalLabels";

// values[i] fills the template's {{i+1}}.
const EMPTY_WHATSAPP = { enabled: false, template: "", language: "en", values: [], testPhone: "" };
const MAX_TEMPLATE_VALUES = 10;

const cleanValues = (values) => (Array.isArray(values) ? values : []).map((v) => String(v ?? "").trim());

const whatsappLabel = (wa) => {
  if (!wa || !wa.status || wa.status === "none") return "-";
  if (wa.status === "sending") return "Sending…";
  if (wa.status === "failed") return "Failed";
  return `${wa.sent || 0} sent${wa.failed ? `, ${wa.failed} failed` : ""}${wa.skipped ? `, ${wa.skipped} no phone` : ""}`;
};

const TARGET_OPTIONS = [
  { value: "ALL", label: "All" },
  { value: "USER", label: "Users" },
  { value: "RESTAURANT", label: vt("Sellers") },
  { value: "DELIVERY", label: "Delivery Partners" },
  { value: "CUSTOM", label: "Particular Persons" },
];

const getRows = (response) => {
  const payload = response?.data?.data;
  return (
    payload?.items ||
    payload?.restaurants ||
    payload?.partners ||
    payload?.customers ||
    payload?.users ||
    payload?.data ||
    payload?.rows ||
    response?.data?.items ||
    []
  );
};

const normalizeRecipients = (response, ownerType, mapper) =>
  getRows(response)
    .map((item) => mapper(item, ownerType))
    .filter((item) => item.ownerId);

const toDateLabel = (value) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};

export default function NotificationBroadcast() {
  const [form, setForm] = useState({
    title: "",
    message: "",
    targetType: "ALL",
  });
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [recipientLoading, setRecipientLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [allRecipients, setAllRecipients] = useState([]);
  const [selectedRecipients, setSelectedRecipients] = useState([]);
  const [whatsapp, setWhatsapp] = useState(EMPTY_WHATSAPP);
  const [whatsappConfigured, setWhatsappConfigured] = useState(false);
  const [testing, setTesting] = useState(false);
  const setWa = (patch) => setWhatsapp((prev) => ({ ...prev, ...patch }));
  // Templates that sent successfully before (the server remembers them).
  const [templates, setTemplates] = useState([]);
  const [suggestOpen, setSuggestOpen] = useState(false);

  const loadTemplates = () =>
    adminAPI
      .getWhatsAppTemplates()
      .then((res) => setTemplates(res?.data?.data?.templates || []))
      .catch(() => setTemplates([]));

  const suggestions = useMemo(() => {
    const q = whatsapp.template.trim().toLowerCase();
    return q ? templates.filter((t) => t.name.toLowerCase().includes(q)) : templates;
  }, [templates, whatsapp.template]);

  const pickTemplate = (t) => {
    const count = Math.min(MAX_TEMPLATE_VALUES, Number(t.variables) || 0);
    setWa({
      template: t.name,
      language: t.language || "en",
      values: Array.from({ length: count }, (_, i) => t.lastValues?.[i] || ""),
    });
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

  const setValueAt = (index, text) =>
    setWhatsapp((prev) => {
      const values = [...prev.values];
      values[index] = text;
      return { ...prev, values };
    });

  const loadHistory = async () => {
    try {
      setHistoryLoading(true);
      const response = await adminAPI.getBroadcastNotifications({ page: 1, limit: 50 });
      setHistory(response?.data?.data?.items || []);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const loadRecipients = async () => {
    try {
      setRecipientLoading(true);
      const [customersRes, restaurantsRes, deliveryRes] = await Promise.all([
        adminAPI.getCustomers({ page: 1, limit: 500 }),
        adminAPI.getRestaurants({ page: 1, limit: 500 }),
        adminAPI.getDeliveryPartners({ page: 1, limit: 500 }),
      ]);

      const customers = normalizeRecipients(customersRes, "USER", (item, ownerType) => ({
        ownerType,
        ownerId: String(item?._id || item?.id || ""),
        label: String(item?.name || item?.phone || "User").trim(),
        subLabel: [item?.phone, item?.email].filter(Boolean).join(" • "),
      }));

      const restaurants = normalizeRecipients(restaurantsRes, "RESTAURANT", (item, ownerType) => ({
        ownerType,
        ownerId: String(item?._id || item?.id || ""),
        label: String(item?.restaurantName || item?.ownerName || vt("Seller")).trim(),
        subLabel: [item?.ownerPhone, item?.ownerEmail].filter(Boolean).join(" • "),
      }));

      const deliveryPartners = normalizeRecipients(deliveryRes, "DELIVERY_PARTNER", (item, ownerType) => ({
        ownerType,
        ownerId: String(item?._id || item?.id || ""),
        label: String(item?.name || item?.phone || "Delivery Partner").trim(),
        subLabel: [item?.phone, item?.email].filter(Boolean).join(" • "),
      }));

      setAllRecipients([...customers, ...restaurants, ...deliveryPartners]);
    } catch {
      setAllRecipients([]);
    } finally {
      setRecipientLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
    adminAPI
      .getWhatsAppStatus()
      .then((res) => setWhatsappConfigured(Boolean(res?.data?.data?.configured)))
      .catch(() => setWhatsappConfigured(false));
    loadTemplates();
  }, []);

  // A WhatsApp run finishes in the background; refresh until none is still sending.
  const anySending = history.some((item) => item?.whatsapp?.status === "sending");
  useEffect(() => {
    if (!anySending) return undefined;
    const timer = setInterval(loadHistory, 5000);
    return () => clearInterval(timer);
  }, [anySending]);

  const handleWhatsAppTest = async () => {
    const template = whatsapp.template.trim();
    if (!template) return toast.error("Enter the WhatsApp template name");
    if (!whatsapp.testPhone.trim()) return toast.error("Enter a phone number for the test");
    const values = cleanValues(whatsapp.values);
    if (values.some((v) => !v)) return toast.error("Fill in every template value");
    try {
      setTesting(true);
      await adminAPI.sendWhatsAppTest({
        phone: whatsapp.testPhone.trim(),
        template,
        language: whatsapp.language.trim() || "en",
        bodyParams: values,
      });
      toast.success(`Test sent to ${whatsapp.testPhone.trim()}`);
      loadTemplates();
    } catch (error) {
      toast.error(error?.response?.data?.message || "WhatsApp test failed");
    } finally {
      setTesting(false);
    }
  };

  useEffect(() => {
    if (form.targetType !== "CUSTOM") return;
    if (allRecipients.length > 0) return;
    loadRecipients();
  }, [allRecipients.length, form.targetType]);

  useEffect(() => {
    if (form.targetType !== "CUSTOM") {
      setSelectedRecipients([]);
      setSearch("");
    }
  }, [form.targetType]);

  const filteredRecipients = useMemo(() => {
    const keyword = String(search || "").trim().toLowerCase();
    if (!keyword) return allRecipients;
    return allRecipients.filter((item) =>
      [item.label, item.subLabel, item.ownerType]
        .join(" ")
        .toLowerCase()
        .includes(keyword)
    );
  }, [allRecipients, search]);

  const selectedKeys = useMemo(
    () => new Set(selectedRecipients.map((item) => `${item.ownerType}:${item.ownerId}`)),
    [selectedRecipients]
  );

  const toggleRecipient = (recipient) => {
    const key = `${recipient.ownerType}:${recipient.ownerId}`;
    setSelectedRecipients((prev) =>
      prev.some((item) => `${item.ownerType}:${item.ownerId}` === key)
        ? prev.filter((item) => `${item.ownerType}:${item.ownerId}` !== key)
        : [...prev, recipient]
    );
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.title.trim() || !form.message.trim()) return;
    if (form.targetType === "CUSTOM" && selectedRecipients.length === 0) return;
    if (whatsapp.enabled && !whatsapp.template.trim()) {
      toast.error("Enter the WhatsApp template name, or turn WhatsApp off");
      return;
    }
    if (whatsapp.enabled && cleanValues(whatsapp.values).some((v) => !v)) {
      toast.error("Fill in every WhatsApp template value");
      return;
    }

    try {
      setSubmitting(true);
      await adminAPI.createBroadcastNotification({
        ...(whatsapp.enabled
          ? {
              whatsapp: {
                template: whatsapp.template.trim(),
                language: whatsapp.language.trim() || "en",
                bodyParams: cleanValues(whatsapp.values),
              },
            }
          : {}),
        title: form.title.trim(),
        message: form.message.trim(),
        targetType: form.targetType,
        targetIds:
          form.targetType === "CUSTOM"
            ? selectedRecipients.map((item) => item.ownerId)
            : [],
        targets:
          form.targetType === "CUSTOM"
            ? selectedRecipients.map((item) => ({
                ownerType: item.ownerType,
                ownerId: item.ownerId,
                label: item.label,
                subLabel: item.subLabel,
              }))
            : [],
      });
      toast.success(whatsapp.enabled ? "Broadcast sent. WhatsApp is sending in the background." : "Broadcast sent");
      setForm({ title: "", message: "", targetType: "ALL" });
      setSelectedRecipients([]);
      setSearch("");
      setWhatsapp((prev) => ({ ...EMPTY_WHATSAPP, testPhone: prev.testPhone }));
      window.dispatchEvent(new Event("adminBroadcastUpdated"));
      await loadHistory();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to send broadcast");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!id) return;
    try {
      await adminAPI.deleteBroadcastNotification(id);
      window.dispatchEvent(new Event("adminBroadcastUpdated"));
      await loadHistory();
    } catch {}
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-start gap-4 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <BellRing className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Broadcast Notification</h1>
            <p className="text-sm text-slate-500 mt-1">
              Send one notification to all, role-based, or selected recipients without touching other admin flows.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">Title</span>
              <input
                value={form.title}
                onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                placeholder="Enter notification title"
                className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </label>

            <label className="block">
              <span className="text-sm font-semibold text-slate-700">Target Type</span>
              <select
                value={form.targetType}
                onChange={(event) => setForm((prev) => ({ ...prev, targetType: event.target.value }))}
                className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                {TARGET_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Message</span>
            <textarea
              value={form.message}
              onChange={(event) => setForm((prev) => ({ ...prev, message: event.target.value }))}
              placeholder="Enter notification message"
              rows={5}
              className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 resize-y"
            />
          </label>

          {form.targetType === "CUSTOM" && (
            <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4 space-y-4">
              <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <Search className="w-4 h-4 text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={vt("Search users, sellers, or delivery partners")}
                  className="w-full text-sm bg-transparent outline-none"
                />
              </div>

              <div className="text-xs font-medium text-slate-500">
                Selected recipients: {selectedRecipients.length}
              </div>

              <div className="max-h-72 overflow-y-auto rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
                {recipientLoading ? (
                  <div className="p-6 text-sm text-slate-500 flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading recipients...
                  </div>
                ) : filteredRecipients.length === 0 ? (
                  <div className="p-6 text-sm text-slate-500">No recipients found.</div>
                ) : (
                  filteredRecipients.map((recipient) => {
                    const key = `${recipient.ownerType}:${recipient.ownerId}`;
                    const checked = selectedKeys.has(key);
                    return (
                      <label
                        key={key}
                        className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleRecipient(recipient)}
                          className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-900">
                            {recipient.label}
                          </div>
                          <div className="text-xs text-slate-500">
                            {recipient.ownerType.replaceAll("_", " ")}
                            {recipient.subLabel ? ` • ${recipient.subLabel}` : ""}
                          </div>
                        </div>
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          )}

          <div className="rounded-3xl border border-emerald-200 bg-emerald-50/40 p-4 space-y-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={whatsapp.enabled}
                disabled={!whatsappConfigured}
                onChange={(event) => setWa({ enabled: event.target.checked })}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <MessageCircle className="w-4 h-4 text-emerald-600" />
                  Also send on WhatsApp
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  {whatsappConfigured
                    ? "Sends an approved WhatsApp template to the same recipients' phone numbers, in the background."
                    : "WhatsApp is not set up on the server yet."}
                </p>
              </div>
            </label>

            {whatsapp.enabled && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="block lg:col-span-2 relative">
                    <span className="text-sm font-semibold text-slate-700">Template name</span>
                    <input
                      value={whatsapp.template}
                      onChange={(event) => {
                        setWa({ template: event.target.value.toLowerCase().replace(/\s+/g, "_") });
                        setSuggestOpen(true);
                      }}
                      onFocus={() => setSuggestOpen(true)}
                      // Delay so a click on a suggestion lands before the list closes.
                      onBlur={() => setTimeout(() => setSuggestOpen(false), 150)}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") setSuggestOpen(false);
                        if (event.key === "Enter" && suggestOpen && suggestions[0]) {
                          event.preventDefault();
                          pickTemplate(suggestions[0]);
                        }
                      }}
                      placeholder={templates.length ? "Pick a template or type a new name" : "e.g. weekend_offer"}
                      autoComplete="off"
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                    />
                    {suggestOpen && suggestions.length > 0 && (
                      <div className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-lg">
                        <div className="px-4 pt-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                          Sent successfully before
                        </div>
                        {suggestions.map((t) => (
                          <div key={t._id} className="flex items-center gap-2 px-2 hover:bg-emerald-50">
                            <button
                              type="button"
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => pickTemplate(t)}
                              className="flex-1 min-w-0 text-left px-2 py-2.5"
                            >
                              <div className="text-sm font-semibold text-slate-900 truncate">{t.name}</div>
                              <div className="text-xs text-slate-500">
                                {t.language} · {t.variables} value{t.variables === 1 ? "" : "s"} · used {t.useCount || 1}×
                              </div>
                            </button>
                            <button
                              type="button"
                              title="Stop suggesting this template"
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => forgetTemplate(t)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <label className="block">
                    <span className="text-sm font-semibold text-slate-700">Language code</span>
                    <input
                      value={whatsapp.language}
                      onChange={(event) => setWa({ language: event.target.value })}
                      placeholder="en"
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                    />
                  </label>
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-700">Template values</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        title="Remove the last value"
                        disabled={whatsapp.values.length === 0}
                        onClick={() => setWa({ values: whatsapp.values.slice(0, -1) })}
                        className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-xs text-slate-500 w-16 text-center">
                        {whatsapp.values.length} value{whatsapp.values.length === 1 ? "" : "s"}
                      </span>
                      <button
                        type="button"
                        title="Add a value"
                        disabled={whatsapp.values.length >= MAX_TEMPLATE_VALUES}
                        onClick={() => setWa({ values: [...whatsapp.values, ""] })}
                        className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  {whatsapp.values.length === 0 ? (
                    <p className="mt-2 text-xs text-slate-500">
                      No values. Use + if the template's text has placeholders like {"{{1}}"}.
                    </p>
                  ) : (
                    <div className="mt-2 space-y-2">
                      {whatsapp.values.map((value, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <span className="w-12 shrink-0 text-xs font-mono text-emerald-700">{`{{${index + 1}}}`}</span>
                          <input
                            value={value}
                            onChange={(event) => setValueAt(index, event.target.value)}
                            placeholder={`Value for {{${index + 1}}}`}
                            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                  <label className="block flex-1">
                    <span className="text-sm font-semibold text-slate-700">Send a test first</span>
                    <input
                      value={whatsapp.testPhone}
                      onChange={(event) => setWa({ testPhone: event.target.value })}
                      placeholder="Your phone number"
                      inputMode="tel"
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={handleWhatsAppTest}
                    disabled={testing}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-emerald-300 bg-white px-5 py-3 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
                  >
                    {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4" />}
                    Send test
                  </button>
                </div>
                <p className="text-xs text-slate-500">
                  Only templates approved in your WhatsApp business account are delivered. Send marketing
                  messages only to people who agreed to receive them.
                </p>
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Send Broadcast
            </button>
          </div>
        </form>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">History</h2>
            <p className="text-sm text-slate-500">Latest sent broadcasts and their targets.</p>
          </div>
        </div>

        {historyLoading ? (
          <div className="py-10 text-sm text-slate-500 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading history...
          </div>
        ) : history.length === 0 ? (
          <div className="py-10 text-sm text-slate-500">No broadcast notifications found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200">
                  <th className="py-3 pr-4 font-semibold">Title</th>
                  <th className="py-3 pr-4 font-semibold">Message</th>
                  <th className="py-3 pr-4 font-semibold">Target</th>
                  <th className="py-3 pr-4 font-semibold">Recipients</th>
                  <th className="py-3 pr-4 font-semibold">WhatsApp</th>
                  <th className="py-3 pr-4 font-semibold">Date</th>
                  <th className="py-3 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {history.map((item) => (
                  <tr key={item?._id} className="border-b border-slate-100 align-top">
                    <td className="py-4 pr-4 font-semibold text-slate-900">{item?.title || "Notification"}</td>
                    <td className="py-4 pr-4 text-slate-600 max-w-sm">{item?.message || "-"}</td>
                    <td className="py-4 pr-4 text-slate-700">{item?.targetLabel || item?.targetType}</td>
                    <td className="py-4 pr-4 text-slate-700">{item?.targetCount || item?.targets?.length || 0}</td>
                    <td className="py-4 pr-4 text-slate-700 whitespace-nowrap" title={item?.whatsapp?.template ? `Template: ${item.whatsapp.template}` : ""}>
                      {whatsappLabel(item?.whatsapp)}
                    </td>
                    <td className="py-4 pr-4 text-slate-500 whitespace-nowrap">{toDateLabel(item?.createdAt)}</td>
                    <td className="py-4 text-right">
                      <button
                        type="button"
                        onClick={() => handleDelete(item?._id)}
                        className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                        Delete
                      </button>
                    </td>
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

import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { adminAPI } from "@food/api";
import AccessPicker from "./AccessPicker";

// Change which sidebar options a sub-admin can open.
export default function EmployeeRole() {
  const [searchParams] = useSearchParams();
  const subAdminId = searchParams.get("id");
  const [subAdmin, setSubAdmin] = useState(null);
  const [access, setAccess] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!subAdminId) return;
    setLoading(true);
    try {
      const res = await adminAPI.getSubAdminById(subAdminId);
      const sa = res?.data?.data?.subAdmin || null;
      setSubAdmin(sa);
      setAccess(sa?.access || {});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [subAdminId]);

  const save = async () => {
    setSaving(true);
    try {
      await adminAPI.updateSubAdminPermissions(subAdminId, access);
      toast.success("Access saved. It applies on their next action.");
      await load();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Could not save access");
    } finally {
      setSaving(false);
    }
  };

  if (!subAdminId) {
    return <div className="p-6 text-sm text-red-600">Open this from the Sub Admin List.</div>;
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Sidebar access</h1>
          <p className="text-sm text-slate-600 mt-1">
            {subAdmin ? `${subAdmin.name || "Unnamed"} (${subAdmin.email})` : "Loading…"}
          </p>
        </div>
        <Link to="/admin/store/employees" className="px-3 py-2 border rounded-lg text-sm">Back to list</Link>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-5">
        {loading ? <p className="text-sm text-slate-500">Loading…</p> : <AccessPicker value={access} onChange={setAccess} />}
      </div>

      <button disabled={!subAdmin || saving} onClick={save} className="px-4 py-2 bg-black text-white rounded-lg disabled:opacity-50">
        {saving ? "Saving…" : "Save access"}
      </button>
    </div>
  );
}

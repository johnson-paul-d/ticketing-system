import { useCallback, useEffect, useRef, useState } from "react";
import { Signature, Upload, Trash2, Loader2, CheckCircle2 } from "lucide-react";
import MainLayout from "../layouts/MainLayout";
import api from "../services/api";

const ACCEPTED_TYPES = ["image/png", "image/jpeg"];
const MAX_BYTES = 2 * 1024 * 1024;

export default function SignatureSettings() {
  const fileInputRef = useRef(null);

  // The blob URL is held in a ref as well as state so it can be revoked when it
  // is replaced, not only on unmount — a re-upload would otherwise leak the old
  // one for the lifetime of the tab.
  const urlRef = useRef("");
  const [previewUrl, setPreviewUrl] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const setPreview = (url) => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = url;
    setPreviewUrl(url);
  };

  const loadSignature = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/users/me/signature", { responseType: "blob" });
      setPreview(URL.createObjectURL(res.data));
    } catch (err) {
      setPreview("");
      // 404 is the normal "none set yet" case, not a failure worth showing.
      if (err.response?.status && err.response.status !== 404) {
        setError("Could not load your saved signature");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSignature();
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, [loadSignature]);

  const upload = async (file) => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const form = new FormData();
      form.append("file", file);
      await api.post("/users/me/signature", form);
      setNotice("Signature saved");
      await loadSignature();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save signature");
    } finally {
      setSaving(false);
    }
  };

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    // Cleared straight away so picking the same file twice still fires onChange.
    e.target.value = "";
    if (!file) return;

    setError("");
    setNotice("");
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError("Choose a PNG or JPEG image");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Image must be 2 MB or smaller");
      return;
    }
    upload(file);
  };

  const removeSignature = async () => {
    setRemoving(true);
    setError("");
    setNotice("");
    try {
      await api.delete("/users/me/signature");
      setPreview("");
      setConfirmRemove(false);
      setNotice("Signature removed");
    } catch (err) {
      setError(err.response?.data?.message || "Failed to remove signature");
    } finally {
      setRemoving(false);
    }
  };

  const btnPrimary =
    "inline-flex items-center justify-center gap-2 bg-[#9b2423] hover:bg-[#7d1d1c] disabled:opacity-60 text-white font-semibold text-sm px-6 py-3 rounded-xl";
  const btnGhost =
    "inline-flex items-center justify-center gap-2 text-sm font-semibold px-5 py-3 rounded-xl bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-60";

  return (
    <MainLayout>
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-3">
          <Signature className="text-[#9b2423]" size={28} /> My Signature
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          This signature is stamped on the expense claims you approve, and only you can set it.
        </p>
      </div>

      <div className="bg-white p-5 sm:p-6 rounded-2xl shadow-sm max-w-2xl">
        {error && (
          <div className="mb-4 bg-red-50 text-red-700 text-sm px-4 py-3 rounded-xl border border-red-200">
            {error}
          </div>
        )}

        {notice && (
          <div className="mb-4 bg-emerald-50 text-emerald-700 text-sm px-4 py-3 rounded-xl border border-emerald-200 flex items-center gap-2">
            <CheckCircle2 size={16} className="flex-shrink-0" />
            {notice}
          </div>
        )}

        <h2 className="text-base font-semibold mb-4">Current signature</h2>

        {loading ? (
          <div className="flex items-center justify-center h-40 text-gray-400 gap-2 border border-dashed border-gray-200 rounded-xl">
            <Loader2 size={18} className="animate-spin" /> Loading…
          </div>
        ) : previewUrl ? (
          <div className="flex items-center justify-center h-40 bg-gray-50 border border-gray-200 rounded-xl p-4">
            <img
              src={previewUrl}
              alt="Your approval signature"
              className="max-h-full max-w-full object-contain"
            />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-40 text-gray-400 text-sm gap-2 border border-dashed border-gray-200 rounded-xl">
            <Signature size={26} className="text-gray-300" />
            No signature uploaded yet
          </div>
        )}

        <p className="text-xs text-gray-500 mt-3">
          PNG or JPEG, 2 MB maximum. A tight crop of a signature on a plain white background
          reproduces best; a transparent PNG is ideal.
        </p>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg"
          onChange={handleFile}
          className="hidden"
        />

        <div className="flex flex-col sm:flex-row gap-3 mt-5">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={saving || removing}
            className={btnPrimary}
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
            {previewUrl ? "Replace Signature" : "Upload Signature"}
          </button>

          {previewUrl && !confirmRemove && (
            <button
              onClick={() => setConfirmRemove(true)}
              disabled={saving || removing}
              className={btnGhost}
            >
              <Trash2 size={16} /> Remove
            </button>
          )}
        </div>

        {confirmRemove && (
          <div className="mt-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm">
            <p className="text-red-700 font-medium">Remove your signature?</p>
            <p className="text-red-600/80 text-xs mt-1">
              Claims you approve from now on will be stamped without an image. Already-approved
              claims are unaffected.
            </p>
            <div className="flex gap-2 mt-3">
              <button
                onClick={removeSignature}
                disabled={removing}
                className="inline-flex items-center justify-center gap-2 bg-[#9b2423] hover:bg-[#7d1d1c] disabled:opacity-60 text-white font-semibold text-xs px-4 py-2 rounded-lg"
              >
                {removing ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                Yes, remove
              </button>
              <button
                onClick={() => setConfirmRemove(false)}
                disabled={removing}
                className="text-xs font-semibold px-4 py-2 rounded-lg bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  );
}

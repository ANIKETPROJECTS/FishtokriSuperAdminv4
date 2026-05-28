import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Building2, Plus, Search, X, Trash2, ChevronDown, ChevronRight, SlidersHorizontal, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { PaginationBar } from "@/components/pagination-bar";
import { usePaginated } from "@/hooks/use-paginated";
import { getCurrentAdminScope } from "@/lib/api";

function getToken() { return localStorage.getItem("fishtokri_token") ?? ""; }

async function apiFetch(path: string, options: RequestInit = {}) {
  const base = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";
  const res = await fetch(`${base}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}`, ...(options.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message ?? "Request failed");
  return data;
}

function toInputDate(d: Date) { return d.toISOString().split("T")[0]; }
function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

type SuperHub = { id: string; name: string; location?: string };
type SubHub = { id: string; name: string; location?: string };
type Batch = { id: string; batchNumber: string; quantity: number; shelfLifeDays: number | null; receivedDate: string | null; expiryDate: string | null; notes: string };
type Product = { id: string; name: string; category: string; unit: string; quantity: number; batches?: Batch[] };

type FormMode = "add" | "remove";
type FormRow = {
  productId: string;
  productName: string;
  category: string;
  unit: string;
  quantityBefore: number;
  mode: FormMode;
  addQuantity: string;
  shelfLifeDays: string;
  expiryDate: string;
  batchNumber: string;
  removeQuantity: string;
  search: string;
};

type Adjustment = {
  _id: string;
  date: string;
  reason: string;
  notes: string;
  superHubName?: string;
  subHubName?: string;
  items: Array<{
    productName: string; unit: string; quantityBefore: number; newQuantity: number; quantityAdjusted: number;
    mode?: string;
    batch?: { batchNumber?: string; quantity?: number; shelfLifeDays?: number | null; expiryDate?: string | null };
  }>;
  createdAt: string;
};

const REASONS = [
  "Stock damaged", "Stock wastage", "Stocking new inventory",
  "EXTRA SKU", "SKU TRANSFER", "Stock correction", "Other",
];

function emptyRow(): FormRow {
  return {
    productId: "", productName: "", category: "", unit: "", quantityBefore: 0,
    mode: "add", addQuantity: "", shelfLifeDays: "", expiryDate: "", batchNumber: "",
    removeQuantity: "", search: "",
  };
}

function addDaysISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function formatExpiry(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" });
}

function daysUntil(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

function LockedHubBadge({ label, name, location }: { label: string; name: string; location?: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 hidden sm:inline">{label}</span>
      <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 min-w-0">
        <Building2 className="w-3.5 h-3.5 text-[#364F9F] flex-shrink-0" />
        <span className="text-sm font-semibold text-[#162B4D] truncate">{name}</span>
        {location && <span className="text-[11px] text-gray-400 hidden md:inline truncate">· {location}</span>}
        <Lock className="w-3 h-3 text-gray-300 flex-shrink-0 ml-0.5" />
      </div>
    </div>
  );
}

function ProductSelector({
  row, idx, allProducts, usedIds, onSelect, onClear, onSearchChange,
}: {
  row: FormRow;
  idx: number;
  allProducts: Product[];
  usedIds: Set<string>;
  onSelect: (idx: number, p: Product) => void;
  onClear: (idx: number) => void;
  onSearchChange: (idx: number, val: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);

  const available = allProducts.filter((p) => !(usedIds.has(p.id) && p.id !== row.productId));
  const grouped: Record<string, Product[]> = {};
  for (const p of available) {
    const cat = p.category || "Uncategorized";
    (grouped[cat] = grouped[cat] || []).push(p);
  }
  const categories = Object.keys(grouped).sort();

  const q = row.search.trim().toLowerCase();
  const isSearching = q.length > 0;
  const searchResults = isSearching
    ? available.filter((p) => p.name.toLowerCase().includes(q) || (p.category || "").toLowerCase().includes(q))
    : [];

  function doClose() { setOpen(false); setSelectedCategory(null); }
  function doOpen() { if (!open) setSelectedCategory(null); setOpen(true); }

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      if (wrapperRef.current?.contains(target)) return;
      if (portalRef.current?.contains(target)) return;
      doClose();
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  let style: React.CSSProperties = { display: "none" };
  if (open && wrapperRef.current) {
    const r = wrapperRef.current.getBoundingClientRect();
    style = {
      position: "fixed", top: r.bottom + 4, left: r.left,
      width: isSearching ? Math.max(r.width, 272) : 560, zIndex: 9999,
    };
  }

  const dropdown = (
    <div ref={portalRef} style={style} className="bg-white border border-gray-200 rounded-xl shadow-2xl overflow-hidden">
      {isSearching ? (
        <>
          <div className="px-3 py-2 border-b border-gray-100 bg-gray-50">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Search results</span>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {searchResults.length === 0 ? (
              <div className="px-4 py-4 text-sm text-gray-400 text-center">No products found</div>
            ) : searchResults.map((p) => (
              <button
                key={p.id} type="button"
                onMouseDown={(e) => { e.preventDefault(); onSelect(idx, p); doClose(); }}
                className="w-full text-left px-4 py-2.5 hover:bg-blue-50 transition-colors flex items-center justify-between gap-3 border-b border-gray-50 last:border-0"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{p.name}</p>
                  <p className="text-xs text-gray-400">{p.category || "Uncategorized"}</p>
                </div>
                <p className="text-xs font-semibold text-gray-500 flex-shrink-0">
                  {p.quantity} <span className="font-normal text-gray-400">{p.unit}</span>
                </p>
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="grid grid-cols-[260px_300px]">
          <div className="border-r border-gray-100">
            <div className="px-3 py-2.5 border-b border-gray-100 bg-gray-50">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Select Category</span>
            </div>
            <div className="max-h-64 overflow-y-auto">
              {categories.length === 0 ? (
                <div className="px-4 py-4 text-sm text-gray-400 text-center">No categories</div>
              ) : categories.map((cat) => (
                <button
                  key={cat} type="button"
                  onMouseEnter={() => setSelectedCategory(cat)}
                  onMouseDown={(e) => { e.preventDefault(); setSelectedCategory(cat); }}
                  className={`w-full text-left px-4 py-3 transition-colors flex items-center justify-between gap-2 border-b border-gray-50 last:border-0 ${
                    selectedCategory === cat ? "bg-blue-50" : "hover:bg-blue-50"
                  }`}
                >
                  <span className="text-sm font-medium text-gray-800">{cat}</span>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">{grouped[cat]?.length ?? 0}</span>
                    <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                  </div>
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="px-3 py-2.5 border-b border-gray-100 bg-gray-50">
              <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">{selectedCategory ?? "Hover a category"}</span>
            </div>
            <div className="max-h-64 overflow-y-auto">
              {selectedCategory === null ? (
                <div className="px-4 py-8 text-sm text-gray-400 text-center">Hover a category to see products</div>
              ) : (grouped[selectedCategory] ?? []).length === 0 ? (
                <div className="px-4 py-4 text-sm text-gray-400 text-center">No products</div>
              ) : (grouped[selectedCategory] ?? []).map((p) => (
                <button
                  key={p.id} type="button"
                  onMouseDown={(e) => { e.preventDefault(); onSelect(idx, p); doClose(); }}
                  className="w-full text-left px-4 py-2.5 hover:bg-blue-50 transition-colors flex items-center justify-between gap-3 border-b border-gray-50 last:border-0"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{p.name}</p>
                    <p className="text-xs text-gray-400">{p.unit || "—"}</p>
                  </div>
                  <p className="text-xs font-semibold text-gray-500 flex-shrink-0">
                    {p.quantity} <span className="font-normal text-gray-400">{p.unit}</span>
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div ref={wrapperRef} className="relative w-full" onMouseEnter={doOpen}>
      <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none z-10" />
      <input
        type="text" value={row.search}
        onChange={(e) => { onSearchChange(idx, e.target.value); setOpen(true); }}
        onFocus={doOpen}
        placeholder="Choose Product"
        className={`w-full h-9 pl-8 pr-8 text-sm border rounded-md outline-none transition-all
          focus:ring-2 focus:ring-blue-200 focus:border-blue-400
          ${row.productId ? "bg-blue-50/40 border-blue-200 text-gray-800 font-medium" : "border-gray-200 bg-white text-gray-600"}`}
      />
      <div className="absolute right-2 top-1/2 -translate-y-1/2">
        {row.productId ? (
          <button type="button" onMouseDown={(e) => { e.preventDefault(); onClear(idx); doClose(); }}
            className="text-gray-400 hover:text-red-500 transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        ) : (
          <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform pointer-events-none ${open ? "rotate-180" : ""}`} />
        )}
      </div>
      {open && createPortal(dropdown, document.body)}
    </div>
  );
}

export default function InventoryStockAdjustment() {
  const { toast } = useToast();
  const [view, setView] = useState<"list" | "form">("list");
  const [superHubs, setSuperHubs] = useState<SuperHub[]>([]);
  const [subHubs, setSubHubs] = useState<SubHub[]>([]);
  const [selectedSuperHubId, setSelectedSuperHubId] = useState("");
  const [selectedSubHubId, setSelectedSubHubId] = useState("");
  const [selectedSuperHub, setSelectedSuperHub] = useState<SuperHub | null>(null);
  const [selectedSubHub, setSelectedSubHub] = useState<SubHub | null>(null);

  const [products, setProducts] = useState<Product[]>([]);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [formDate, setFormDate] = useState(toInputDate(new Date()));
  const [formReason, setFormReason] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formRows, setFormRows] = useState<FormRow[]>([emptyRow()]);

  useEffect(() => {
    apiFetch("/api/super-hubs")
      .then((d) => setSuperHubs(d.superHubs ?? []))
      .catch((err) => toast({ title: "Failed to load super hubs", description: err.message, variant: "destructive" }));
  }, [toast]);

  const adminScope = useMemo(() => getCurrentAdminScope(), []);

  // Auto-select + lock to Mumbai
  useEffect(() => {
    if (!superHubs.length) return;
    const mumbai = superHubs.find((h) => h.name.toLowerCase().includes("mumbai"));
    if (mumbai && !selectedSuperHubId) {
      setSelectedSuperHubId(mumbai.id);
      setSelectedSuperHub(mumbai);
      return;
    }
    if (selectedSuperHubId) return;
    if (adminScope.role === "super_hub" && superHubs.length === 1) {
      setSelectedSuperHubId(superHubs[0].id);
      setSelectedSuperHub(superHubs[0]);
    }
  }, [superHubs]);

  useEffect(() => {
    if (!selectedSuperHubId) { setSubHubs([]); setSelectedSubHubId(""); setSelectedSuperHub(null); return; }
    const sh = superHubs.find((h) => h.id === selectedSuperHubId);
    if (sh) setSelectedSuperHub(sh);
    apiFetch(`/api/super-hubs/${selectedSuperHubId}/sub-hubs`)
      .then((d) => setSubHubs(d.subHubs ?? []))
      .catch((err) => toast({ title: "Failed to load sub hubs", description: err.message, variant: "destructive" }));
    setSelectedSubHubId("");
    setSelectedSubHub(null);
  }, [selectedSuperHubId, toast]);

  // Auto-select + lock to Thane
  useEffect(() => {
    if (!subHubs.length) return;
    const thane = subHubs.find((h) => h.name.toLowerCase().includes("thane"));
    if (thane && !selectedSubHubId) {
      setSelectedSubHubId(thane.id);
      setSelectedSubHub(thane);
      return;
    }
    if (selectedSubHubId) return;
    if (adminScope.role === "super_hub" && subHubs.length === 1) {
      setSelectedSubHubId(subHubs[0].id);
      setSelectedSubHub(subHubs[0]);
    }
  }, [subHubs]);

  useEffect(() => {
    const sh = subHubs.find((h) => h.id === selectedSubHubId);
    if (sh) setSelectedSubHub(sh);
  }, [selectedSubHubId, subHubs]);

  function reload() {
    if (!selectedSubHubId) { setProducts([]); setAdjustments([]); return; }
    setLoading(true);
    Promise.all([
      apiFetch(`/api/inventory/products?subHubId=${selectedSubHubId}`),
      apiFetch(`/api/inventory/adjustments?subHubId=${selectedSubHubId}`),
    ])
      .then(([prodRes, adjRes]) => {
        setProducts(prodRes.products ?? []);
        setAdjustments(adjRes.adjustments ?? []);
      })
      .catch((err) => toast({ title: "Failed to load", description: err.message, variant: "destructive" }))
      .finally(() => setLoading(false));
  }

  useEffect(reload, [selectedSubHubId]);

  const pagedAdjustments = usePaginated(adjustments, 20, selectedSubHubId);

  function openForm() {
    setFormDate(toInputDate(new Date()));
    setFormReason("");
    setFormNotes("");
    setFormRows([emptyRow()]);
    setView("form");
  }

  function addRow() { setFormRows((rows) => [...rows, emptyRow()]); }
  function removeRow(i: number) { setFormRows((rows) => rows.filter((_, idx) => idx !== i)); }
  function updateRow(i: number, patch: Partial<FormRow>) {
    setFormRows((rows) => rows.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  }
  function selectProduct(i: number, p: Product) {
    setFormRows((rows) => rows.map((r, idx) => idx === i ? {
      ...r, productId: p.id, productName: p.name, category: p.category || "", unit: p.unit, quantityBefore: p.quantity, search: p.name,
    } : r));
  }
  function clearProduct(i: number) {
    updateRow(i, { productId: "", productName: "", category: "", unit: "", quantityBefore: 0, search: "" });
  }
  function onSearchChange(i: number, val: string) {
    updateRow(i, { search: val, productId: "", productName: "", category: "", unit: "", quantityBefore: 0 });
  }

  function setShelfLife(i: number, val: string) {
    const days = Number(val);
    const expiry = val !== "" && Number.isFinite(days) ? addDaysISO(days) : "";
    updateRow(i, { shelfLifeDays: val, expiryDate: expiry });
  }
  function setExpiryDate(i: number, val: string) {
    updateRow(i, { expiryDate: val, shelfLifeDays: "" });
  }

  async function handleSave() {
    const validRows = formRows.filter((r) =>
      r.productId && (
        (r.mode === "add" && r.addQuantity !== "" && Number(r.addQuantity) > 0) ||
        (r.mode === "remove" && r.removeQuantity !== "" && Number(r.removeQuantity) > 0)
      )
    );
    if (validRows.length === 0) { toast({ title: "Add at least one product with a quantity", variant: "destructive" }); return; }
    if (!formReason.trim()) { toast({ title: "Reason is required", variant: "destructive" }); return; }
    const missingExpiry = validRows.find((r) => r.mode === "add" && !r.shelfLifeDays && !r.expiryDate);
    if (missingExpiry) {
      toast({ title: "Set shelf life or expiry", description: `Add shelf life (days) or an expiry date for ${missingExpiry.productName}.`, variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await apiFetch("/api/inventory/adjustments", {
        method: "POST",
        body: JSON.stringify({
          subHubId: selectedSubHubId,
          superHubId: selectedSuperHubId,
          date: formDate,
          reason: formReason,
          notes: formNotes,
          items: validRows.map((r) => r.mode === "add"
            ? {
                productId: r.productId,
                mode: "add",
                addQuantity: Number(r.addQuantity),
                shelfLifeDays: r.shelfLifeDays !== "" ? Number(r.shelfLifeDays) : undefined,
                expiryDate: r.expiryDate || undefined,
                batchNumber: r.batchNumber || undefined,
              }
            : {
                productId: r.productId,
                mode: "remove",
                removeQuantity: Number(r.removeQuantity),
              }
          ),
        }),
      });
      toast({ title: "Stock adjustment saved" });
      setView("list");
      reload();
    } catch (err: any) {
      toast({ title: "Failed to save", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  const usedIds = useMemo(() => new Set(formRows.map((r) => r.productId).filter(Boolean)), [formRows]);

  // Header portal content
  const headerSlot = document.getElementById("page-header-slot");
  const headerContent = (
    <div className="flex items-center justify-between w-full gap-4 min-w-0">
      <div className="min-w-0 flex-shrink-0">
        <p className="text-sm font-bold text-[#162B4D] leading-tight">
          {view === "form" ? "Add Stock Adjustment" : "Inventory Stock Adjustment"}
        </p>
        <p className="text-[11px] text-gray-400 leading-tight hidden sm:block">Adjust quantities for multiple products at once.</p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {selectedSuperHub && (
          <LockedHubBadge label="Super Hub" name={selectedSuperHub.name} location={selectedSuperHub.location} />
        )}
        {selectedSuperHub && selectedSubHub && (
          <ChevronRight className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
        )}
        {selectedSubHub && (
          <LockedHubBadge label="Sub Hub" name={selectedSubHub.name} location={selectedSubHub.location} />
        )}
        <div className="hidden">
          <Select value={selectedSuperHubId} onValueChange={setSelectedSuperHubId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {superHubs.map((h) => <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={selectedSubHubId} onValueChange={setSelectedSubHubId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {subHubs.map((h) => <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );

  // ─── FORM VIEW ──────────────────────────────────────────────────────────────
  if (view === "form") {
    return (
      <>
        {headerSlot && createPortal(headerContent, headerSlot)}
        <div className="space-y-5">
          <div className="flex items-center gap-3">
            <button onClick={() => setView("list")} className="text-sm text-gray-500 hover:text-gray-800">← Back to list</button>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</Label>
                <Input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} className="h-9" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Reason <span className="text-red-500">*</span></Label>
                <Input
                  value={formReason}
                  onChange={(e) => setFormReason(e.target.value)}
                  placeholder="Enter reason"
                  className="h-9"
                  list="inv-reason-list"
                />
                <datalist id="inv-reason-list">{REASONS.map((r) => <option key={r} value={r} />)}</datalist>
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Notes</Label>
                <Input value={formNotes} onChange={(e) => setFormNotes(e.target.value)} placeholder="Write notes here..." className="h-9" />
              </div>
            </div>

            <div className="w-full overflow-x-auto rounded-lg border border-gray-100">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-[26%]">Product <span className="text-red-500">*</span></th>
                    <th className="px-2 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-[8%]">Avail.</th>
                    <th className="px-2 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-[10%]">Mode</th>
                    <th className="px-2 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-[10%]">Quantity</th>
                    <th className="px-2 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-[12%]">Shelf Life (days)</th>
                    <th className="px-2 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-[14%]">Expiry Date</th>
                    <th className="px-2 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-[12%]">Batch # (opt)</th>
                    <th className="px-2 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {formRows.map((row, idx) => {
                    const isAdd = row.mode === "add";
                    const dLeft = isAdd ? daysUntil(row.expiryDate) : null;
                    const expTone = dLeft == null ? "text-gray-400"
                      : dLeft < 0 ? "text-red-600"
                      : dLeft <= 7 ? "text-amber-600"
                      : "text-emerald-600";
                    return (
                      <Fragment key={idx}>
                        <tr className="hover:bg-gray-50/40 align-top">
                          <td className="px-3 py-2.5">
                            <ProductSelector
                              row={row} idx={idx} allProducts={products} usedIds={usedIds}
                              onSelect={selectProduct} onClear={clearProduct} onSearchChange={onSearchChange}
                            />
                            {row.unit && <p className="text-[10px] text-gray-400 mt-1">{row.unit}</p>}
                          </td>
                          <td className="px-2 py-2.5 text-sm text-gray-700">
                            {row.productId ? row.quantityBefore : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-2 py-2.5">
                            <Select value={row.mode} onValueChange={(v) => updateRow(idx, { mode: v as FormMode })}>
                              <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="add">Add Batch</SelectItem>
                                <SelectItem value="remove">Reduce</SelectItem>
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="px-2 py-2.5">
                            <input
                              type="number" min="0"
                              value={isAdd ? row.addQuantity : row.removeQuantity}
                              onChange={(e) => updateRow(idx, isAdd ? { addQuantity: e.target.value } : { removeQuantity: e.target.value })}
                              placeholder="0"
                              className="w-full h-9 px-2 text-sm text-center border border-gray-200 rounded-md outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
                            />
                          </td>
                          <td className="px-2 py-2.5">
                            <input
                              type="number" min="0"
                              value={isAdd ? row.shelfLifeDays : ""}
                              disabled={!isAdd}
                              onChange={(e) => setShelfLife(idx, e.target.value)}
                              placeholder={isAdd ? "e.g. 7" : "—"}
                              className="w-full h-9 px-2 text-sm text-center border border-gray-200 rounded-md outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 disabled:bg-gray-50 disabled:text-gray-300"
                            />
                          </td>
                          <td className="px-2 py-2.5">
                            <input
                              type="date"
                              value={isAdd ? row.expiryDate : ""}
                              disabled={!isAdd}
                              onChange={(e) => setExpiryDate(idx, e.target.value)}
                              className={`w-full h-9 px-2 text-xs border border-gray-200 rounded-md outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 disabled:bg-gray-50 disabled:text-gray-300 ${expTone}`}
                            />
                            {isAdd && dLeft != null && (
                              <p className={`text-[10px] mt-0.5 font-semibold ${expTone}`}>
                                {dLeft < 0 ? `Expired ${Math.abs(dLeft)}d ago` : dLeft === 0 ? "Expires today" : `${dLeft}d left`}
                              </p>
                            )}
                          </td>
                          <td className="px-2 py-2.5">
                            <input
                              type="text"
                              value={isAdd ? row.batchNumber : ""}
                              disabled={!isAdd}
                              onChange={(e) => updateRow(idx, { batchNumber: e.target.value })}
                              placeholder={isAdd ? "auto" : "—"}
                              className="w-full h-9 px-2 text-xs border border-gray-200 rounded-md outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 disabled:bg-gray-50 disabled:text-gray-300"
                            />
                          </td>
                          <td className="px-2 py-2.5 text-center">
                            {formRows.length > 1 && (
                              <button onClick={() => removeRow(idx)} className="text-gray-400 hover:text-red-500">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                        {row.productId && (() => {
                          const prod = products.find((p) => p.id === row.productId);
                          const batches = prod?.batches ?? [];
                          if (batches.length === 0) return null;
                          return (
                            <tr key={`${idx}-batches`} className="bg-gray-50/40">
                              <td colSpan={8} className="px-4 py-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Existing batches:</span>
                                  {batches.map((b) => {
                                    const dl = daysUntil(b.expiryDate);
                                    const tone = dl == null ? "bg-gray-100 text-gray-600 border-gray-200"
                                      : dl < 0 ? "bg-red-50 text-red-700 border-red-200"
                                      : dl <= 7 ? "bg-amber-50 text-amber-700 border-amber-200"
                                      : "bg-emerald-50 text-emerald-700 border-emerald-200";
                                    return (
                                      <span key={b.id} className={`text-[11px] px-2 py-0.5 rounded-full border ${tone}`}>
                                        {b.batchNumber || "Batch"} · {b.quantity}{prod?.unit ? "" : ""} · exp {formatExpiry(b.expiryDate)}
                                      </span>
                                    );
                                  })}
                                </div>
                              </td>
                            </tr>
                          );
                        })()}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between">
              <button onClick={addRow} className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#1A56DB] hover:underline">
                <Plus className="w-4 h-4" /> Add another product
              </button>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => setView("list")}>Cancel</Button>
                <Button onClick={handleSave} disabled={saving} className="bg-[#1A56DB] hover:bg-[#1647b8]">
                  {saving ? "Saving..." : "Save Adjustment"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  // ─── LIST VIEW ──────────────────────────────────────────────────────────────
  return (
    <>
      {headerSlot && createPortal(headerContent, headerSlot)}
      <div className="space-y-5">
        <div className="flex items-center justify-end">
          <Button onClick={openForm} disabled={!selectedSubHubId} className="bg-[#1A56DB] hover:bg-[#1647b8]">
            <Plus className="w-4 h-4 mr-1.5" /> New Adjustment
          </Button>
        </div>

        {!selectedSubHubId ? (
          <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-12 text-center">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-blue-50 flex items-center justify-center">
              <SlidersHorizontal className="w-5 h-5 text-[#1A56DB]" />
            </div>
            <p className="text-sm font-semibold text-[#162B4D]">Loading hub data...</p>
            <p className="text-xs text-gray-400 mt-1">Connecting to Mumbai · Thane inventory.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="w-full overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Reason</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Items</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loading ? (
                    <tr><td colSpan={4} className="px-4 py-10 text-center text-sm text-gray-400">Loading...</td></tr>
                  ) : adjustments.length === 0 ? (
                    <tr><td colSpan={4} className="px-4 py-10 text-center text-sm text-gray-400">No adjustments yet</td></tr>
                  ) : pagedAdjustments.pageItems.map((a) => (
                    <tr key={a._id} className="hover:bg-gray-50/40 align-top">
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{formatDateTime(a.createdAt || a.date)}</td>
                      <td className="px-4 py-3 font-medium text-[#162B4D]">{a.reason}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          {a.items.map((it, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs flex-wrap">
                              <span className="text-gray-700 font-medium">{it.productName}</span>
                              <span className="text-gray-400">{it.quantityBefore} → {it.newQuantity} {it.unit}</span>
                              <span className={`font-semibold ${it.quantityAdjusted > 0 ? "text-emerald-600" : it.quantityAdjusted < 0 ? "text-red-600" : "text-gray-400"}`}>
                                ({it.quantityAdjusted > 0 ? "+" : ""}{it.quantityAdjusted})
                              </span>
                              {it.batch?.expiryDate && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                                  {it.batch.batchNumber || "Batch"} · exp {formatExpiry(it.batch.expiryDate as any)}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{a.notes || <span className="text-gray-300">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <PaginationBar
                page={pagedAdjustments.page}
                pages={pagedAdjustments.pages}
                total={pagedAdjustments.total}
                onChange={pagedAdjustments.setPage}
                label="adjustments"
              />
            </div>
          </div>
        )}
      </div>
    </>
  );
}

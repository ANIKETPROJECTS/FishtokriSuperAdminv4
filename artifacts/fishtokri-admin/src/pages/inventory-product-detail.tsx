import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useParams, useLocation } from "wouter";
import {
  ArrowLeft, Package, Building2, Lock, ChevronRight,
  ArrowDownCircle, ArrowUpCircle, SlidersHorizontal,
  Calendar, Clock, Hash, Layers, CheckCircle2, AlertTriangle, XCircle,
  ShoppingCart, RotateCcw, Wrench, ChevronDown,
} from "lucide-react";

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

type Batch = {
  id: string;
  batchNumber: string;
  quantity: number;
  shelfLifeDays: number | null;
  receivedDate: string | null;
  expiryDate: string | null;
  notes: string;
  createdAt?: string | null;
};

type Product = {
  id: string;
  name: string;
  category: string;
  subCategory: string;
  unit: string;
  price: number;
  quantity: number;
  status: string;
  imageUrl: string;
  batches?: Batch[];
};

type Movement = {
  _id: string;
  type: "order_deduct" | "order_restore" | "adjustment";
  productId: string;
  productName: string;
  unit?: string;
  change: number;
  balance: number;
  orderId?: string;
  orderRef?: string;
  reason?: string;
  notes?: string;
  createdAt: string;
  batchId?: string;
};

type BatchTab = "live" | "expired" | "completed";

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function daysUntil(iso: string | null | undefined) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

function getBatchStatus(b: Batch): "live" | "expired" | "completed" {
  if (b.quantity <= 0) return "completed";
  if (!b.expiryDate) return "live";
  const dl = daysUntil(b.expiryDate);
  if (dl !== null && dl < 0) return "expired";
  return "live";
}

function LockedHubBadge({ label, name }: { label: string; name: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 hidden sm:inline">{label}</span>
      <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 min-w-0">
        <Building2 className="w-3.5 h-3.5 text-[#364F9F] flex-shrink-0" />
        <span className="text-sm font-semibold text-[#162B4D] truncate">{name}</span>
        <Lock className="w-3 h-3 text-gray-300 flex-shrink-0 ml-0.5" />
      </div>
    </div>
  );
}

function MovementRow({ m }: { m: Movement }) {
  const isPositive = m.change >= 0;
  const meta =
    m.type === "order_deduct"
      ? { label: "Order Deduction", icon: <ShoppingCart className="w-3.5 h-3.5" />, tone: "bg-red-50 text-red-700 border-red-200", src: "Website / System Order" }
      : m.type === "order_restore"
      ? { label: "Order Restore", icon: <RotateCcw className="w-3.5 h-3.5" />, tone: "bg-emerald-50 text-emerald-700 border-emerald-200", src: "Order Cancellation" }
      : { label: "Manual Adjustment", icon: <Wrench className="w-3.5 h-3.5" />, tone: "bg-blue-50 text-blue-700 border-blue-200", src: "Admin Adjustment" };

  return (
    <tr className="hover:bg-gray-50/50 transition-colors">
      <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{fmtDateTime(m.createdAt)}</td>
      <td className="px-4 py-3">
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border ${meta.tone}`}>
          {meta.icon}
          {meta.label}
        </span>
      </td>
      <td className="px-4 py-3 text-xs text-gray-500">{meta.src}</td>
      <td className={`px-4 py-3 text-right font-bold text-sm ${isPositive ? "text-emerald-600" : "text-red-600"}`}>
        {isPositive ? "+" : ""}{m.change}
      </td>
      <td className="px-4 py-3 text-right text-gray-700 text-sm font-medium">{m.balance}</td>
      <td className="px-4 py-3 text-xs text-gray-500 max-w-[200px]">
        {m.orderRef ? (
          <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-[11px]">{m.orderRef}</span>
        ) : m.reason ? (
          <span>
            <span className="font-medium text-[#162B4D]">{m.reason}</span>
            {m.notes && <span className="text-gray-400"> · {m.notes}</span>}
          </span>
        ) : <span className="text-gray-300">—</span>}
      </td>
    </tr>
  );
}

export default function InventoryProductDetail() {
  const params = useParams<{ productId: string }>();
  const [, navigate] = useLocation();
  const productId = params.productId;

  // Parse query params
  const qs = new URLSearchParams(window.location.search);
  const subHubId = qs.get("subHubId") ?? "";
  const superHubId = qs.get("superHubId") ?? "";
  const subHubName = qs.get("subHubName") ?? "Sub Hub";
  const superHubName = qs.get("superHubName") ?? "Super Hub";

  const [product, setProduct] = useState<Product | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loadingProduct, setLoadingProduct] = useState(true);
  const [loadingMovements, setLoadingMovements] = useState(true);
  const [activeTab, setActiveTab] = useState<BatchTab>("live");
  const [expandedBatchId, setExpandedBatchId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!subHubId || !productId) return;
    setLoadingProduct(true);
    apiFetch(`/api/inventory/products?subHubId=${subHubId}`)
      .then((d) => {
        const found = (d.products ?? []).find((p: Product) => p.id === productId);
        if (found) setProduct(found);
        else setError("Product not found.");
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoadingProduct(false));
  }, [subHubId, productId]);

  useEffect(() => {
    if (!subHubId || !productId) return;
    setLoadingMovements(true);
    apiFetch(`/api/inventory/movements?subHubId=${subHubId}&productId=${productId}&limit=200`)
      .then((d) => setMovements(d.movements ?? []))
      .catch(() => {})
      .finally(() => setLoadingMovements(false));
  }, [subHubId, productId]);

  const allBatches: Batch[] = product?.batches ?? [];

  const liveBatches = useMemo(() => allBatches.filter((b) => getBatchStatus(b) === "live"), [allBatches]);
  const expiredBatches = useMemo(() => allBatches.filter((b) => getBatchStatus(b) === "expired"), [allBatches]);
  const completedBatches = useMemo(() => allBatches.filter((b) => getBatchStatus(b) === "completed"), [allBatches]);

  const tabBatches = activeTab === "live" ? liveBatches : activeTab === "expired" ? expiredBatches : completedBatches;

  const totalLiveQty = liveBatches.reduce((s, b) => s + b.quantity, 0);

  // Header portal
  const headerSlot = document.getElementById("page-header-slot");
  const headerContent = (
    <div className="flex items-center justify-between w-full gap-4 min-w-0">
      <div className="flex items-center gap-2 min-w-0">
        <button
          onClick={() => navigate("/inventory/products")}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-[#1A56DB] transition-colors flex-shrink-0"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Inventory</span>
        </button>
        <ChevronRight className="w-3 h-3 text-gray-300 flex-shrink-0" />
        <p className="text-sm font-bold text-[#162B4D] truncate">
          {product?.name ?? qs.get("productName") ?? "Product Detail"}
        </p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <LockedHubBadge label="Super Hub" name={superHubName} />
        <ChevronRight className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
        <LockedHubBadge label="Sub Hub" name={subHubName} />
      </div>
    </div>
  );

  if (loadingProduct) {
    return (
      <>
        {headerSlot && createPortal(headerContent, headerSlot)}
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <div className="w-10 h-10 border-2 border-[#1A56DB] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-gray-400">Loading product details...</p>
          </div>
        </div>
      </>
    );
  }

  if (error || !product) {
    return (
      <>
        {headerSlot && createPortal(headerContent, headerSlot)}
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <XCircle className="w-10 h-10 text-red-300" />
          <p className="text-sm font-semibold text-gray-600">{error || "Product not found"}</p>
          <button onClick={() => navigate("/inventory/products")} className="text-sm text-[#1A56DB] hover:underline">
            ← Back to Inventory
          </button>
        </div>
      </>
    );
  }

  const stockTone =
    product.quantity <= 0 ? "bg-red-50 text-red-700 border-red-200"
    : product.quantity < 5 ? "bg-amber-50 text-amber-700 border-amber-200"
    : "bg-emerald-50 text-emerald-700 border-emerald-200";

  return (
    <>
      {headerSlot && createPortal(headerContent, headerSlot)}

      <div className="space-y-5">
        {/* Product Header Card */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-start gap-5">
            {product.imageUrl ? (
              <img src={product.imageUrl} alt={product.name} className="w-20 h-20 rounded-xl object-cover border border-gray-100 flex-shrink-0" />
            ) : (
              <div className="w-20 h-20 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                <Package className="w-8 h-8 text-gray-300" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <h1 className="text-xl font-bold text-[#162B4D]">{product.name}</h1>
                  <p className="text-sm text-gray-400 mt-0.5">
                    {product.category}{product.subCategory && ` / ${product.subCategory}`}
                    {product.unit && <span className="ml-2 text-gray-300">· {product.unit}</span>}
                  </p>
                </div>
                <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold border ${stockTone}`}>
                  {product.status === "available" ? "Available" : product.status || "—"}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Price</p>
                  <p className="text-lg font-bold text-[#162B4D] mt-0.5">₹{product.price}</p>
                </div>
                <div className={`rounded-xl p-3 border ${stockTone.replace("text-", "").replace("border-", "border-")}`}
                  style={{ backgroundColor: product.quantity <= 0 ? "#fef2f2" : product.quantity < 5 ? "#fffbeb" : "#f0fdf4" }}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Live Stock</p>
                  <p className="text-lg font-bold text-[#162B4D] mt-0.5">{totalLiveQty} <span className="text-xs font-normal text-gray-400">{product.unit}</span></p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Stock Value</p>
                  <p className="text-lg font-bold text-[#162B4D] mt-0.5">₹{(product.price * totalLiveQty).toFixed(0)}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Total Batches</p>
                  <p className="text-lg font-bold text-[#162B4D] mt-0.5">{allBatches.length}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Batches Section */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {/* Tab header */}
          <div className="border-b border-gray-100 px-6 pt-4">
            <div className="flex items-center gap-1">
              <TabButton
                active={activeTab === "live"}
                onClick={() => setActiveTab("live")}
                count={liveBatches.length}
                icon={<CheckCircle2 className="w-3.5 h-3.5" />}
                label="Live Batches"
                activeColor="text-emerald-700 border-emerald-500"
                countColor="bg-emerald-100 text-emerald-700"
              />
              <TabButton
                active={activeTab === "expired"}
                onClick={() => setActiveTab("expired")}
                count={expiredBatches.length}
                icon={<AlertTriangle className="w-3.5 h-3.5" />}
                label="Expired Batches"
                activeColor="text-red-700 border-red-500"
                countColor="bg-red-100 text-red-700"
              />
              <TabButton
                active={activeTab === "completed"}
                onClick={() => setActiveTab("completed")}
                count={completedBatches.length}
                icon={<XCircle className="w-3.5 h-3.5" />}
                label="Completed Batches"
                activeColor="text-gray-700 border-gray-500"
                countColor="bg-gray-100 text-gray-600"
              />
            </div>
          </div>

          {/* Tab description */}
          <div className="px-6 py-3 bg-gray-50/50 border-b border-gray-100">
            <p className="text-xs text-gray-400">
              {activeTab === "live" && "Batches with remaining stock and not yet expired. These are available for orders."}
              {activeTab === "expired" && "Batches that have passed their expiry date. These are not available for new orders."}
              {activeTab === "completed" && "Batches where all stock has been fully consumed (quantity = 0)."}
            </p>
          </div>

          {/* Batch table */}
          <div className="w-full overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-10"></th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Batch #</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Quantity</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Received</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Expiry Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Shelf Life</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {tabBatches.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-sm text-gray-400">
                      No {activeTab} batches found
                    </td>
                  </tr>
                ) : tabBatches.map((b) => {
                  const status = getBatchStatus(b);
                  const dl = daysUntil(b.expiryDate);
                  const isExpanded = expandedBatchId === b.id;

                  const statusEl =
                    status === "live"
                      ? dl !== null && dl <= 7
                        ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                            <AlertTriangle className="w-3 h-3" />
                            Expiring {dl === 0 ? "today" : `in ${dl}d`}
                          </span>
                        : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3" />
                            Live
                          </span>
                      : status === "expired"
                      ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-50 text-red-700 border border-red-200">
                          <AlertTriangle className="w-3 h-3" />
                          Expired {dl !== null ? `${Math.abs(dl)}d ago` : ""}
                        </span>
                      : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-100 text-gray-600 border border-gray-200">
                          <XCircle className="w-3 h-3" />
                          Consumed
                        </span>;

                  // Get movements for this product (batch-level tracking not stored, show all product movements)
                  const batchMovements = movements; // all product movements

                  return [
                    <tr
                      key={b.id}
                      className={`hover:bg-blue-50/20 cursor-pointer transition-colors ${isExpanded ? "bg-blue-50/10" : ""}`}
                      onClick={() => setExpandedBatchId(isExpanded ? null : b.id)}
                    >
                      <td className="px-4 py-3 text-center">
                        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-[#364F9F]/10 flex items-center justify-center flex-shrink-0">
                            <Layers className="w-3.5 h-3.5 text-[#364F9F]" />
                          </div>
                          <div>
                            <p className="font-semibold text-[#162B4D] text-sm">{b.batchNumber || "Auto-assigned"}</p>
                            {b.createdAt && <p className="text-[10px] text-gray-400">Added {fmtDate(b.createdAt)}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`font-bold text-sm ${b.quantity > 0 ? "text-[#162B4D]" : "text-gray-400"}`}>
                          {b.quantity}
                        </span>
                        <span className="text-xs text-gray-400 ml-1">{product.unit}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-gray-300" />
                          {fmtDate(b.receivedDate)}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-gray-300" />
                          <span className={
                            dl === null ? "text-gray-400"
                            : dl < 0 ? "text-red-600 font-semibold"
                            : dl <= 7 ? "text-amber-600 font-semibold"
                            : "text-gray-600"
                          }>
                            {fmtDate(b.expiryDate)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {b.shelfLifeDays != null ? (
                          <div className="flex items-center gap-1">
                            <Hash className="w-3 h-3 text-gray-300" />
                            {b.shelfLifeDays}d
                          </div>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3">{statusEl}</td>
                      <td className="px-4 py-3 text-xs text-gray-400 max-w-[150px] truncate">
                        {b.notes || <span className="text-gray-200">—</span>}
                      </td>
                    </tr>,

                    isExpanded && (
                      <tr key={`${b.id}-detail`} className="bg-blue-50/10">
                        <td colSpan={8} className="px-0 py-0">
                          <div className="border-t border-blue-100 bg-blue-50/20">
                            {/* Batch detail header */}
                            <div className="px-6 py-3 border-b border-blue-100 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <ArrowDownCircle className="w-4 h-4 text-[#1A56DB]" />
                                <p className="text-xs font-bold text-[#162B4D] uppercase tracking-wider">
                                  Usage Detail — {b.batchNumber || "This Batch"}
                                </p>
                                <span className="text-[10px] text-gray-400">(all stock movements for this product)</span>
                              </div>
                              <div className="flex items-center gap-3 text-xs text-gray-500">
                                <span className="flex items-center gap-1">
                                  <ShoppingCart className="w-3 h-3 text-red-400" />
                                  {batchMovements.filter((m) => m.type === "order_deduct").length} order deductions
                                </span>
                                <span className="flex items-center gap-1">
                                  <RotateCcw className="w-3 h-3 text-emerald-400" />
                                  {batchMovements.filter((m) => m.type === "order_restore").length} restores
                                </span>
                                <span className="flex items-center gap-1">
                                  <Wrench className="w-3 h-3 text-blue-400" />
                                  {batchMovements.filter((m) => m.type === "adjustment").length} adjustments
                                </span>
                              </div>
                            </div>

                            {loadingMovements ? (
                              <div className="px-6 py-6 text-center text-xs text-gray-400">Loading usage history...</div>
                            ) : batchMovements.length === 0 ? (
                              <div className="px-6 py-6 text-center text-xs text-gray-400">No movements recorded for this product yet.</div>
                            ) : (
                              <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="border-b border-blue-100 bg-blue-50/40">
                                      <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-gray-400">Date & Time</th>
                                      <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-gray-400">Event Type</th>
                                      <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-gray-400">Source</th>
                                      <th className="px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-widest text-gray-400">Change</th>
                                      <th className="px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-widest text-gray-400">Balance After</th>
                                      <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-gray-400">Reference / Reason</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-blue-50">
                                    {batchMovements.slice(0, 50).map((m) => (
                                      <MovementRow key={m._id} m={m} />
                                    ))}
                                  </tbody>
                                </table>
                                {batchMovements.length > 50 && (
                                  <div className="px-4 py-2 text-center text-xs text-gray-400 border-t border-blue-100">
                                    Showing latest 50 of {batchMovements.length} movements. Go to Inventory History for full log.
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  ];
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Summary stats for this product */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard
            label="Total Movements"
            value={movements.length}
            icon={<SlidersHorizontal className="w-4 h-4 text-blue-400" />}
          />
          <SummaryCard
            label="Order Deductions"
            value={movements.filter((m) => m.type === "order_deduct").length}
            icon={<ArrowDownCircle className="w-4 h-4 text-red-400" />}
          />
          <SummaryCard
            label="Order Restores"
            value={movements.filter((m) => m.type === "order_restore").length}
            icon={<ArrowUpCircle className="w-4 h-4 text-emerald-400" />}
          />
          <SummaryCard
            label="Manual Adjustments"
            value={movements.filter((m) => m.type === "adjustment").length}
            icon={<Wrench className="w-4 h-4 text-blue-400" />}
          />
        </div>
      </div>
    </>
  );
}

function TabButton({
  active, onClick, count, icon, label, activeColor, countColor,
}: {
  active: boolean;
  onClick: () => void;
  count: number;
  icon: React.ReactNode;
  label: string;
  activeColor: string;
  countColor: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-all -mb-px
        ${active
          ? `${activeColor} bg-transparent`
          : "text-gray-400 border-transparent hover:text-gray-600 hover:border-gray-200"
        }`}
    >
      {icon}
      {label}
      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${active ? countColor : "bg-gray-100 text-gray-500"}`}>
        {count}
      </span>
    </button>
  );
}

function SummaryCard({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{label}</p>
        {icon}
      </div>
      <p className="text-xl font-bold text-[#162B4D] mt-1">{value}</p>
    </div>
  );
}

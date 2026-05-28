import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Search, Plus, LayoutGrid, List, SlidersHorizontal, ArrowUpDown,
  Building2, Phone, Mail, MapPin, Trash2, Edit2, Eye, Package,
  ShoppingCart, X, ChevronLeft, ChevronRight, RefreshCw, Tag,
  IndianRupee, TrendingUp, Calendar, FileText, ChevronDown, Check,
  Boxes, Hash, History, Filter, LayoutList, AlertTriangle,
  User, Clock, Layers, Printer, BookOpen, MoreVertical,
} from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { getCurrentAdminScope } from "@/lib/api";
import { printHtmlWithQZ } from "@/lib/qz-print";
import { ImageUpload } from "@/components/image-upload";

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function getToken() { return localStorage.getItem("fishtokri_token") || ""; }
function getBase() { return import.meta.env.BASE_URL?.replace(/\/$/, "") || ""; }
function getCurrentAdmin(): { name: string; email: string } {
  try { const a = JSON.parse(localStorage.getItem("fishtokri_admin") || "{}"); return { name: a.name || a.email || "", email: a.email || "" }; } catch { return { name: "", email: "" }; }
}

async function apiFetch(path: string, opts: RequestInit = {}) {
  const res = await fetch(`${getBase()}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
      ...(opts.headers ?? {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message ?? "Request failed");
  }
  return res.json();
}

function formatRupees(n: number) {
  return `₹${Number(n || 0).toLocaleString("en-IN")}`;
}

function formatDate(d: any) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
function formatDateTime(d: any) {
  if (!d) return "—";
  const dt = new Date(d);
  const date = dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const time = dt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
  return `${date}, ${time}`;
}

const CATEGORIES = ["General", "Fish", "Seafood", "Dry Fish", "Prawns", "Crabs", "Lobster", "Squid"];
const CATEGORY_OTHER = "Other";
const UNITS = ["kg", "g", "pieces", "dozen", "box", "bag", "liter"];

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface Vendor {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  category: string;
  status: "active" | "inactive";
  notes: string;
  totalPurchases: number;
  totalSpent: number;
  createdAt: string;
  profileImageUrl?: string;
}

interface BatchEntry {
  quantity: string;
  shelfLifeDays: string;
}

interface PurchaseItem {
  id?: string;
  productMode: "existing" | "new";
  existingProductId: string;
  existingCategory: string;
  productName: string;
  quantity: number | string;
  unit: string;
  displayUnit: string;
  pricePerUnit: number | string;
  totalPrice: number;
  expiryDate: string;
  description: string;
  category: string;
  subCategory: string;
  sellingPrice: string;
  originalPrice: string;
  discountPct: string;
  grossWeight: string;
  netWeight: string;
  pieces: string;
  serves: string;
  imageUrl: string;
  imageMode: "url" | "upload";
  productStatus: string;
  limitedStockNote: string;
  shelfLifeDays: string;
  stockQty: string;
  recipesText: string;
  sectionIdsText: string;
  couponIdsText: string;
  batches: BatchEntry[];
  // new-product rich fields (mirrors sub-hub modal)
  newProductRecipes: any[];
  newProductIsArchived: boolean;
  taxPct?: string;
}

interface PurchaseDisplayBatch {
  quantity: number;
  shelfLifeDays: number;
}

interface Purchase {
  id: string;
  vendorId: string;
  vendorName: string;
  invoiceNumber: string;
  purchaseDate: string;
  items: (PurchaseItem & { categoryName?: string; batches?: PurchaseDisplayBatch[] })[];
  totalAmount: number;
  notes: string;
  subHubId?: string;
  subHubName?: string;
  superHubId?: string;
  superHubName?: string;
  createdByName?: string;
  createdByEmail?: string;
  createdAt: string;
}

interface VendorItemCategory {
  id: string;
  name: string;
  status?: string;
}

interface VendorCatalogItem {
  id: string;
  name: string;
  itemCode?: string;
  itemType?: string;
  categoryId: string;
  categoryName: string;
  unit: string;
  purchasePrice?: number;
  sellingPrice?: number;
  currentStock?: number;
  description?: string;
  status?: string;
}

// ─── EMPTY FORMS ──────────────────────────────────────────────────────────────

const emptyVendor = (): { name: string; phone: string; email: string; address: string; category: string; status: "active" | "inactive"; notes: string } => ({
  name: "", phone: "", email: "", address: "", category: "", status: "active", notes: "",
});

// Split a comma-separated category string into an array of trimmed parts
function parseCats(cat: string): string[] {
  return cat ? cat.split(",").map(s => s.trim()).filter(Boolean) : [];
}

const emptyBatch = (): BatchEntry => ({ quantity: "", shelfLifeDays: "" });

const emptyItem = (): PurchaseItem => ({
  productMode: "existing", existingProductId: "", existingCategory: "",
  productName: "", quantity: "", unit: "kg", displayUnit: "per kg", pricePerUnit: "", totalPrice: 0, expiryDate: "",
  description: "", category: "", subCategory: "",
  sellingPrice: "", originalPrice: "", discountPct: "",
  grossWeight: "", netWeight: "",
  pieces: "", serves: "", imageUrl: "", imageMode: "url", productStatus: "available",
  limitedStockNote: "", shelfLifeDays: "", stockQty: "0", recipesText: "", sectionIdsText: "", couponIdsText: "",
  batches: [emptyBatch()],
  newProductRecipes: [],
  newProductIsArchived: false,
});

const PRODUCT_UNITS = ["per kg", "per piece", "per dozen", "per box", "per litre", "per pack", "per g", "per 500g"];

const emptyPurchase = () => ({
  invoiceNumber: "",
  purchaseDate: new Date().toISOString().split("T")[0],
  dueDate: "",
  items: [emptyItem()],
  notes: "",
  billingAddress: "",
  shippingAddress: "",
  placeOfSupply: "",
  referenceNumber: "",
  deliveryDate: "",
  additionalNote: "",
  discount: "",
  extraCharge: "",
  roundOff: "",
});

function getDocId(doc: any) {
  if (!doc) return "";
  if (typeof doc._id === "string") return doc._id;
  if (doc._id?.$oid) return doc._id.$oid;
  if (doc._id) return String(doc._id);
  return doc.id ? String(doc.id) : "";
}

function stringifyIdList(value: any) {
  if (!Array.isArray(value)) return "";
  return value.map((entry) => typeof entry === "string" ? entry : entry?.$oid ? entry.$oid : String(entry)).filter(Boolean).join(", ");
}

function parseIdList(value: string) {
  return value.split(",").map((part) => part.trim()).filter(Boolean);
}

function safeJsonArray(value: string, fallback: any[] = []) {
  if (!value.trim()) return fallback;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function productToItem(product: any, current: PurchaseItem): PurchaseItem {
  return {
    ...current,
    productMode: "existing",
    existingProductId: getDocId(product),
    productName: product.name ?? "",
    description: product.description ?? "",
    category: product.category ?? "",
    subCategory: product.subCategory ?? "",
    sellingPrice: product.price !== undefined ? String(product.price) : "",
    originalPrice: product.originalPrice !== undefined ? String(product.originalPrice) : "",
    discountPct: product.discountPct !== undefined ? String(product.discountPct) : "",
    displayUnit: product.unit ?? "per kg",
    grossWeight: product.grossWeight ?? "",
    netWeight: product.netWeight ?? "",
    pieces: product.pieces ?? "",
    serves: product.serves ?? "",
    imageUrl: product.imageUrl ?? "",
    productStatus: product.status ?? "available",
    limitedStockNote: product.limitedStockNote ?? "",
    recipesText: JSON.stringify(Array.isArray(product.recipes) ? product.recipes : [], null, 2),
    sectionIdsText: stringifyIdList(product.sectionId),
    couponIdsText: stringifyIdList(product.couponIds),
  };
}

function productPayload(item: PurchaseItem) {
  const price = Number(item.sellingPrice) || 0;
  const originalPrice = Number(item.originalPrice) || price;
  const discountPct = item.discountPct !== "" ? Number(item.discountPct) || 0 : originalPrice > price && originalPrice > 0 ? Math.round(((originalPrice - price) / originalPrice) * 100) : 0;
  const cleanedRecipes = (item.newProductRecipes ?? []).map((r: any) => ({
    ...r,
    ingredients: (r.ingredients ?? []).filter((s: string) => s.trim()),
    method: (r.method ?? []).filter((s: string) => s.trim()),
  }));
  return {
    name: item.productName,
    description: item.description || "",
    category: item.category || "",
    subCategory: item.subCategory || "",
    price,
    originalPrice,
    discountPct,
    unit: item.displayUnit || "per kg",
    grossWeight: item.grossWeight || "",
    netWeight: item.netWeight || "",
    pieces: item.pieces || "",
    serves: item.serves || "",
    quantity: Number(item.stockQty) || Number(item.quantity) || 0,
    imageUrl: item.imageUrl || "",
    status: item.productStatus || "available",
    isArchived: item.newProductIsArchived ?? false,
    limitedStockNote: item.limitedStockNote || "",
    recipes: cleanedRecipes,
    sectionId: parseIdList(item.sectionIdsText),
    couponIds: parseIdList(item.couponIdsText),
  };
}

// ─── BADGE COMPONENTS ─────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
      status === "active"
        ? "bg-green-50 border-green-200 text-green-700"
        : "bg-gray-100 border-gray-200 text-gray-500"
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${status === "active" ? "bg-green-500" : "bg-gray-400"}`} />
      {status === "active" ? "Active" : "Inactive"}
    </span>
  );
}

function CategoryBadge({ category }: { category: string }) {
  const cats = parseCats(category);
  if (cats.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {cats.map(c => (
        <span key={c} className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-blue-700">
          <Tag className="w-2.5 h-2.5" />
          {c}
        </span>
      ))}
    </span>
  );
}

// ─── VENDOR CARD (GRID) ───────────────────────────────────────────────────────

function VendorCard({ vendor, onEdit, onDelete, onView, onAddPurchase, onViewHistory }: {
  vendor: Vendor;
  onEdit: (v: Vendor) => void;
  onDelete: (v: Vendor) => void;
  onView: (v: Vendor) => void;
  onAddPurchase: (v: Vendor) => void;
  onViewHistory: (v: Vendor) => void;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-full bg-[#162B4D]/10 flex items-center justify-center flex-shrink-0 overflow-hidden border border-gray-100">
            {vendor.profileImageUrl
              ? <img src={vendor.profileImageUrl} alt={vendor.name} className="w-full h-full object-cover" />
              : <Building2 className="w-5 h-5 text-[#162B4D]" />}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-[#162B4D] text-sm truncate">{vendor.name}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <CategoryBadge category={vendor.category} />
            </div>
          </div>
        </div>
        <StatusBadge status={vendor.status} />
      </div>

      <div className="space-y-1.5 text-xs text-gray-500">
        {vendor.phone && (
          <div className="flex items-center gap-2">
            <Phone className="w-3 h-3 flex-shrink-0" />
            <span>{vendor.phone}</span>
          </div>
        )}
        {vendor.email && (
          <div className="flex items-center gap-2">
            <Mail className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{vendor.email}</span>
          </div>
        )}
        {vendor.address && (
          <div className="flex items-center gap-2">
            <MapPin className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{vendor.address}</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 py-2 border-t border-b border-gray-50">
        <div className="text-center">
          <p className="text-[11px] text-gray-400">Purchases</p>
          <p className="font-bold text-[#162B4D] text-sm">{vendor.totalPurchases}</p>
        </div>
        <div className="text-center">
          <p className="text-[11px] text-gray-400">Total Spent</p>
          <p className="font-bold text-[#162B4D] text-sm">{formatRupees(vendor.totalSpent)}</p>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <Button size="sm" className="flex-1 min-w-0 h-8 text-xs px-3 bg-[#162B4D] hover:bg-[#1e3a6e] text-white" onClick={() => onAddPurchase(vendor)}>
          <ShoppingCart className="w-3.5 h-3.5 mr-1 flex-shrink-0" /> Buy
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              className="h-8 w-8 p-0 flex-shrink-0 text-gray-500 hover:text-gray-700"
              title="More actions"
            >
              <MoreVertical className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={() => onView(vendor)}>
              <Eye className="w-4 h-4 mr-2 text-[#1A56DB]" /> View
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onViewHistory(vendor)}>
              <History className="w-4 h-4 mr-2 text-purple-600" /> History
            </DropdownMenuItem>
            <Link href={`/vendor-statement/${vendor.id}`}>
              <DropdownMenuItem>
                <BookOpen className="w-4 h-4 mr-2 text-emerald-600" /> Statement
              </DropdownMenuItem>
            </Link>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onEdit(vendor)}>
              <Edit2 className="w-4 h-4 mr-2 text-gray-500" /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onDelete(vendor)}
              className="text-red-600 focus:text-red-700"
            >
              <Trash2 className="w-4 h-4 mr-2" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

// ─── VENDOR ROW (LIST) ────────────────────────────────────────────────────────

function VendorRow({ vendor, onEdit, onDelete, onView, onAddPurchase, onViewHistory }: {
  vendor: Vendor;
  onEdit: (v: Vendor) => void;
  onDelete: (v: Vendor) => void;
  onView: (v: Vendor) => void;
  onAddPurchase: (v: Vendor) => void;
  onViewHistory: (v: Vendor) => void;
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-100 px-4 py-3 flex items-center gap-4 hover:shadow-sm transition-shadow">
      <div className="w-9 h-9 rounded-full bg-[#162B4D]/10 flex items-center justify-center flex-shrink-0 overflow-hidden border border-gray-100">
        {vendor.profileImageUrl
          ? <img src={vendor.profileImageUrl} alt={vendor.name} className="w-full h-full object-cover" />
          : <Building2 className="w-4 h-4 text-[#162B4D]" />}
      </div>
      <div className="flex-1 min-w-0 grid grid-cols-[1fr_auto_auto_auto_auto_auto] items-center gap-4">
        <div className="min-w-0">
          <p className="font-semibold text-[#162B4D] text-sm truncate">{vendor.name}</p>
          <p className="text-[11px] text-gray-400 truncate">{vendor.phone || vendor.email || "No contact"}</p>
        </div>
        <CategoryBadge category={vendor.category} />
        <StatusBadge status={vendor.status} />
        <div className="text-right hidden sm:block">
          <p className="text-xs text-gray-400">Purchases</p>
          <p className="font-bold text-[#162B4D] text-sm">{vendor.totalPurchases}</p>
        </div>
        <div className="text-right hidden sm:block">
          <p className="text-xs text-gray-400">Total Spent</p>
          <p className="font-bold text-[#162B4D] text-sm">{formatRupees(vendor.totalSpent)}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button size="sm" className="h-8 text-xs px-3 bg-[#162B4D] hover:bg-[#1e3a6e] text-white" onClick={() => onAddPurchase(vendor)}>
            <ShoppingCart className="w-3.5 h-3.5 mr-1" /> Buy
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="h-8 w-8 p-0 text-gray-500 hover:text-gray-700"
                title="More actions"
              >
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={() => onView(vendor)}>
                <Eye className="w-4 h-4 mr-2 text-[#1A56DB]" /> View
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onViewHistory(vendor)}>
                <History className="w-4 h-4 mr-2 text-purple-600" /> History
              </DropdownMenuItem>
              <Link href={`/vendor-statement/${vendor.id}`}>
                <DropdownMenuItem>
                  <BookOpen className="w-4 h-4 mr-2 text-emerald-600" /> Statement
                </DropdownMenuItem>
              </Link>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onEdit(vendor)}>
                <Edit2 className="w-4 h-4 mr-2 text-gray-500" /> Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onDelete(vendor)}
                className="text-red-600 focus:text-red-700"
              >
                <Trash2 className="w-4 h-4 mr-2" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}

// ─── MULTI CATEGORY PICKER ────────────────────────────────────────────────────

function MultiCategoryPicker({ selected, otherText, onToggle, onOtherText }: {
  selected: string[];
  otherText: string;
  onToggle: (cat: string) => void;
  onOtherText: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const otherChecked = selected.includes(CATEGORY_OTHER);

  return (
    <div className="mt-1 space-y-2">
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between border border-input bg-background rounded-md px-3 py-2 text-sm shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
      >
        <span className={selected.length === 0 ? "text-muted-foreground" : "text-foreground"}>
          {selected.length === 0 ? "Select categories..." : `${selected.length} categor${selected.length === 1 ? "y" : "ies"} selected`}
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="border border-gray-200 rounded-lg bg-white shadow-md p-2 space-y-1">
          {CATEGORIES.map(cat => (
            <label key={cat} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-gray-50 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={selected.includes(cat)}
                onChange={() => onToggle(cat)}
                className="accent-[#162B4D] w-3.5 h-3.5 rounded"
              />
              <span className="text-sm">{cat}</span>
            </label>
          ))}
          {/* Other option */}
          <label className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-gray-50 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={otherChecked}
              onChange={() => onToggle(CATEGORY_OTHER)}
              className="accent-[#162B4D] w-3.5 h-3.5 rounded"
            />
            <span className="text-sm">Other</span>
          </label>
          {otherChecked && (
            <div className="px-2 pb-1">
              <input
                type="text"
                value={otherText}
                onChange={e => onOtherText(e.target.value)}
                placeholder="Type category name..."
                className="w-full border border-input rounded-md px-2.5 py-1.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-ring"
                autoFocus
              />
            </div>
          )}
        </div>
      )}

      {/* Selected tags */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((cat) => {
            const label = cat === CATEGORY_OTHER && otherText.trim() ? otherText.trim() : cat;
            return (
              <span key={cat} className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-blue-700">
                {label}
                <button type="button" onClick={() => onToggle(cat)} className="ml-0.5 hover:text-red-500 transition-colors">
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── VENDOR FORM MODAL ────────────────────────────────────────────────────────

function validatePhone(phone: string) {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length !== 10) return "Phone must be exactly 10 digits";
  if (!/^\d{10}$/.test(digits)) return "Phone must contain digits only";
  return "";
}

function validateEmail(email: string) {
  if (!email) return "";
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) return "Enter a valid email address (e.g. name@example.com)";
  return "";
}

function VendorFormModal({ open, onClose, onSave, initial }: {
  open: boolean;
  onClose: () => void;
  onSave: (data: any) => Promise<void>;
  initial?: Vendor | null;
}) {
  const [form, setForm] = useState(emptyVendor());
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  // Multi-category state
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  const [otherText, setOtherText] = useState("");
  // Profile image
  const [profileImageUrl, setProfileImageUrl] = useState("");

  useEffect(() => {
    if (open) {
      setTouched({});
      setProfileImageUrl(initial?.profileImageUrl || "");
      const base = initial ? {
        name: initial.name, phone: initial.phone, email: initial.email,
        address: initial.address, category: initial.category, status: initial.status, notes: initial.notes,
      } : emptyVendor();
      setForm(base);
      // Parse existing category into multi-select state
      if (initial?.category) {
        const parts = parseCats(initial.category);
        const knownCats = [...CATEGORIES, CATEGORY_OTHER];
        const known = parts.filter(p => knownCats.includes(p));
        const unknown = parts.filter(p => !knownCats.includes(p));
        if (unknown.length > 0) {
          setSelectedCats([...known, CATEGORY_OTHER]);
          setOtherText(unknown.join(", "));
        } else {
          setSelectedCats(known);
          setOtherText("");
        }
      } else {
        setSelectedCats([]);
        setOtherText("");
      }
    }
  }, [open, initial]);

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));
  const touch = (k: string) => setTouched(t => ({ ...t, [k]: true }));

  const toggleCat = (cat: string) => {
    setSelectedCats(prev =>
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    );
    if (cat === CATEGORY_OTHER) setOtherText("");
  };

  const phoneError = touched.phone ? validatePhone(form.phone) : "";
  const emailError = touched.email ? validateEmail(form.email) : "";
  const hasErrors = !!validatePhone(form.phone) || !!validateEmail(form.email);

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digitsOnly = e.target.value.replace(/\D/g, "").slice(0, 10);
    set("phone", digitsOnly);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ phone: true, email: true });
    if (!form.name.trim() || hasErrors) return;
    // Build final category string
    const finalCats = selectedCats.map(c => {
      if (c === CATEGORY_OTHER) return otherText.trim() || CATEGORY_OTHER;
      return c;
    });
    const payload = { ...form, category: finalCats.join(", "), profileImageUrl };
    setSaving(true);
    try { await onSave(payload); onClose(); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit Vendor" : "Add New Vendor"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <ImageUpload
            value={profileImageUrl}
            onChange={setProfileImageUrl}
            folder="fishtokri/vendors"
            label="Profile Image"
            previewClassName="w-12 h-12 rounded-full"
          />
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Vendor Name *</Label>
              <Input value={form.name} onChange={e => set("name", e.target.value)} placeholder="e.g. Mumbai Fish Market" required className="mt-1" />
            </div>
            <div>
              <Label>Phone</Label>
              <Input
                value={form.phone}
                onChange={handlePhoneChange}
                onBlur={() => touch("phone")}
                placeholder="10-digit number"
                inputMode="numeric"
                maxLength={10}
                className={`mt-1 ${phoneError ? "border-red-400 focus-visible:ring-red-300" : ""}`}
              />
              {phoneError && (
                <p className="text-[11px] text-red-500 mt-1 flex items-center gap-1">
                  <span className="inline-block w-3 h-3 rounded-full bg-red-500 text-white text-[9px] flex items-center justify-center font-bold leading-none">!</span>
                  {phoneError}
                </p>
              )}
              {!phoneError && touched.phone && form.phone.length === 10 && (
                <p className="text-[11px] text-green-600 mt-1">✓ Valid phone number</p>
              )}
            </div>
            <div>
              <Label>Email</Label>
              <Input
                value={form.email}
                onChange={e => set("email", e.target.value)}
                onBlur={() => touch("email")}
                placeholder="vendor@example.com"
                type="text"
                className={`mt-1 ${emailError ? "border-red-400 focus-visible:ring-red-300" : ""}`}
              />
              {emailError && (
                <p className="text-[11px] text-red-500 mt-1 flex items-center gap-1">
                  <span className="inline-block w-3 h-3 rounded-full bg-red-500 text-white text-[9px] flex items-center justify-center font-bold leading-none">!</span>
                  {emailError}
                </p>
              )}
              {!emailError && touched.email && form.email && (
                <p className="text-[11px] text-green-600 mt-1">✓ Valid email address</p>
              )}
            </div>
            <div className="col-span-2">
              <Label>Address</Label>
              <Input value={form.address} onChange={e => set("address", e.target.value)} placeholder="Shop no, Street, City" className="mt-1" />
            </div>
            <div className="col-span-2">
              <Label>Categories</Label>
              <MultiCategoryPicker
                selected={selectedCats}
                otherText={otherText}
                onToggle={toggleCat}
                onOtherText={setOtherText}
              />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => set("status", v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label>Notes</Label>
              <Input value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Any notes about this vendor..." className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving} className="bg-[#162B4D] hover:bg-[#1e3a6e] text-white">
              {saving ? "Saving..." : initial ? "Update Vendor" : "Add Vendor"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── RECIPE HELPERS (mirrors sub-hub modal) ───────────────────────────────────

const BLANK_RECIPE = () => ({
  title: "", description: "", image: "",
  totalTime: "", prepTime: "", cookTime: "",
  servings: 2, difficulty: "Medium",
  ingredients: [""], method: [""],
});

function VendorRecipeEditor({ recipe, onChange, onRemove }: { recipe: any; onChange: (r: any) => void; onRemove: () => void }) {
  const [open, setOpen] = useState(false);
  const [imageMode, setImageMode] = useState<"url" | "upload">("url");
  const [imageUploading, setImageUploading] = useState(false);
  const upd = (k: string, v: any) => onChange({ ...recipe, [k]: v });

  const handleImageFile = async (file: File) => {
    setImageUploading(true);
    try {
      const fd = new FormData();
      fd.append("image", file);
      const res = await fetch(`${getBase()}/api/upload?folder=fishtokri/recipes`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Upload failed");
      upd("image", data.url);
    } catch (err: any) {
      alert(err.message ?? "Upload failed");
    } finally {
      setImageUploading(false);
    }
  };
  const updList = (k: string, i: number, v: string) => onChange({ ...recipe, [k]: recipe[k].map((x: string, idx: number) => idx === i ? v : x) });
  const addListItem = (k: string) => onChange({ ...recipe, [k]: [...recipe[k], ""] });
  const removeListItem = (k: string, i: number) => onChange({ ...recipe, [k]: recipe[k].filter((_: any, idx: number) => idx !== i) });

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-4 py-3 bg-gray-50/50 hover:bg-gray-50 transition-colors text-left">
        <div className="flex items-center gap-2 min-w-0">
          <Layers className="w-4 h-4 text-gray-300 flex-shrink-0" />
          <p className="font-medium text-[#162B4D] text-sm truncate">{recipe.title || <span className="text-gray-400 italic font-normal">Untitled Recipe</span>}</p>
          {recipe.totalTime && <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full flex-shrink-0">{recipe.totalTime}</span>}
          {recipe.difficulty && <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full flex-shrink-0">{recipe.difficulty}</span>}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
          <button type="button" onClick={(e) => { e.stopPropagation(); onRemove(); }} className="w-6 h-6 flex items-center justify-center text-gray-300 hover:text-red-500 transition-colors">
            <Trash2 className="w-3 h-3" />
          </button>
          {open ? <ChevronDown className="w-4 h-4 text-gray-400 rotate-180" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </button>

      {open && (
        <div className="p-4 space-y-4 border-t border-gray-100">
          <div className="space-y-2">
            <div className="space-y-1"><Label className="text-xs font-semibold text-gray-500">Recipe Title *</Label><Input value={recipe.title} onChange={(e) => upd("title", e.target.value)} placeholder="e.g. Classic Fish Curry" className="h-8 text-sm" /></div>
            <div className="space-y-1"><Label className="text-xs font-semibold text-gray-500">Description</Label><textarea value={recipe.description} onChange={(e) => upd("description", e.target.value)} placeholder="Brief description..." className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 focus:border-[#1A56DB] focus:ring-1 focus:ring-[#1A56DB]/30 outline-none resize-none h-16" /></div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-gray-500">Recipe Image</Label>
              <div className="flex gap-1 p-0.5 bg-gray-100 rounded-lg w-fit mb-1.5">
                <button type="button" onClick={() => setImageMode("url")} className={`text-xs px-3 py-1 rounded-md font-medium transition-colors ${imageMode === "url" ? "bg-white text-[#162B4D] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>URL</button>
                <button type="button" onClick={() => setImageMode("upload")} className={`text-xs px-3 py-1 rounded-md font-medium transition-colors ${imageMode === "upload" ? "bg-white text-[#162B4D] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>Upload</button>
              </div>
              {imageMode === "url" ? (
                <Input value={recipe.image} onChange={(e) => upd("image", e.target.value)} placeholder="https://..." className="h-8 text-sm" />
              ) : (
                <div className="space-y-1.5">
                  <label className={`flex items-center justify-center gap-2 h-9 px-3 rounded-lg border-2 border-dashed cursor-pointer text-sm transition-colors ${imageUploading ? "border-gray-200 text-gray-400 bg-gray-50 cursor-not-allowed" : "border-gray-200 hover:border-[#1A56DB] text-gray-500 hover:text-[#1A56DB]"}`}>
                    {imageUploading ? <><svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg> Uploading...</> : <><svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1M12 12V4m0 0L8 8m4-4l4 4" /></svg> Choose image from device</>}
                    <input type="file" accept="image/*" className="hidden" disabled={imageUploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageFile(f); e.target.value = ""; }} />
                  </label>
                  {recipe.image && <p className="text-[10px] text-green-600 truncate">Uploaded: {recipe.image}</p>}
                </div>
              )}
            </div>
          </div>

          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Timing & Servings</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <div className="space-y-1"><Label className="text-[10px] font-semibold text-gray-500">Prep Time</Label><Input value={recipe.prepTime} onChange={(e) => upd("prepTime", e.target.value)} placeholder="15 min" className="h-8 text-sm" /></div>
              <div className="space-y-1"><Label className="text-[10px] font-semibold text-gray-500">Cook Time</Label><Input value={recipe.cookTime} onChange={(e) => upd("cookTime", e.target.value)} placeholder="35 min" className="h-8 text-sm" /></div>
              <div className="space-y-1"><Label className="text-[10px] font-semibold text-gray-500">Total Time</Label><Input value={recipe.totalTime} onChange={(e) => upd("totalTime", e.target.value)} placeholder="50 min" className="h-8 text-sm" /></div>
              <div className="space-y-1"><Label className="text-[10px] font-semibold text-gray-500">Servings</Label><Input type="number" min="1" value={recipe.servings} onChange={(e) => upd("servings", Number(e.target.value))} className="h-8 text-sm" /></div>
              <div className="space-y-1 sm:col-span-2"><Label className="text-[10px] font-semibold text-gray-500">Difficulty</Label>
                <Select value={recipe.difficulty} onValueChange={(v) => upd("difficulty", v)}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="Easy">Easy</SelectItem><SelectItem value="Medium">Medium</SelectItem><SelectItem value="Hard">Hard</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Ingredients</p>
              <button type="button" onClick={() => addListItem("ingredients")} className="text-xs text-[#1A56DB] font-medium flex items-center gap-1 hover:underline"><Plus className="w-3 h-3" /> Add</button>
            </div>
            <div className="space-y-1.5">
              {(recipe.ingredients ?? []).map((ing: string, i: number) => (
                <div key={i} className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold text-gray-300 w-5 flex-shrink-0 text-right">{i + 1}.</span>
                  <Input value={ing} onChange={(e) => updList("ingredients", i, e.target.value)} placeholder="e.g. 500g fish" className="h-7 text-sm flex-1" />
                  {(recipe.ingredients?.length ?? 0) > 1 && <button type="button" onClick={() => removeListItem("ingredients", i)} className="text-gray-300 hover:text-red-500 flex-shrink-0"><X className="w-3 h-3" /></button>}
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Method Steps</p>
              <button type="button" onClick={() => addListItem("method")} className="text-xs text-[#1A56DB] font-medium flex items-center gap-1 hover:underline"><Plus className="w-3 h-3" /> Add step</button>
            </div>
            <div className="space-y-2">
              {(recipe.method ?? []).map((step: string, i: number) => (
                <div key={i} className="flex items-start gap-1.5">
                  <span className="text-[10px] font-bold text-gray-300 w-5 flex-shrink-0 text-right mt-1.5">{i + 1}.</span>
                  <textarea value={step} onChange={(e) => updList("method", i, e.target.value)} placeholder={`Step ${i + 1}...`} className="flex-1 text-sm px-3 py-1.5 rounded-lg border border-gray-200 focus:border-[#1A56DB] focus:ring-1 focus:ring-[#1A56DB]/30 outline-none resize-none h-14" />
                  {(recipe.method?.length ?? 0) > 1 && <button type="button" onClick={() => removeListItem("method", i)} className="text-gray-300 hover:text-red-500 flex-shrink-0 mt-1.5"><X className="w-3 h-3" /></button>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ADD PURCHASE MODAL ───────────────────────────────────────────────────────

function numOnly(v: string) {
  return v.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1");
}

function AddPurchaseModal({ open, onClose, vendor, onSaved }: {
  open: boolean;
  onClose: () => void;
  vendor: Vendor | null;
  onSaved: () => void;
}) {
  const [form, setForm] = useState(emptyPurchase());
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  // Hub selection
  const [superHubs, setSuperHubs] = useState<any[]>([]);
  const [subHubs, setSubHubs] = useState<any[]>([]);
  const [superHubId, setSuperHubId] = useState("");
  const [subHubId, setSubHubId] = useState("");
  const [hubsLoading, setHubsLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(emptyPurchase());
      setSuperHubId(""); setSubHubId(""); setSubHubs([]);
      setHubsLoading(true);
      apiFetch("/api/super-hubs")
        .then(d => setSuperHubs(d.superHubs || []))
        .catch(() => setSuperHubs([]))
        .finally(() => setHubsLoading(false));
    }
  }, [open]);

  const handleSuperHubChange = async (id: string) => {
    setSuperHubId(id); setSubHubId(""); setSubHubs([]);
    if (!id) return;
    try {
      const d = await apiFetch(`/api/super-hubs/${id}`);
      setSubHubs(d.subHubs || []);
    } catch { setSubHubs([]); }
  };

  // Auto-select hub for super_hub users when only one option is available.
  const adminScope = useMemo(() => getCurrentAdminScope(), []);
  useEffect(() => {
    if (!open) return;
    if (superHubId) return;
    if (adminScope.role !== "super_hub") return;
    if (superHubs.length !== 1) return;
    handleSuperHubChange(superHubs[0]._id);
  }, [open, superHubs, superHubId, adminScope]);
  useEffect(() => {
    if (!open) return;
    if (subHubId) return;
    if (adminScope.role !== "super_hub") return;
    if (subHubs.length !== 1) return;
    setSubHubId(subHubs[0]._id);
  }, [open, subHubs, subHubId, adminScope]);

  const setField = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const setItem = (idx: number, k: keyof PurchaseItem, v: any) => {
    setForm(f => {
      const items = [...f.items];
      items[idx] = { ...items[idx], [k]: v };
      if (k === "quantity" || k === "pricePerUnit") {
        const qty = k === "quantity" ? Number(v) : Number(items[idx].quantity);
        const price = k === "pricePerUnit" ? Number(v) : Number(items[idx].pricePerUnit);
        items[idx].totalPrice = qty * price;
      }
      return { ...f, items };
    });
  };

  const addItem = () => setForm(f => ({ ...f, items: [...f.items, emptyItem()] }));
  const removeItem = (idx: number) => setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));

  const totalAmount = useMemo(() =>
    form.items.reduce((s, i) => s + (Number(i.quantity) * Number(i.pricePerUnit)), 0),
    [form.items]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendor) return;
    const invalidExisting = form.items.some(i => i.productMode === "existing" && !i.existingProductId);
    if (invalidExisting) { toast({ title: "Select the existing product for each existing-product item", variant: "destructive" }); return; }
    const validItems = form.items.filter(i => i.productName.trim() && Number(i.quantity) > 0);
    if (validItems.length === 0) {
      toast({ title: "Add at least one item", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      // 1. Record vendor purchase
      const admin = getCurrentAdmin();
      const selectedSHub = subHubs.find((s: any) => s.id === subHubId);
      const selectedSuperH = superHubs.find((h: any) => h.id === superHubId);
      const itemsWithMeta = validItems.map(item => ({ ...item, categoryName: item.existingCategory || item.category || "" }));
      await apiFetch(`/api/vendors/${vendor.id}/purchases`, {
        method: "POST",
        body: JSON.stringify({
          ...form,
          items: itemsWithMeta,
          subHubId,
          subHubName: selectedSHub?.name || "",
          superHubId,
          superHubName: selectedSuperH?.name || "",
          createdByName: admin.name,
          createdByEmail: admin.email,
        }),
      });

      // 2. If a sub hub is selected, add each item as a product there
      if (subHubId) {
        const errors: string[] = [];
        for (const item of validItems) {
          try {
            await apiFetch(`/api/sub-hubs/${subHubId}/menu/products`, {
              method: "POST",
              body: JSON.stringify({
                name: item.productName,
                description: item.description || "",
                category: item.category || "",
                subCategory: item.subCategory || "",
                price: Number(item.sellingPrice) || 0,
                originalPrice: Number(item.originalPrice) || 0,
                unit: item.unit,
                grossWeight: item.grossWeight || "",
                netWeight: item.netWeight || "",
                pieces: item.pieces || "",
                serves: item.serves || "",
                quantity: Number(item.quantity) || 0,
                imageUrl: item.imageUrl || "",
                status: item.productStatus || "available",
              }),
            });
          } catch (err: any) {
            errors.push(item.productName);
          }
        }
        if (errors.length > 0) {
          toast({ title: "Purchase saved, but some products failed to add to hub", description: errors.join(", "), variant: "destructive" });
        } else {
          toast({ title: "Purchase saved!", description: `${validItems.length} item(s) added to inventory and sub hub menu.` });
        }
      } else {
        toast({ title: "Purchase saved!", description: `${validItems.length} item(s) recorded.` });
      }

      onSaved();
      onClose();
    } catch (err: any) {
      toast({ title: "Failed to save purchase", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-[#162B4D]" />
            Add Purchase — {vendor?.name}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5">

          {/* Destination Hub */}
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 space-y-3">
            <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider">Destination Hub (optional)</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-gray-600">Super Hub</Label>
                <Select value={superHubId} onValueChange={handleSuperHubChange} disabled={hubsLoading}>
                  <SelectTrigger className="mt-1 h-8 text-sm">
                    <SelectValue placeholder={hubsLoading ? "Loading..." : "Select super hub"} />
                  </SelectTrigger>
                  <SelectContent>
                    {superHubs.map((h: any) => (
                      <SelectItem key={h._id} value={h._id}>{h.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-gray-600">Sub Hub</Label>
                <Select value={subHubId} onValueChange={setSubHubId} disabled={!superHubId || subHubs.length === 0}>
                  <SelectTrigger className="mt-1 h-8 text-sm">
                    <SelectValue placeholder={!superHubId ? "Select super hub first" : "Select sub hub"} />
                  </SelectTrigger>
                  <SelectContent>
                    {subHubs.map((s: any) => (
                      <SelectItem key={s._id} value={s._id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {subHubId && <p className="text-[11px] text-blue-600">Items will be added to this sub hub's product menu.</p>}
          </div>

          {/* Invoice + Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Invoice / Bill No.</Label>
              <Input value={form.invoiceNumber} onChange={e => setField("invoiceNumber", e.target.value)} placeholder="INV-001 (optional)" className="mt-1" />
            </div>
            <div>
              <Label>Purchase Date</Label>
              <Input type="date" value={form.purchaseDate} onChange={e => setField("purchaseDate", e.target.value)} className="mt-1" />
            </div>
          </div>

          {/* Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-sm font-semibold">Items Purchased</Label>
              <Button type="button" size="sm" variant="outline" onClick={addItem} className="h-7 text-xs gap-1">
                <Plus className="w-3 h-3" /> Add Item
              </Button>
            </div>
            <div className="space-y-3">
              {form.items.map((item, idx) => (
                <div key={idx} className="bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
                  {/* Item header */}
                  <div className="flex items-center justify-between bg-gray-100 px-3 py-1.5">
                    <span className="text-xs font-semibold text-gray-500">Item #{idx + 1}</span>
                    {form.items.length > 1 && (
                      <button type="button" onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="p-3 space-y-3">
                    {/* ── Product Info ─────────────────────── */}
                    <div>
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Product Info</p>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="col-span-3">
                          <Input value={item.productName} onChange={e => setItem(idx, "productName", e.target.value)}
                            placeholder="Product name *" className="h-8 text-sm" required />
                        </div>
                        <Input value={item.category} onChange={e => setItem(idx, "category", e.target.value)}
                          placeholder="Category" className="h-8 text-sm" />
                        <Input value={item.subCategory} onChange={e => setItem(idx, "subCategory", e.target.value)}
                          placeholder="Sub Category" className="h-8 text-sm" />
                        <Select value={item.productStatus} onValueChange={v => setItem(idx, "productStatus", v)}>
                          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="available">Available</SelectItem>
                            <SelectItem value="out_of_stock">Out of Stock</SelectItem>
                            <SelectItem value="coming_soon">Coming Soon</SelectItem>
                          </SelectContent>
                        </Select>
                        <div className="col-span-3">
                          <Input value={item.description} onChange={e => setItem(idx, "description", e.target.value)}
                            placeholder="Description (optional)" className="h-8 text-sm" />
                        </div>
                      </div>
                    </div>

                    {/* ── Purchase Details ─────────────────── */}
                    <div>
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Purchase Details (from vendor)</p>
                      <div className="grid grid-cols-4 gap-2">
                        <Input type="text" inputMode="decimal"
                          value={item.quantity}
                          onChange={e => setItem(idx, "quantity", numOnly(e.target.value))}
                          placeholder="Qty" className="h-8 text-sm" />
                        <Select value={item.unit} onValueChange={v => setItem(idx, "unit", v)}>
                          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <div className="flex items-center gap-1 col-span-1">
                          <span className="text-xs text-gray-400 shrink-0">₹</span>
                          <Input type="text" inputMode="decimal"
                            value={item.pricePerUnit}
                            onChange={e => setItem(idx, "pricePerUnit", numOnly(e.target.value))}
                            placeholder="Cost/unit" className="h-8 text-sm" />
                        </div>
                        <Input type="date" value={item.expiryDate}
                          onChange={e => setItem(idx, "expiryDate", e.target.value)}
                          className="h-8 text-sm" title="Expiry date (optional)" />
                      </div>
                      <div className="flex items-center gap-1 text-xs text-gray-500 mt-1.5">
                        <IndianRupee className="w-3 h-3" />
                        <span className="font-semibold text-[#162B4D]">
                          {(Number(item.quantity) * Number(item.pricePerUnit)).toLocaleString("en-IN")}
                        </span>
                        <span className="text-gray-400">purchase total</span>
                      </div>
                    </div>

                    {/* ── Listing Details ──────────────────── */}
                    <div>
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Listing Details (for hub menu)</p>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-gray-400 shrink-0">₹</span>
                          <Input type="text" inputMode="decimal"
                            value={item.sellingPrice}
                            onChange={e => setItem(idx, "sellingPrice", numOnly(e.target.value))}
                            placeholder="Selling price" className="h-8 text-sm" />
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-gray-400 shrink-0">₹</span>
                          <Input type="text" inputMode="decimal"
                            value={item.originalPrice}
                            onChange={e => setItem(idx, "originalPrice", numOnly(e.target.value))}
                            placeholder="MRP" className="h-8 text-sm" />
                        </div>
                        <Select value={item.unit} onValueChange={v => setItem(idx, "unit", v)}>
                          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Display unit" /></SelectTrigger>
                          <SelectContent>
                            {PRODUCT_UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Input value={item.grossWeight} onChange={e => setItem(idx, "grossWeight", e.target.value)}
                          placeholder="Gross weight" className="h-8 text-sm" />
                        <Input value={item.netWeight} onChange={e => setItem(idx, "netWeight", e.target.value)}
                          placeholder="Net weight" className="h-8 text-sm" />
                        <Input value={item.pieces} onChange={e => setItem(idx, "pieces", e.target.value)}
                          placeholder="Pieces (e.g. 4-5)" className="h-8 text-sm" />
                        <Input value={item.serves} onChange={e => setItem(idx, "serves", e.target.value)}
                          placeholder="Serves (e.g. 2-3)" className="h-8 text-sm" />
                        <Input value={item.imageUrl} onChange={e => setItem(idx, "imageUrl", e.target.value)}
                          placeholder="Image URL" className="h-8 text-sm" />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Total */}
          <div className="bg-[#162B4D] text-white rounded-lg px-4 py-3 flex items-center justify-between">
            <span className="text-sm font-medium">Total Purchase Amount</span>
            <span className="text-xl font-bold">{formatRupees(totalAmount)}</span>
          </div>

          <div>
            <Label>Notes</Label>
            <Input value={form.notes} onChange={e => setField("notes", e.target.value)}
              placeholder="Any notes for this purchase..." className="mt-1" />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving} className="bg-[#162B4D] hover:bg-[#1e3a6e] text-white">
              {saving ? "Saving..." : "Save Purchase & Update Inventory"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── VENDOR DETAIL MODAL ──────────────────────────────────────────────────────

function VendorDetailModal({ open, onClose, vendor, onAddPurchase }: {
  open: boolean;
  onClose: () => void;
  vendor: Vendor | null;
  onAddPurchase: () => void;
}) {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [activeTab, setActiveTab] = useState<"overview" | "purchases">("overview");
  const LIMIT = 20;

  const loadPurchases = useCallback(async () => {
    if (!vendor) return;
    setLoading(true);
    try {
      const data = await apiFetch(`/api/vendors/${vendor.id}/purchases?page=${page}&limit=${LIMIT}`);
      setPurchases(data.purchases);
      setTotal(data.total);
    } catch {
      setPurchases([]);
    } finally {
      setLoading(false);
    }
  }, [vendor, page]);

  useEffect(() => {
    if (open && vendor) { setPage(1); setActiveTab("overview"); loadPurchases(); }
  }, [open, vendor]);

  useEffect(() => { if (open) loadPurchases(); }, [page]);

  if (!vendor) return null;

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#162B4D]/10 flex items-center justify-center overflow-hidden border border-gray-100">
                {vendor.profileImageUrl
                  ? <img src={vendor.profileImageUrl} alt={vendor.name} className="w-full h-full object-cover" />
                  : <Building2 className="w-5 h-5 text-[#162B4D]" />}
              </div>
              <div>
                <DialogTitle className="text-left">{vendor.name}</DialogTitle>
                <div className="flex items-center gap-2 mt-0.5">
                  <CategoryBadge category={vendor.category} />
                  <StatusBadge status={vendor.status} />
                </div>
              </div>
            </div>
            <Button size="sm" className="bg-[#162B4D] hover:bg-[#1e3a6e] text-white gap-1.5" onClick={onAddPurchase}>
              <ShoppingCart className="w-3.5 h-3.5" /> Add Purchase
            </Button>
          </div>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex gap-0 border-b border-gray-100 -mx-6 px-6">
          {(["overview", "purchases"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors capitalize ${
                activeTab === tab
                  ? "border-[#162B4D] text-[#162B4D]"
                  : "border-transparent text-gray-400 hover:text-gray-600"
              }`}
            >
              {tab === "purchases" ? `Purchases (${total})` : "Overview"}
            </button>
          ))}
        </div>

        {activeTab === "overview" && (
          <div className="space-y-4">
            {/* Stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-[#162B4D]/5 rounded-lg p-3 text-center">
                <p className="text-xs text-gray-400">Total Purchases</p>
                <p className="text-2xl font-bold text-[#162B4D]">{vendor.totalPurchases}</p>
              </div>
              <div className="bg-amber-50 rounded-lg p-3 text-center">
                <p className="text-xs text-gray-400">Total Spent</p>
                <p className="text-2xl font-bold text-amber-600">{formatRupees(vendor.totalSpent)}</p>
              </div>
            </div>

            {/* Contact Info */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Contact Details</p>
              <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                {vendor.phone && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="w-4 h-4 text-gray-400" />
                    <span>{vendor.phone}</span>
                  </div>
                )}
                {vendor.email && (
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="w-4 h-4 text-gray-400" />
                    <span>{vendor.email}</span>
                  </div>
                )}
                {vendor.address && (
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin className="w-4 h-4 text-gray-400" />
                    <span>{vendor.address}</span>
                  </div>
                )}
                {!vendor.phone && !vendor.email && !vendor.address && (
                  <p className="text-sm text-gray-400">No contact information</p>
                )}
              </div>
            </div>

            {vendor.notes && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Notes</p>
                <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">{vendor.notes}</p>
              </div>
            )}

            <div className="text-xs text-gray-400 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              Added on {formatDate(vendor.createdAt)}
            </div>
          </div>
        )}

        {activeTab === "purchases" && (
          <div className="space-y-3">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="w-5 h-5 animate-spin text-gray-400" />
              </div>
            ) : purchases.length === 0 ? (
              <div className="text-center py-10">
                <ShoppingCart className="w-10 h-10 text-gray-200 mx-auto mb-2" />
                <p className="text-gray-400 text-sm">No purchases yet</p>
                <Button size="sm" className="mt-3 bg-[#162B4D] hover:bg-[#1e3a6e] text-white" onClick={onAddPurchase}>
                  Add First Purchase
                </Button>
              </div>
            ) : (
              <>
                {purchases.map(p => (
                  <div key={p.id} className="border border-gray-100 rounded-lg p-3 bg-gray-50 hover:bg-white transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <FileText className="w-3.5 h-3.5 text-gray-400" />
                        <span className="text-xs font-semibold text-[#162B4D]">
                          {p.invoiceNumber || "No Invoice"}
                        </span>
                        <span className="text-[11px] text-gray-400">•</span>
                        <span className="text-[11px] text-gray-400">{formatDate(p.purchaseDate)}</span>
                      </div>
                      <span className="text-sm font-bold text-amber-600">{formatRupees(p.totalAmount)}</span>
                    </div>
                    <div className="space-y-1">
                      {p.items.map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between text-xs text-gray-600">
                          <div className="flex items-center gap-1.5">
                            <Package className="w-3 h-3 text-gray-300" />
                            <span>{item.productName}</span>
                            <span className="text-gray-400">({item.quantity} {item.unit})</span>
                          </div>
                          <span className="font-medium">{formatRupees(item.totalPrice)}</span>
                        </div>
                      ))}
                    </div>
                    {p.notes && (
                      <p className="text-[11px] text-gray-400 mt-1 italic">{p.notes}</p>
                    )}
                  </div>
                ))}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between pt-2">
                    <Button size="sm" variant="outline" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="h-7">
                      <ChevronLeft className="w-3 h-3" />
                    </Button>
                    <span className="text-xs text-gray-500">Page {page} of {totalPages}</span>
                    <Button size="sm" variant="outline" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="h-7">
                      <ChevronRight className="w-3 h-3" />
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── DELETE CONFIRM MODAL ─────────────────────────────────────────────────────

function DeleteModal({ open, onClose, vendor, onConfirm }: {
  open: boolean; onClose: () => void; vendor: Vendor | null; onConfirm: () => Promise<void>;
}) {
  const [loading, setLoading] = useState(false);
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete Vendor</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-gray-500">
          Are you sure you want to delete <strong>{vendor?.name}</strong>? This action cannot be undone.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            variant="destructive"
            disabled={loading}
            onClick={async () => { setLoading(true); await onConfirm(); setLoading(false); }}
          >
            {loading ? "Deleting..." : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── ADD PURCHASE PAGE ────────────────────────────────────────────────────────

function AddPurchasePage({ vendor, onBack, onSaved }: {
  vendor: Vendor;
  onBack: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState(emptyPurchase());
  const [saving, setSaving] = useState<null | "draft" | "save" | "print">(null);
  const { toast } = useToast();

  const [vendorItemCategories, setVendorItemCategories] = useState<VendorItemCategory[]>([]);
  const [vendorItems, setVendorItems] = useState<VendorCatalogItem[]>([]);
  const [vendorItemsLoading, setVendorItemsLoading] = useState(true);
  const [additionalOpen, setAdditionalOpen] = useState(false);

  useEffect(() => {
    let active = true;
    setVendorItemsLoading(true);
    Promise.all([
      apiFetch("/api/vendor-items/categories"),
      apiFetch("/api/vendor-items/items"),
      apiFetch("/api/vendors/next-invoice-number").catch(() => ({ invoiceNumber: "" })),
    ])
      .then(([categoriesData, itemsData, invoiceData]) => {
        if (!active) return;
        setVendorItemCategories((categoriesData.categories || []).filter((cat: VendorItemCategory) => cat.status !== "inactive"));
        setVendorItems((itemsData.items || []).filter((item: VendorCatalogItem) => item.status !== "inactive"));
        if (invoiceData?.invoiceNumber) {
          setForm(f => f.invoiceNumber ? f : { ...f, invoiceNumber: invoiceData.invoiceNumber });
        }
      })
      .catch(() => {
        if (!active) return;
        setVendorItemCategories([]);
        setVendorItems([]);
        toast({ title: "Failed to load vendor items", variant: "destructive" });
      })
      .finally(() => { if (active) setVendorItemsLoading(false); });
    return () => { active = false; };
  }, []);

  const setField = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const setItem = (idx: number, k: keyof PurchaseItem, v: any) => {
    setForm(f => {
      const items = [...f.items];
      items[idx] = { ...items[idx], [k]: v };
      if (k === "existingCategory") {
        items[idx].existingProductId = "";
        items[idx].productName = "";
      }
      if (k === "quantity" || k === "pricePerUnit") {
        const qty = k === "quantity" ? Number(v) : Number(items[idx].quantity);
        const price = k === "pricePerUnit" ? Number(v) : Number(items[idx].pricePerUnit);
        items[idx].totalPrice = qty * price;
      }
      return { ...f, items };
    });
  };

  const addItem = () => setForm(f => ({ ...f, items: [...f.items, emptyItem()] }));
  const removeItem = (idx: number) => setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));

  const vendorItemCategoryOptions = useMemo(() =>
    vendorItemCategories
      .filter(category => vendorItems.some(item => item.categoryId === category.id))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [vendorItemCategories, vendorItems]
  );

  const applyVendorItem = (idx: number, itemId: string) => {
    const product = vendorItems.find((item) => item.id === itemId);
    setForm(f => {
      const items = [...f.items];
      const pricePerUnit = product?.purchasePrice !== undefined ? String(product.purchasePrice) : items[idx].pricePerUnit;
      const qty = Number(items[idx].quantity) || 0;
      items[idx] = product
        ? {
            ...items[idx],
            existingProductId: product.id,
            productName: product.name,
            category: product.categoryName,
            existingCategory: product.categoryId,
            unit: product.unit || items[idx].unit || "kg",
            pricePerUnit,
            totalPrice: qty * Number(pricePerUnit),
            description: product.description || "",
            productMode: "existing",
          }
        : { ...items[idx], existingProductId: itemId, productName: "" };
      return { ...f, items };
    });
  };

  const subtotal = useMemo(() =>
    form.items.reduce((s, i) => s + (Number(i.quantity) * Number(i.pricePerUnit)), 0),
    [form.items]
  );

  const taxAmount = useMemo(() =>
    form.items.reduce((s, i) => {
      const line = Number(i.quantity) * Number(i.pricePerUnit);
      const tax = Number(i.taxPct || 0);
      return s + (line * tax / 100);
    }, 0),
    [form.items]
  );

  const discountAmount = Number(form.discount) || 0;
  const extraChargeAmount = Number(form.extraCharge) || 0;
  const roundOffAmount = Number(form.roundOff) || 0;
  const totalAmount = Math.max(0, subtotal - discountAmount + extraChargeAmount + taxAmount + roundOffAmount);

  const savePurchase = async (mode: "draft" | "save" | "print") => {
    const validItems = form.items.filter(i => i.existingCategory && i.existingProductId && i.productName.trim() && Number(i.quantity) > 0);
    if (mode !== "draft" && validItems.length === 0) {
      toast({ title: "Please add at least one item with a quantity", variant: "destructive" });
      return null;
    }
    if (mode === "draft" && form.items.every(i => !i.existingCategory && !i.existingProductId && !Number(i.quantity))) {
      toast({ title: "Add at least one item before saving as draft", variant: "destructive" });
      return null;
    }
    setSaving(mode);
    try {
      const admin = getCurrentAdmin();
      const sourceItems = mode === "draft" && validItems.length === 0 ? form.items : validItems;
      const itemsWithMeta = sourceItems.map(item => ({
        ...item,
        quantity: Number(item.quantity) || 0,
        categoryName: item.category || "",
        vendorItemId: item.existingProductId,
        vendorItemCategoryId: item.existingCategory,
        batches: [{ quantity: String(Number(item.quantity) || 0), shelfLifeDays: "" }],
      }));
      const data = await apiFetch(`/api/vendors/${vendor.id}/purchases`, {
        method: "POST",
        body: JSON.stringify({
          ...form,
          items: itemsWithMeta,
          status: mode === "draft" ? "draft" : "saved",
          subHubId: "",
          subHubName: "",
          superHubId: "",
          superHubName: "",
          createdByName: admin.name,
          createdByEmail: admin.email,
        }),
      });
      if (mode === "draft") {
        toast({ title: "Draft saved", description: "You can find it in Invoices." });
      } else {
        toast({ title: "Purchase saved!", description: `${validItems.length} item(s) recorded.` });
      }
      onSaved();
      const saved = data?.purchase;
      setForm(emptyPurchase());
      // Refresh next invoice number so the form is ready for another entry
      apiFetch("/api/vendors/next-invoice-number").then(d => {
        if (d?.invoiceNumber) setForm(f => ({ ...f, invoiceNumber: d.invoiceNumber }));
      }).catch(() => {});
      return saved;
    } catch (err: any) {
      toast({ title: "Failed to save purchase", description: err.message, variant: "destructive" });
      return null;
    } finally {
      setSaving(null);
    }
  };

  const printInvoice = async (purchase: any) => {
    const items = purchase?.items ?? [];
    const rows = items.map((it: any, i: number) => `
      <tr>
        <td>${i + 1}</td>
        <td>${(it.categoryName ?? "")}</td>
        <td>${(it.productName ?? "")}</td>
        <td style="text-align:right">${Number(it.quantity ?? 0)}</td>
        <td>${(it.unit ?? "")}</td>
        <td style="text-align:right">₹${Number(it.pricePerUnit ?? 0).toFixed(2)}</td>
        <td style="text-align:right">₹${Number(it.totalPrice ?? 0).toFixed(2)}</td>
      </tr>`).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8" />
      <title>Invoice ${purchase?.invoiceNumber ?? ""}</title>
      <style>
        body{font-family:Inter,Arial,sans-serif;color:#162B4D;padding:24px;max-width:800px;margin:0 auto}
        h1{font-size:20px;margin:0 0 4px} .muted{color:#6b7280;font-size:12px}
        .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #162B4D;padding-bottom:12px;margin-bottom:16px}
        table{width:100%;border-collapse:collapse;margin-top:12px;font-size:13px}
        th,td{border:1px solid #e5e7eb;padding:8px;text-align:left}
        th{background:#f9fafb;font-size:11px;text-transform:uppercase;color:#6b7280}
        .totals{margin-top:16px;width:280px;margin-left:auto;font-size:13px}
        .totals .row{display:flex;justify-content:space-between;padding:4px 0}
        .total{background:#162B4D;color:#fff;padding:10px;display:flex;justify-content:space-between;font-weight:700;margin-top:6px;border-radius:4px}
        @media print { .no-print{display:none} }
      </style></head><body>
      <div class="head">
        <div>
          <h1>Purchase Invoice</h1>
          <div class="muted">Invoice No: <strong>${purchase?.invoiceNumber ?? "-"}</strong></div>
          <div class="muted">Date: ${purchase?.purchaseDate ? new Date(purchase.purchaseDate).toLocaleDateString() : "-"}</div>
        </div>
        <div style="text-align:right">
          <h1>${vendor.name}</h1>
          <div class="muted">${vendor.phone ?? ""}</div>
          <div class="muted">${vendor.email ?? ""}</div>
          <div class="muted">${vendor.address ?? ""}</div>
        </div>
      </div>
      <table>
        <thead><tr><th>#</th><th>Category</th><th>Item</th><th style="text-align:right">Qty</th><th>Unit</th><th style="text-align:right">Cost/Unit</th><th style="text-align:right">Total</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="totals">
        <div class="row"><span>Subtotal</span><span>₹${Number(subtotal).toFixed(2)}</span></div>
        ${discountAmount ? `<div class="row"><span>Discount</span><span>− ₹${discountAmount.toFixed(2)}</span></div>` : ""}
        ${extraChargeAmount ? `<div class="row"><span>Extra Charge</span><span>+ ₹${extraChargeAmount.toFixed(2)}</span></div>` : ""}
        ${taxAmount ? `<div class="row"><span>Tax</span><span>₹${taxAmount.toFixed(2)}</span></div>` : ""}
        ${roundOffAmount ? `<div class="row"><span>Round Off</span><span>₹${roundOffAmount.toFixed(2)}</span></div>` : ""}
        <div class="total"><span>Total</span><span>₹${Number(purchase?.totalAmount ?? totalAmount).toFixed(2)}</span></div>
      </div>
      ${purchase?.notes ? `<p class="muted" style="margin-top:16px"><strong>Notes:</strong> ${purchase.notes}</p>` : ""}
      </body></html>`;

    toast({ title: "Printing..." });
    const qzResult = await printHtmlWithQZ(html);
    if (qzResult.success) return;

    // QZ Tray unavailable — fall back to browser print dialog
    toast({ title: "Print failed, opening dialog...", variant: "destructive" });
    const fallbackHtml = html + `<script>window.onload=()=>{setTimeout(()=>window.print(),200)}</script>`;
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) {
      toast({ title: "Pop-up blocked", description: "Allow pop-ups to print the invoice.", variant: "destructive" });
      return;
    }
    w.document.open();
    w.document.write(fallbackHtml);
    w.document.close();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void savePurchase("save");
  };

  return (
    <div className="w-full space-y-0">
      {/* ─── Page Header ─────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#162B4D] transition-colors"
          >
            <ChevronLeft className="w-4 h-4" /> Back to Vendors
          </button>
          <span className="text-gray-300">|</span>
          <div className="flex items-center gap-2">
            {vendor.profileImageUrl
              ? <img src={vendor.profileImageUrl} alt={vendor.name} className="w-7 h-7 rounded-full object-cover border border-gray-200" />
              : <div className="w-7 h-7 rounded-full bg-[#162B4D]/10 flex items-center justify-center"><Building2 className="w-3.5 h-3.5 text-[#162B4D]" /></div>}
            <div>
              <h1 className="text-base font-bold text-[#162B4D] leading-none">New Purchase</h1>
              <p className="text-xs text-gray-400 mt-0.5">{vendor.name}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Invoice Card ─────────────────────────────────────── */}
      <form onSubmit={handleSubmit}>
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">

          {/* Invoice top bar */}
          <div className="bg-[#162B4D] px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-white/70" />
              <span className="text-white font-semibold text-sm">Purchase Invoice</span>
              <span className="text-white/40 mx-1">·</span>
              <span className="text-white/70 text-sm">{vendor.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-white/60 text-xs">Total</span>
              <span className="text-white font-bold text-lg">{formatRupees(totalAmount)}</span>
            </div>
          </div>

          {/* Invoice meta row */}
          <div className="border-b border-gray-100 px-6 py-4 grid grid-cols-3 gap-6">
            <div>
              <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Invoice / Bill No.</label>
              <Input
                value={form.invoiceNumber}
                onChange={e => setField("invoiceNumber", e.target.value)}
                placeholder="INV-001 (optional)"
                className="h-9 text-sm border-gray-200"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Date</label>
              <Input
                type="date"
                value={form.purchaseDate}
                onChange={e => setField("purchaseDate", e.target.value)}
                className="h-9 text-sm border-gray-200"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Due Date</label>
              <Input
                type="date"
                value={form.dueDate}
                onChange={e => setField("dueDate", e.target.value)}
                className="h-9 text-sm border-gray-200"
              />
            </div>
          </div>

          {/* ─── Additional Fields (collapsible) ───────────────── */}
          <div className="border-b border-gray-100">
            <button
              type="button"
              onClick={() => setAdditionalOpen(o => !o)}
              className="w-full px-6 py-3 flex items-center justify-between hover:bg-gray-50/60 transition-colors"
            >
              <span className="text-sm font-semibold text-[#162B4D] flex items-center gap-2">
                Additional Fields
                <span className="text-[10px] font-normal text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">optional</span>
              </span>
              <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${additionalOpen ? "rotate-90" : ""}`} />
            </button>
            {additionalOpen && (
              <div className="px-6 pb-5 grid grid-cols-4 gap-4">
                <div>
                  <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Billing Address</label>
                  <Input value={form.billingAddress} onChange={e => setField("billingAddress", e.target.value)} placeholder="Choose Address" className="h-9 text-sm border-gray-200" />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Shipping Address</label>
                  <Input value={form.shippingAddress} onChange={e => setField("shippingAddress", e.target.value)} placeholder="Choose Address" className="h-9 text-sm border-gray-200" />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Place of Supply</label>
                  <Input value={form.placeOfSupply} onChange={e => setField("placeOfSupply", e.target.value)} placeholder="Choose State" className="h-9 text-sm border-gray-200" />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Reference No.</label>
                  <Input value={form.referenceNumber} onChange={e => setField("referenceNumber", e.target.value)} placeholder="Reference" className="h-9 text-sm border-gray-200" />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Delivery Date</label>
                  <Input type="date" value={form.deliveryDate} onChange={e => setField("deliveryDate", e.target.value)} className="h-9 text-sm border-gray-200" />
                </div>
                <div className="col-span-3">
                  <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Note</label>
                  <Input value={form.additionalNote} onChange={e => setField("additionalNote", e.target.value)} placeholder="Enter Value" className="h-9 text-sm border-gray-200" />
                </div>
              </div>
            )}
          </div>

          {/* ─── Items Table ───────────────────────────────────── */}
          <div className="px-6 py-4">
            {/* Table header */}
            <div
              className="grid gap-2 mb-2 px-2"
              style={{ gridTemplateColumns: "2rem 1fr 1fr 1.2fr 4.5rem 4.5rem 5.5rem 4.5rem 5.5rem 2rem" }}
            >
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">#</span>
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Category</span>
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Item</span>
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Description</span>
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Qty</span>
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Unit</span>
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Cost/Unit</span>
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Tax %</span>
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider text-right">Total</span>
              <span />
            </div>

            {/* Table rows */}
            <div className="space-y-2">
              {form.items.map((item, idx) => {
                const lineSubtotal = Number(item.quantity) * Number(item.pricePerUnit);
                const lineTax = lineSubtotal * (Number(item.taxPct || 0) / 100);
                const rowTotal = lineSubtotal + lineTax;
                const filteredItems = vendorItems.filter(p => p.categoryId === item.existingCategory);
                return (
                  <div
                    key={idx}
                    className="grid gap-2 items-center bg-gray-50 border border-gray-100 rounded-xl px-2 py-2.5 hover:border-[#162B4D]/20 transition-colors"
                    style={{ gridTemplateColumns: "2rem 1fr 1fr 1.2fr 4.5rem 4.5rem 5.5rem 4.5rem 5.5rem 2rem" }}
                  >
                    {/* Row number */}
                    <div className="flex items-center justify-center">
                      <span className="w-5 h-5 rounded-full bg-[#162B4D]/10 text-[#162B4D] text-[10px] font-bold flex items-center justify-center">
                        {idx + 1}
                      </span>
                    </div>

                    {/* Category */}
                    <select
                      value={item.existingCategory}
                      onChange={e => setItem(idx, "existingCategory", e.target.value)}
                      disabled={vendorItemsLoading}
                      className="h-9 w-full rounded-lg border border-gray-200 bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#162B4D]/20 disabled:opacity-50"
                    >
                      <option value="">
                        {vendorItemsLoading ? "Loading..." : vendorItemCategoryOptions.length === 0 ? "No categories" : "Category..."}
                      </option>
                      {vendorItemCategoryOptions.map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>

                    {/* Item */}
                    <select
                      value={item.existingProductId}
                      onChange={e => applyVendorItem(idx, e.target.value)}
                      disabled={!item.existingCategory || vendorItemsLoading}
                      className="h-9 w-full rounded-lg border border-gray-200 bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#162B4D]/20 disabled:opacity-50"
                    >
                      <option value="">
                        {!item.existingCategory ? "Select category" : filteredItems.length === 0 ? "No items" : "Item..."}
                      </option>
                      {filteredItems.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>

                    {/* Description */}
                    <Input
                      value={item.description}
                      onChange={e => setItem(idx, "description", e.target.value)}
                      placeholder="Description"
                      className="h-9 text-sm border-gray-200"
                    />

                    {/* Qty */}
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={item.quantity}
                      onChange={e => setItem(idx, "quantity", numOnly(e.target.value))}
                      placeholder="0"
                      className="h-9 text-sm text-center border-gray-200"
                    />

                    {/* Unit */}
                    <select
                      value={item.unit}
                      onChange={e => setItem(idx, "unit", e.target.value)}
                      className="h-9 w-full rounded-lg border border-gray-200 bg-white px-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#162B4D]/20"
                    >
                      {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>

                    {/* Cost/Unit */}
                    <div className="relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₹</span>
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={item.pricePerUnit}
                        onChange={e => setItem(idx, "pricePerUnit", numOnly(e.target.value))}
                        placeholder="0"
                        className="h-9 text-sm pl-5 border-gray-200"
                      />
                    </div>

                    {/* Tax % */}
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={item.taxPct || ""}
                      onChange={e => setItem(idx, "taxPct", numOnly(e.target.value))}
                      placeholder="0"
                      className="h-9 text-sm text-center border-gray-200"
                    />

                    {/* Row total */}
                    <div className="text-right">
                      <span className="text-sm font-semibold text-[#162B4D]">
                        {rowTotal > 0 ? formatRupees(rowTotal) : <span className="text-gray-300">—</span>}
                      </span>
                    </div>

                    {/* Delete */}
                    <div className="flex items-center justify-center">
                      {form.items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeItem(idx)}
                          className="text-gray-300 hover:text-red-400 transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Add row button */}
            <button
              type="button"
              onClick={addItem}
              className="mt-3 flex items-center gap-2 text-sm text-[#1A56DB] hover:text-[#1A56DB]/80 font-medium transition-colors px-2 py-1.5 rounded-lg hover:bg-blue-50"
            >
              <Plus className="w-4 h-4" /> Add Row
            </button>
          </div>

          {/* ─── Notes + Summary panel ────────────────────────── */}
          <div className="border-t border-gray-100 px-6 py-5 grid grid-cols-2 gap-6 bg-gray-50/40">
            {/* Left: Notes */}
            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                  Notes for Vendor
                </label>
                <textarea
                  value={form.notes}
                  onChange={e => setField("notes", e.target.value)}
                  placeholder="Enter any notes..."
                  rows={4}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#162B4D]/20 resize-none"
                />
              </div>
            </div>

            {/* Right: Summary */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200">
                <span className="text-xs font-bold text-[#162B4D] uppercase tracking-wider">Summary</span>
              </div>
              <div className="px-4 py-3 space-y-2.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Subtotal</span>
                  <span className="font-medium text-gray-700">{formatRupees(subtotal)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-gray-500 shrink-0">Discount</span>
                  <div className="relative w-28">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">₹</span>
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={form.discount}
                      onChange={e => setField("discount", numOnly(e.target.value))}
                      placeholder="0"
                      className="h-8 text-sm pl-5 text-right border-gray-200"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-gray-500 shrink-0">Extra Charge</span>
                  <div className="relative w-28">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">₹</span>
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={form.extraCharge}
                      onChange={e => setField("extraCharge", numOnly(e.target.value))}
                      placeholder="0"
                      className="h-8 text-sm pl-5 text-right border-gray-200"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Tax</span>
                  <span className="font-medium text-gray-700">{formatRupees(taxAmount)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-gray-500 shrink-0">Round Off</span>
                  <div className="relative w-28">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">₹</span>
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={form.roundOff}
                      onChange={e => setField("roundOff", e.target.value.replace(/[^0-9.\-]/g, ""))}
                      placeholder="0"
                      className="h-8 text-sm pl-5 text-right border-gray-200"
                    />
                  </div>
                </div>
              </div>
              <div className="bg-[#162B4D] px-4 py-3 flex items-center justify-between">
                <span className="text-white font-semibold">Total</span>
                <span className="text-white font-bold text-lg">{formatRupees(totalAmount)}</span>
              </div>
            </div>
          </div>

          {/* ─── Actions ──────────────────────────────────────── */}
          <div className="border-t border-gray-100 px-6 py-3 flex items-center justify-between bg-white">
            <div className="text-xs text-gray-500">
              {form.items.filter(i => i.existingProductId && Number(i.quantity) > 0).length} item(s) ready
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button type="button" variant="outline" onClick={onBack} disabled={!!saving} className="h-9">
                Cancel
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!!saving}
                onClick={() => savePurchase("draft")}
                className="h-9 gap-1.5 border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                <FileText className="w-4 h-4" />
                {saving === "draft" ? "Saving..." : "Save as Draft"}
              </Button>
              <Button
                type="submit"
                disabled={!!saving}
                className="h-9 bg-[#162B4D] hover:bg-[#1e3a6e] text-white gap-1.5"
              >
                <ShoppingCart className="w-4 h-4" />
                {saving === "save" ? "Saving..." : "Save"}
              </Button>
              <Button
                type="button"
                disabled={!!saving}
                onClick={async () => {
                  const saved = await savePurchase("print");
                  if (saved) printInvoice(saved);
                }}
                className="h-9 bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
              >
                <Printer className="w-4 h-4" />
                {saving === "print" ? "Saving..." : "Save & Print"}
              </Button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

// ─── ALL TRANSACTIONS PAGE ────────────────────────────────────────────────────

export function AllTransactionsPage({
  onBack,
  initialVendorId,
  initialVendorName,
  pageTitle,
  pageSubtitle,
}: {
  onBack?: () => void;
  initialVendorId?: string;
  initialVendorName?: string;
  pageTitle?: string;
  pageSubtitle?: string;
}) {
  const { toast } = useToast();
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const LIMIT = 20;

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("date_desc");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [layout, setLayout] = useState<"list" | "grid">("list");
  const [showFilters, setShowFilters] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Purchase | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [editTarget, setEditTarget] = useState<Purchase | null>(null);
  const [editForm, setEditForm] = useState({ invoiceNumber: "", purchaseDate: "", notes: "" });
  const [editSaving, setEditSaving] = useState(false);

  const hasFilters = !!(dateFrom || dateTo || (sort !== "date_desc") || initialVendorId);

  const loadPurchases = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(LIMIT), sort });
      if (search) params.set("search", search);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      if (initialVendorId) params.set("vendorId", initialVendorId);
      const data = await apiFetch(`/api/vendors/all-purchases?${params}`);
      setPurchases(data.purchases);
      setTotal(data.total);
    } catch { setPurchases([]); }
    finally { setLoading(false); }
  }, [page, search, sort, dateFrom, dateTo, initialVendorId]);

  useEffect(() => { loadPurchases(); }, [loadPurchases]);

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const openEdit = (p: Purchase) => {
    setEditTarget(p);
    const d = p.purchaseDate ? new Date(p.purchaseDate).toISOString().slice(0, 10) : "";
    setEditForm({ invoiceNumber: p.invoiceNumber || "", purchaseDate: d, notes: p.notes || "" });
  };

  const handleEditSave = async () => {
    if (!editTarget) return;
    setEditSaving(true);
    try {
      await apiFetch(`/api/vendors/purchases/${editTarget.id}`, {
        method: "PUT",
        body: JSON.stringify(editForm),
      });
      toast({ title: "Transaction updated!" });
      setEditTarget(null);
      loadPurchases();
    } catch (e: any) {
      toast({ title: "Update failed", description: e.message, variant: "destructive" });
    } finally { setEditSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteSaving(true);
    try {
      await apiFetch(`/api/vendors/purchases/${deleteTarget.id}`, { method: "DELETE" });
      toast({ title: "Transaction deleted" });
      setDeleteTarget(null);
      loadPurchases();
    } catch (e: any) {
      toast({ title: "Delete failed", description: e.message, variant: "destructive" });
    } finally { setDeleteSaving(false); }
  };

  const clearFilters = () => { setDateFrom(""); setDateTo(""); setSort("date_desc"); setPage(1); };

  const totalPages = Math.ceil(total / LIMIT);

  const TransactionCard = ({ p }: { p: Purchase }) => (
    <div className="bg-white border border-gray-100 rounded-xl shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      <div className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-full bg-[#162B4D]/10 flex items-center justify-center flex-shrink-0">
              <Building2 className="w-3.5 h-3.5 text-[#162B4D]" />
            </div>
            <span className="text-sm font-bold text-[#162B4D] truncate">{p.vendorName || "Unknown Vendor"}</span>
          </div>
          {p.invoiceNumber && (
            <span className="flex items-center gap-0.5 text-xs text-gray-500 font-mono bg-gray-100 px-1.5 py-0.5 rounded flex-shrink-0">
              <Hash className="w-2.5 h-2.5" />{p.invoiceNumber}
            </span>
          )}
        </div>

        {/* Meta */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <Clock className="w-3 h-3 text-gray-400 shrink-0" />
            <span>{formatDateTime(p.purchaseDate)}</span>
          </div>
          {p.createdByName && (
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <User className="w-3 h-3 text-gray-400 shrink-0" />
              <span>{p.createdByName}</span>
            </div>
          )}
          {(p.superHubName || p.subHubName) && (
            <div className="flex items-center gap-1 text-xs text-blue-600">
              <Layers className="w-3 h-3 shrink-0" />
              {p.superHubName && <span>{p.superHubName}</span>}
              {p.superHubName && p.subHubName && <ChevronRight className="w-3 h-3 text-blue-400" />}
              {p.subHubName && <span className="font-medium">{p.subHubName}</span>}
            </div>
          )}
        </div>

        {/* Items */}
        <div className="space-y-2">
          {p.items.map((item, i) => (
            <div key={i} className="bg-gray-50 rounded-lg p-2.5">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Package className="w-3 h-3 text-gray-400 shrink-0" />
                {(item as any).categoryName && (
                  <>
                    <span className="text-[11px] text-gray-400">{(item as any).categoryName}</span>
                    <ChevronRight className="w-3 h-3 text-gray-300" />
                  </>
                )}
                <span className="text-xs font-semibold text-gray-700">{item.productName}</span>
              </div>
              {((item as any).batches?.length > 0) ? (
                <div className="flex flex-col gap-0.5 ml-4.5">
                  {(item as any).batches.map((b: PurchaseDisplayBatch, bi: number) => (
                    <div key={bi} className="flex items-center gap-2 text-[11px] text-gray-500">
                      <span className="bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded font-medium">Batch {bi + 1}</span>
                      <span className="text-gray-400">Qty:</span><span>{b.quantity}</span>
                      {b.shelfLifeDays > 0 && <span className="text-orange-500">{b.shelfLifeDays}d shelf life</span>}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="ml-4.5 text-[11px] text-gray-500">{item.quantity}</div>
              )}
            </div>
          ))}
        </div>

        {p.notes && (
          <div className="flex items-start gap-1.5 px-1">
            <FileText className="w-3 h-3 text-gray-300 mt-0.5 shrink-0" />
            <p className="text-xs text-gray-400 italic">{p.notes}</p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-1 px-4 py-2 bg-gray-50 border-t border-gray-100">
        <Button size="sm" variant="ghost" className="h-7 text-xs px-2 text-blue-600 hover:bg-blue-50" onClick={() => openEdit(p)}>
          <Edit2 className="w-3 h-3 mr-1" /> Edit
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs px-2 text-red-500 hover:bg-red-50" onClick={() => setDeleteTarget(p)}>
          <Trash2 className="w-3 h-3 mr-1" /> Delete
        </Button>
      </div>
    </div>
  );

  const TransactionRow = ({ p }: { p: Purchase }) => (
    <div className="bg-white border border-gray-100 rounded-xl shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      <div className="flex items-start gap-4 p-4">
        <div className="w-9 h-9 rounded-full bg-[#162B4D]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Building2 className="w-4 h-4 text-[#162B4D]" />
        </div>
        <div className="flex-1 min-w-0">
          {/* Header row */}
          <div className="flex items-start justify-between gap-2 flex-wrap mb-2">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-[#162B4D] text-sm">{p.vendorName || "Unknown Vendor"}</span>
                {p.invoiceNumber && (
                  <span className="flex items-center gap-0.5 text-xs text-gray-400 font-mono bg-gray-100 px-1.5 py-0.5 rounded">
                    <Hash className="w-2.5 h-2.5" />{p.invoiceNumber}
                  </span>
                )}
              </div>
              {/* Meta */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1">
                <span className="flex items-center gap-1 text-xs text-gray-400">
                  <Clock className="w-3 h-3" />{formatDateTime(p.purchaseDate)}
                </span>
                {p.createdByName && (
                  <span className="flex items-center gap-1 text-xs text-gray-400">
                    <User className="w-3 h-3" />{p.createdByName}
                  </span>
                )}
                {(p.superHubName || p.subHubName) && (
                  <span className="flex items-center gap-1 text-xs text-blue-600">
                    <Layers className="w-3 h-3" />
                    {p.superHubName && <span>{p.superHubName}</span>}
                    {p.superHubName && p.subHubName && <ChevronRight className="w-3 h-3 text-blue-400" />}
                    {p.subHubName && <span className="font-medium">{p.subHubName}</span>}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Items */}
          <div className="space-y-2 mt-2">
            {p.items.map((item, i) => (
              <div key={i} className="bg-gray-50 rounded-lg px-3 py-2.5">
                <div className="flex items-center gap-1.5 mb-1">
                  <Package className="w-3 h-3 text-gray-400 shrink-0" />
                  {(item as any).categoryName && (
                    <>
                      <span className="text-xs text-gray-400">{(item as any).categoryName}</span>
                      <ChevronRight className="w-3 h-3 text-gray-300" />
                    </>
                  )}
                  <span className="text-xs font-semibold text-gray-700">{item.productName}</span>
                </div>
                {((item as any).batches?.length > 0) ? (
                  <div className="flex flex-wrap gap-2 ml-4.5">
                    {(item as any).batches.map((b: PurchaseDisplayBatch, bi: number) => (
                      <div key={bi} className="flex items-center gap-1.5 text-[11px]">
                        <span className="bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded font-medium">Batch {bi + 1}</span>
                        <span className="text-gray-400">Qty:</span><span className="text-gray-600">{b.quantity}</span>
                        {b.shelfLifeDays > 0 && <span className="text-orange-500">{b.shelfLifeDays}d shelf life</span>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="ml-4.5 text-[11px] text-gray-500">{item.quantity}</div>
                )}
              </div>
            ))}
          </div>

          {p.notes && (
            <div className="flex items-start gap-1.5 mt-2.5">
              <FileText className="w-3 h-3 text-gray-300 mt-0.5 shrink-0" />
              <p className="text-xs text-gray-400 italic">{p.notes}</p>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1 flex-shrink-0">
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-blue-500 hover:bg-blue-50" onClick={() => openEdit(p)}>
            <Edit2 className="w-3.5 h-3.5" />
          </Button>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-400 hover:bg-red-50" onClick={() => setDeleteTarget(p)}>
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {onBack && (
            <>
              <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#162B4D] transition-colors shrink-0">
                <ChevronLeft className="w-4 h-4" /> Back to Vendors
              </button>
              <span className="text-gray-300">|</span>
            </>
          )}
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-[#162B4D] leading-none">
              {pageTitle ?? (initialVendorName ? `${initialVendorName} — History` : "Transaction History")}
            </h1>
            <p className="text-xs text-gray-400 mt-0.5">
              {pageSubtitle ?? (initialVendorName ? `All purchases from ${initialVendorName}` : "All vendor purchases across all hubs")}
            </p>
          </div>
        </div>
        <button onClick={loadPurchases} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-[#162B4D] transition-colors flex-shrink-0">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Toolbar */}
      <div className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
            <input
              type="text"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder={initialVendorId ? "Search by invoice..." : "Search by vendor or invoice..."}
              className="w-full h-9 pl-9 pr-8 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#162B4D]/20 focus:border-[#162B4D]/40"
            />
            {searchInput && (
              <button onClick={() => setSearchInput("")} className="absolute right-2 top-1/2 -translate-y-1/2">
                <X className="w-3.5 h-3.5 text-gray-300 hover:text-gray-500" />
              </button>
            )}
          </div>

          {/* Sort */}
          <Select value={sort} onValueChange={v => { setSort(v); setPage(1); }}>
            <SelectTrigger className="h-9 text-sm w-[160px] gap-1">
              <ArrowUpDown className="w-3 h-3 text-gray-400" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="date_desc">Newest First</SelectItem>
              <SelectItem value="date_asc">Oldest First</SelectItem>
              <SelectItem value="amount_desc">Highest Amount</SelectItem>
              <SelectItem value="amount_asc">Lowest Amount</SelectItem>
              {!initialVendorId && <SelectItem value="vendor_asc">Vendor A–Z</SelectItem>}
              {!initialVendorId && <SelectItem value="vendor_desc">Vendor Z–A</SelectItem>}
            </SelectContent>
          </Select>

          {/* Filter toggle */}
          <Button
            size="sm"
            variant={showFilters ? "default" : "outline"}
            className={`h-9 px-3 gap-1.5 ${showFilters ? "bg-[#162B4D] text-white" : "text-gray-600"}`}
            onClick={() => setShowFilters(f => !f)}
          >
            <Filter className="w-3.5 h-3.5" />
            Filter
            {(dateFrom || dateTo) && (
              <span className="ml-1 bg-amber-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">!</span>
            )}
          </Button>

          {/* Layout toggle */}
          <div className="flex items-center bg-gray-100 rounded-lg p-0.5 gap-0.5">
            <button
              onClick={() => setLayout("list")}
              className={`p-1.5 rounded-md transition-colors ${layout === "list" ? "bg-white shadow-sm text-[#162B4D]" : "text-gray-400 hover:text-gray-600"}`}
              title="List view"
            >
              <LayoutList className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setLayout("grid")}
              className={`p-1.5 rounded-md transition-colors ${layout === "grid" ? "bg-white shadow-sm text-[#162B4D]" : "text-gray-400 hover:text-gray-600"}`}
              title="Grid view"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Count */}
          {!loading && (
            <span className="text-sm text-gray-400 ml-auto whitespace-nowrap">{total} transaction{total !== 1 ? "s" : ""}</span>
          )}
        </div>

        {/* Filter panel */}
        {showFilters && (
          <div className="border-t border-gray-100 pt-3 flex items-end gap-3 flex-wrap">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500 font-medium">From date</label>
              <input
                type="date"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={e => { setDateFrom(e.target.value); setPage(1); }}
                className="h-8 px-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#162B4D]/20"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500 font-medium">To date</label>
              <input
                type="date"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={e => { setDateTo(e.target.value); setPage(1); }}
                className="h-8 px-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#162B4D]/20"
              />
            </div>
            {(dateFrom || dateTo) && (
              <Button size="sm" variant="ghost" className="h-8 text-xs text-gray-400 hover:text-red-500" onClick={clearFilters}>
                <X className="w-3 h-3 mr-1" /> Clear dates
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Active filter chips */}
      {hasFilters && (
        <div className="flex items-center gap-2 flex-wrap -mt-1">
          {initialVendorName && (
            <span className="flex items-center gap-1 text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full">
              <Building2 className="w-3 h-3" /> {initialVendorName}
            </span>
          )}
          {dateFrom && (
            <span className="flex items-center gap-1 text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">
              <Calendar className="w-3 h-3" /> From: {dateFrom}
              <button onClick={() => setDateFrom("")} className="ml-1 hover:text-blue-900"><X className="w-2.5 h-2.5" /></button>
            </span>
          )}
          {dateTo && (
            <span className="flex items-center gap-1 text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">
              <Calendar className="w-3 h-3" /> To: {dateTo}
              <button onClick={() => setDateTo("")} className="ml-1 hover:text-blue-900"><X className="w-2.5 h-2.5" /></button>
            </span>
          )}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className={layout === "grid" ? "grid grid-cols-1 md:grid-cols-2 gap-4" : "space-y-3"}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-100 h-44 animate-pulse" />
          ))}
        </div>
      ) : purchases.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-xl border border-gray-100">
          <ShoppingCart className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No transactions found</p>
          <p className="text-gray-400 text-sm mt-1">
            {search || dateFrom || dateTo ? "Try adjusting your search or filters" : "Purchase records will appear here"}
          </p>
          {(search || dateFrom || dateTo) && (
            <Button size="sm" variant="outline" className="mt-3" onClick={() => { setSearchInput(""); setSearch(""); clearFilters(); }}>
              Clear all filters
            </Button>
          )}
        </div>
      ) : layout === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {purchases.map(p => <TransactionCard key={p.id} p={p} />)}
        </div>
      ) : (
        <div className="space-y-3">
          {purchases.map(p => <TransactionRow key={p.id} p={p} />)}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="h-8">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm text-gray-500">Page {page} of {totalPages}</span>
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="h-8">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editTarget} onOpenChange={open => !open && setEditTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Transaction</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs font-medium text-gray-500 mb-1.5 block">Invoice Number</Label>
              <Input
                value={editForm.invoiceNumber}
                onChange={e => setEditForm(f => ({ ...f, invoiceNumber: e.target.value }))}
                placeholder="e.g. INV-001"
                className="h-9"
              />
            </div>
            <div>
              <Label className="text-xs font-medium text-gray-500 mb-1.5 block">Purchase Date</Label>
              <Input
                type="date"
                value={editForm.purchaseDate}
                onChange={e => setEditForm(f => ({ ...f, purchaseDate: e.target.value }))}
                className="h-9"
              />
            </div>
            <div>
              <Label className="text-xs font-medium text-gray-500 mb-1.5 block">Notes</Label>
              <textarea
                value={editForm.notes}
                onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                rows={3}
                placeholder="Add any notes..."
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#162B4D]/20 resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)} disabled={editSaving}>Cancel</Button>
            <Button onClick={handleEditSave} disabled={editSaving} className="bg-[#162B4D] hover:bg-[#1e3a6e] text-white">
              {editSaving ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5" /> Delete Transaction
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600 py-2">
            Are you sure you want to delete this purchase from <strong>{deleteTarget?.vendorName}</strong>
            {deleteTarget?.invoiceNumber ? ` (Invoice: ${deleteTarget.invoiceNumber})` : ""}?
            This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleteSaving}>Cancel</Button>
            <Button onClick={handleDelete} disabled={deleteSaving} className="bg-red-600 hover:bg-red-700 text-white">
              {deleteSaving ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export default function Vendors() {
  const { toast } = useToast();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const LIMIT = 20;
  const totalPages = Math.ceil(total / LIMIT);

  // Filters
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sort, setSort] = useState("createdAt_desc");
  const [layout, setLayout] = useState<"grid" | "list">("grid");

  // Modals & Views
  const [addOpen, setAddOpen] = useState(false);
  const [editVendor, setEditVendor] = useState<Vendor | null>(null);
  const [viewVendor, setViewVendor] = useState<Vendor | null>(null);
  const [purchaseVendor, setPurchaseVendor] = useState<Vendor | null>(null);
  const [deleteVendor, setDeleteVendor] = useState<Vendor | null>(null);
  const [historyTarget, setHistoryTarget] = useState<{ vendorId?: string; vendorName?: string } | null>(null);

  const loadVendors = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(LIMIT),
        sort,
        ...(search ? { search } : {}),
        ...(categoryFilter !== "all" ? { category: categoryFilter } : {}),
        ...(statusFilter !== "all" ? { status: statusFilter } : {}),
      });
      const data = await apiFetch(`/api/vendors?${params}`);
      setVendors(data.vendors);
      setTotal(data.total);
    } catch (err: any) {
      toast({ title: "Failed to load vendors", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [page, sort, search, categoryFilter, statusFilter]);

  useEffect(() => { loadVendors(); }, [loadVendors]);

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const handleSaveVendor = async (data: any) => {
    if (editVendor) {
      await apiFetch(`/api/vendors/${editVendor.id}`, { method: "PUT", body: JSON.stringify(data) });
      toast({ title: "Vendor updated!" });
    } else {
      await apiFetch(`/api/vendors`, { method: "POST", body: JSON.stringify(data) });
      toast({ title: "Vendor added!" });
    }
    loadVendors();
    setEditVendor(null);
  };

  const handleDelete = async () => {
    if (!deleteVendor) return;
    await apiFetch(`/api/vendors/${deleteVendor.id}`, { method: "DELETE" });
    toast({ title: "Vendor deleted" });
    setDeleteVendor(null);
    loadVendors();
  };

  const handlePurchaseSaved = () => {
    loadVendors();
    if (viewVendor) setViewVendor(vendors.find(v => v.id === viewVendor.id) || viewVendor);
  };

  if (historyTarget !== null) {
    return (
      <AllTransactionsPage
        onBack={() => setHistoryTarget(null)}
        initialVendorId={historyTarget.vendorId}
        initialVendorName={historyTarget.vendorName}
      />
    );
  }

  if (purchaseVendor) {
    return (
      <AddPurchasePage
        vendor={purchaseVendor}
        onBack={() => setPurchaseVendor(null)}
        onSaved={handlePurchaseSaved}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#162B4D]">Vendors</h1>
          <p className="text-sm text-gray-400 mt-0.5">Manage your suppliers and track purchases</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-1.5 border-[#162B4D]/20 text-[#162B4D] hover:bg-[#162B4D]/5" onClick={() => setHistoryTarget({})}>
            <FileText className="w-4 h-4" /> Transaction History
          </Button>
          <Button className="bg-[#162B4D] hover:bg-[#1e3a6e] text-white gap-1.5" onClick={() => setAddOpen(true)}>
            <Plus className="w-4 h-4" /> Add Vendor
          </Button>
        </div>
      </div>

      {/* Stats Bar */}
      {!loading && total > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white border border-gray-100 rounded-xl p-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center">
              <Building2 className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-gray-400">Total Vendors</p>
              <p className="text-lg font-bold text-[#162B4D]">{total}</p>
            </div>
          </div>
          <div className="bg-white border border-gray-100 rounded-xl p-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-green-50 flex items-center justify-center">
              <Check className="w-4 h-4 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-gray-400">Active</p>
              <p className="text-lg font-bold text-[#162B4D]">{vendors.filter(v => v.status === "active").length}</p>
            </div>
          </div>
          <div className="bg-white border border-gray-100 rounded-xl p-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-amber-50 flex items-center justify-center">
              <IndianRupee className="w-4 h-4 text-amber-600" />
            </div>
            <div>
              <p className="text-xs text-gray-400">Total Spent</p>
              <p className="text-lg font-bold text-[#162B4D]">{formatRupees(vendors.reduce((s, v) => s + v.totalSpent, 0))}</p>
            </div>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="bg-white border border-gray-100 rounded-xl p-3 flex flex-wrap items-center gap-2 shadow-sm">
        {/* Search */}
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
          <Input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Search vendors..."
            className="pl-9 h-8 text-sm"
          />
          {searchInput && (
            <button onClick={() => { setSearchInput(""); setSearch(""); }} className="absolute right-2 top-1/2 -translate-y-1/2">
              <X className="w-3.5 h-3.5 text-gray-300 hover:text-gray-500" />
            </button>
          )}
        </div>

        {/* Category Filter */}
        <Select value={categoryFilter} onValueChange={v => { setCategoryFilter(v); setPage(1); }}>
          <SelectTrigger className="h-8 text-sm w-[130px] gap-1">
            <Tag className="w-3 h-3 text-gray-400" />
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>

        {/* Status Filter */}
        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="h-8 text-sm w-[110px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>

        {/* Sort */}
        <Select value={sort} onValueChange={v => { setSort(v); setPage(1); }}>
          <SelectTrigger className="h-8 text-sm w-[150px] gap-1">
            <ArrowUpDown className="w-3 h-3 text-gray-400" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="createdAt_desc">Newest First</SelectItem>
            <SelectItem value="createdAt_asc">Oldest First</SelectItem>
            <SelectItem value="name_asc">Name A-Z</SelectItem>
            <SelectItem value="name_desc">Name Z-A</SelectItem>
            <SelectItem value="totalSpent_desc">Highest Spent</SelectItem>
            <SelectItem value="totalPurchases_desc">Most Purchases</SelectItem>
          </SelectContent>
        </Select>

        {/* Refresh */}
        <Button size="sm" variant="ghost" onClick={loadVendors} className="h-8 w-8 p-0">
          <RefreshCw className={`w-4 h-4 text-gray-400 ${loading ? "animate-spin" : ""}`} />
        </Button>

        {/* Layout Toggle */}
        <div className="flex items-center bg-gray-100 rounded-lg p-0.5 gap-0.5">
          <button
            onClick={() => setLayout("grid")}
            className={`p-1.5 rounded-md transition-colors ${layout === "grid" ? "bg-white shadow-sm text-[#162B4D]" : "text-gray-400 hover:text-gray-600"}`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setLayout("list")}
            className={`p-1.5 rounded-md transition-colors ${layout === "list" ? "bg-white shadow-sm text-[#162B4D]" : "text-gray-400 hover:text-gray-600"}`}
          >
            <List className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Results Info */}
      {!loading && (
        <div className="flex items-center justify-between text-xs text-gray-400 -mt-2">
          <span>{total} vendor{total !== 1 ? "s" : ""} found</span>
          {(search || categoryFilter !== "all" || statusFilter !== "all") && (
            <button
              onClick={() => { setSearchInput(""); setSearch(""); setCategoryFilter("all"); setStatusFilter("all"); setPage(1); }}
              className="text-[#162B4D] font-medium hover:underline flex items-center gap-1"
            >
              <X className="w-3 h-3" /> Clear filters
            </button>
          )}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className={layout === "grid" ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" : "space-y-2"}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-100 h-48 animate-pulse" />
          ))}
        </div>
      ) : vendors.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-xl border border-gray-100">
          <Building2 className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No vendors found</p>
          <p className="text-gray-400 text-sm mt-1">
            {search || categoryFilter !== "all" || statusFilter !== "all"
              ? "Try adjusting your filters"
              : "Add your first vendor to get started"}
          </p>
          {!search && categoryFilter === "all" && statusFilter === "all" && (
            <Button className="mt-4 bg-[#162B4D] hover:bg-[#1e3a6e] text-white gap-1.5" onClick={() => setAddOpen(true)}>
              <Plus className="w-4 h-4" /> Add Vendor
            </Button>
          )}
        </div>
      ) : layout === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {vendors.map(v => (
            <VendorCard
              key={v.id}
              vendor={v}
              onEdit={setEditVendor}
              onDelete={setDeleteVendor}
              onView={setViewVendor}
              onAddPurchase={vendor => { setPurchaseVendor(vendor); }}
              onViewHistory={vendor => setHistoryTarget({ vendorId: vendor.id, vendorName: vendor.name })}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {vendors.map(v => (
            <VendorRow
              key={v.id}
              vendor={v}
              onEdit={setEditVendor}
              onDelete={setDeleteVendor}
              onView={setViewVendor}
              onAddPurchase={vendor => { setPurchaseVendor(vendor); }}
              onViewHistory={vendor => setHistoryTarget({ vendorId: vendor.id, vendorName: vendor.name })}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="h-8">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
            .reduce<(number | "...")[]>((acc, p, idx, arr) => {
              if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("...");
              acc.push(p);
              return acc;
            }, [])
            .map((p, i) =>
              p === "..." ? (
                <span key={`ellipsis-${i}`} className="text-gray-400 text-sm px-1">...</span>
              ) : (
                <Button
                  key={p}
                  variant={page === p ? "default" : "outline"}
                  size="sm"
                  onClick={() => setPage(p as number)}
                  className={`h-8 w-8 p-0 ${page === p ? "bg-[#162B4D] text-white" : ""}`}
                >
                  {p}
                </Button>
              )
            )}
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="h-8">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Modals */}
      <VendorFormModal
        open={addOpen || !!editVendor}
        onClose={() => { setAddOpen(false); setEditVendor(null); }}
        onSave={handleSaveVendor}
        initial={editVendor}
      />

      <VendorDetailModal
        open={!!viewVendor}
        onClose={() => setViewVendor(null)}
        vendor={viewVendor}
        onAddPurchase={() => { setPurchaseVendor(viewVendor); setViewVendor(null); }}
      />

      <DeleteModal
        open={!!deleteVendor}
        onClose={() => setDeleteVendor(null)}
        vendor={deleteVendor}
        onConfirm={handleDelete}
      />
    </div>
  );
}

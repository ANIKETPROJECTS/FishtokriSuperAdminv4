import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import {
  Search, Eye, Edit2, Trash2, Download, MoreVertical, ChevronLeft, ChevronRight,
  Plus, Filter, RefreshCw, AlertTriangle, ArrowUpDown, FileText, Hash,
  Printer, Mail, MessageCircle, Copy, Receipt,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiFetch, formatRupees, formatDateDDMMYYYY } from "@/lib/api";
import { printHtmlWithQZ } from "@/lib/qz-print";

interface Invoice {
  id: string;
  invoiceNumber: string;
  purchaseDate: string;
  vendorId: string;
  vendorName: string;
  vendorPhone?: string;
  totalAmount: number;
  status?: "draft" | "saved";
  notes?: string;
  items: any[];
  createdByName?: string;
}

const STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "saved", label: "Sent" },
  { value: "draft", label: "Draft" },
];

function StatusBadge({ status }: { status?: string }) {
  const s = (status || "saved").toLowerCase();
  if (s === "draft") {
    return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-100 text-amber-700 border border-amber-200">Draft</span>;
  }
  if (s === "cancelled") {
    return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-100 text-rose-700 border border-rose-200">Cancelled</span>;
  }
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-100 text-emerald-700 border border-emerald-200">Sent</span>;
}

export default function VendorInvoices() {
  const { toast } = useToast();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const LIMIT = 20;

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sort, setSort] = useState("date_desc");
  const [showFilters, setShowFilters] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [viewTarget, setViewTarget] = useState<Invoice | null>(null);
  const [editTarget, setEditTarget] = useState<Invoice | null>(null);
  const [editForm, setEditForm] = useState({ invoiceNumber: "", purchaseDate: "", notes: "" });
  const [editSaving, setEditSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Invoice | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [receiptTarget, setReceiptTarget] = useState<Invoice | null>(null);

  const [tab, setTab] = useState<"invoices" | "receipts">("invoices");
  const [receipts, setReceipts] = useState<any[]>([]);
  const [loadingReceipts, setLoadingReceipts] = useState(false);
  const [deletingReceiptId, setDeletingReceiptId] = useState<string | null>(null);

  const loadReceipts = useCallback(async () => {
    setLoadingReceipts(true);
    try {
      const params = new URLSearchParams({ page: "1", limit: "100" });
      if (search) params.set("search", search);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      const data = await apiFetch(`/api/vendors/receipts?${params}`);
      setReceipts(data.receipts || []);
    } catch (e: any) {
      toast({ title: "Failed to load receipts", description: e.message, variant: "destructive" });
      setReceipts([]);
    } finally { setLoadingReceipts(false); }
  }, [search, dateFrom, dateTo]);

  useEffect(() => { if (tab === "receipts") loadReceipts(); }, [tab, loadReceipts]);

  const handleDeleteReceipt = async (id: string) => {
    if (!window.confirm("Delete this payment?")) return;
    setDeletingReceiptId(id);
    try {
      await apiFetch(`/api/vendors/receipts/${id}`, { method: "DELETE" });
      toast({ title: "Payment deleted" });
      loadReceipts();
    } catch (e: any) {
      toast({ title: "Delete failed", description: e.message, variant: "destructive" });
    } finally { setDeletingReceiptId(null); }
  };

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(LIMIT), sort });
      if (search) params.set("search", search);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      const data = await apiFetch(`/api/vendors/all-purchases?${params}`);
      let list: Invoice[] = data.purchases || [];
      // status filter is client-side because the backend list doesn't filter by status yet
      if (statusFilter !== "all") {
        list = list.filter(i => (i.status || "saved") === statusFilter);
      }
      setInvoices(list);
      setTotal(statusFilter === "all" ? data.total : list.length);
    } catch (e: any) {
      toast({ title: "Failed to load invoices", description: e.message, variant: "destructive" });
      setInvoices([]); setTotal(0);
    } finally { setLoading(false); }
  }, [page, sort, search, dateFrom, dateTo, statusFilter]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    setSelected(prev => prev.size === invoices.length ? new Set() : new Set(invoices.map(i => i.id)));
  };

  const openEdit = (inv: Invoice) => {
    setEditTarget(inv);
    const d = inv.purchaseDate ? new Date(inv.purchaseDate).toISOString().slice(0, 10) : "";
    setEditForm({ invoiceNumber: inv.invoiceNumber || "", purchaseDate: d, notes: inv.notes || "" });
  };

  const handleEditSave = async () => {
    if (!editTarget) return;
    setEditSaving(true);
    try {
      await apiFetch(`/api/vendors/purchases/${editTarget.id}`, {
        method: "PUT",
        body: JSON.stringify(editForm),
      });
      toast({ title: "Invoice updated" });
      setEditTarget(null);
      load();
    } catch (e: any) {
      toast({ title: "Update failed", description: e.message, variant: "destructive" });
    } finally { setEditSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteSaving(true);
    try {
      await apiFetch(`/api/vendors/purchases/${deleteTarget.id}`, { method: "DELETE" });
      toast({ title: "Invoice deleted" });
      setDeleteTarget(null);
      load();
    } catch (e: any) {
      toast({ title: "Delete failed", description: e.message, variant: "destructive" });
    } finally { setDeleteSaving(false); }
  };

  const buildShareText = (inv: Invoice) => {
    const items = inv.items || [];
    const totalQty = items.reduce((s: number, it: any) => s + Number(it.quantity || 0), 0);
    const lines: string[] = [];
    lines.push(`*Fishtokri - Invoice ${inv.invoiceNumber || ""}*`);
    lines.push(`Date: ${formatDateDDMMYYYY(inv.purchaseDate)}`);
    lines.push(`Vendor: ${inv.vendorName || "—"}`);
    lines.push(`Status: ${(inv.status || "saved") === "draft" ? "Draft" : "Sent"}`);
    lines.push("");
    lines.push("Items:");
    items.forEach((it: any, i: number) => {
      lines.push(`${i + 1}. ${it.productName} - ${it.quantity} ${it.unit || ""} x ${formatRupees(it.pricePerUnit)} = ${formatRupees(it.totalPrice)}`);
    });
    lines.push("");
    lines.push(`Total Items: ${items.length}  Qty: ${totalQty}`);
    lines.push(`Grand Total: ${formatRupees(inv.totalAmount)}`);
    if (inv.notes) { lines.push(""); lines.push(`Note: ${inv.notes}`); }
    return lines.join("\n");
  };

  const shareWhatsApp = (inv: Invoice) => {
    const text = encodeURIComponent(buildShareText(inv));
    window.open(`https://web.whatsapp.com/send?text=${text}`, "_blank", "noopener,noreferrer");
  };

  const shareMail = (inv: Invoice) => {
    const subject = encodeURIComponent(`Invoice ${inv.invoiceNumber || ""} - Fishtokri`);
    const body = encodeURIComponent(buildShareText(inv));
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&su=${subject}&body=${body}`;
    window.open(gmailUrl, "_blank", "noopener,noreferrer");
  };

  const copyVoucher = async (inv: Invoice) => {
    try {
      await navigator.clipboard.writeText(buildShareText(inv));
      toast({ title: "Voucher copied to clipboard" });
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  const printInvoice = async (inv: Invoice) => {
    const html = renderVoucherHTML(inv);

    toast({ title: "Printing..." });
    const result = await printHtmlWithQZ(html);
    if (result.success) return;

    // QZ Tray unavailable — fall back to browser print dialog
    toast({ title: "Print failed, opening dialog...", variant: "destructive" });
    const w = window.open("", "_blank", "width=800,height=900");
    if (!w) { toast({ title: "Allow pop-ups to print", variant: "destructive" }); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); }, 250);
  };

  const downloadInvoice = async (inv: Invoice) => {
    try {
      const { jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;
      const doc = new jsPDF({ unit: "mm", format: "a5" });
      const items = inv.items || [];
      const totalQty = items.reduce((s: number, it: any) => s + Number(it.quantity || 0), 0);
      const subTotal = items.reduce((s: number, it: any) => s + Number(it.totalPrice || 0), 0);
      const grandTotal = Number(inv.totalAmount || subTotal);
      const dateObj = inv.purchaseDate ? new Date(inv.purchaseDate) : null;
      const timeStr = dateObj ? dateObj.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }) : "";

      let y = 10;
      doc.setFont("helvetica", "bold").setFontSize(13);
      doc.text("Fishtokri- Atha Foods Private Limited", 74, y, { align: "center" }); y += 5;
      doc.setLineDashPattern([0.5, 0.5], 0).line(8, y, 140, y); y += 4;
      doc.setFont("helvetica", "normal").setFontSize(9);
      doc.text("Mobile No: 9220200100", 74, y, { align: "center" }); y += 5;
      doc.setFontSize(10);
      doc.text(`Invoice No: ${inv.invoiceNumber || "-"}`, 8, y);
      doc.text(`Date: ${formatDateDDMMYYYY(inv.purchaseDate)}`, 140, y, { align: "right" }); y += 5;
      doc.text(`Payment Mode: ${(inv.status || "saved") === "draft" ? "Due" : "Paid"}`, 8, y);
      doc.text(`Time: ${timeStr || "-"}`, 140, y, { align: "right" }); y += 4;
      doc.line(8, y, 140, y); y += 4;
      doc.setFont("helvetica", "bold").text("Name: ", 8, y);
      doc.setFont("helvetica", "normal").text(inv.vendorName || "-", 22, y); y += 5;
      doc.setFont("helvetica", "bold").text("Add : ", 8, y);
      doc.setFont("helvetica", "normal").text("India", 22, y); y += 4;

      autoTable(doc, {
        startY: y,
        margin: { left: 8, right: 8 },
        head: [["Item", "Qty", "Rate", "Amount"]],
        body: items.map((it: any) => [
          String(it.productName || ""),
          `${it.quantity} ${it.unit || ""}`,
          Number(it.pricePerUnit || 0).toFixed(2),
          Number(it.totalPrice || 0).toFixed(2),
        ]),
        foot: [
          [`Total Items: ${items.length}`, String(totalQty), "", subTotal.toFixed(2)],
          ["Discount :", "", "", "- 0.00"],
        ],
        styles: { fontSize: 9, cellPadding: 1.5 },
        headStyles: { fillColor: [22, 43, 77], textColor: 255 },
        footStyles: { fillColor: [240, 240, 240], textColor: 20, fontStyle: "bold" },
        columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" } },
        theme: "grid",
      });

      y = (doc as any).lastAutoTable.finalY + 4;
      doc.setLineDashPattern([0.5, 0.5], 0).line(8, y, 140, y); y += 5;
      doc.setFont("helvetica", "bold").setFontSize(12);
      doc.text("Grand Total:", 8, y);
      doc.text(grandTotal.toFixed(2), 140, y, { align: "right" }); y += 5;
      doc.setFont("helvetica", "italic").setFontSize(9);
      doc.text(`( ${numberToWordsINR(grandTotal)} )`, 74, y, { align: "center", maxWidth: 130 }); y += 6;
      if (inv.notes) {
        doc.setFont("helvetica", "bold").setFontSize(9).text("Note: ", 8, y);
        doc.setFont("helvetica", "normal").text(String(inv.notes), 22, y, { maxWidth: 118 }); y += 6;
      }
      doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(80);
      doc.text("Thank you for your business! We appreciate your prompt payment.", 74, y, { align: "center" }); y += 4;
      doc.text("Please feel free to contact us if you have any questions regarding this invoice.", 74, y, { align: "center" });

      doc.save(`invoice-${inv.invoiceNumber || inv.id}.pdf`);
    } catch (e: any) {
      toast({ title: "PDF download failed", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#162B4D] text-white flex items-center justify-center">
            <FileText className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[#162B4D]">Vendor Invoices</h1>
            <p className="text-xs text-gray-500">{total} invoice{total !== 1 ? "s" : ""}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => tab === "invoices" ? load() : loadReceipts()} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500" title="Refresh">
            <RefreshCw className="w-4 h-4" />
          </button>
          <Link href="/vendors">
            <Button className="h-9 bg-[#1A56DB] hover:bg-[#1e40af] text-white gap-1.5">
              <Plus className="w-4 h-4" /> Add Invoice
            </Button>
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-gray-200">
        {([
          { key: "invoices", label: "Invoices" },
          { key: "receipts", label: "Payments" },
        ] as const).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.key
                ? "border-[#1A56DB] text-[#1A56DB]"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}{t.key === "receipts" && receipts.length > 0 ? ` (${receipts.length})` : ""}
          </button>
        ))}
      </div>

      {tab === "receipts" ? (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr className="text-gray-500 text-[11px] uppercase tracking-wider">
                  <th className="px-3 py-3 text-left">Date</th>
                  <th className="px-3 py-3 text-left">Vendor</th>
                  <th className="px-3 py-3 text-left">Invoice No.</th>
                  <th className="px-3 py-3 text-left">Mode</th>
                  <th className="px-3 py-3 text-left">Deposit To</th>
                  <th className="px-3 py-3 text-left">Reference</th>
                  <th className="px-3 py-3 text-right">Amount</th>
                  <th className="px-3 py-3 text-right w-20">Action</th>
                </tr>
              </thead>
              <tbody>
                {loadingReceipts ? (
                  <tr><td colSpan={8} className="px-3 py-10 text-center text-sm text-gray-400">Loading payments…</td></tr>
                ) : receipts.length === 0 ? (
                  <tr><td colSpan={8} className="px-3 py-10 text-center text-sm text-gray-400">No payments yet. Create one from any invoice's actions menu.</td></tr>
                ) : receipts.map(r => (
                  <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-3 py-2.5 text-gray-700 whitespace-nowrap">{formatDateDDMMYYYY(r.date)}</td>
                    <td className="px-3 py-2.5 text-[#162B4D] font-medium">{r.vendorName || "—"}</td>
                    <td className="px-3 py-2.5 text-gray-700">{r.invoiceNumber || "—"}</td>
                    <td className="px-3 py-2.5"><span className="text-[11px] font-semibold bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{r.paymentMode || "—"}</span></td>
                    <td className="px-3 py-2.5 text-gray-600">{r.depositTo || "—"}</td>
                    <td className="px-3 py-2.5 text-gray-600">{r.reference || "—"}</td>
                    <td className="px-3 py-2.5 text-right font-semibold text-green-700">{formatRupees(r.amount)}</td>
                    <td className="px-3 py-2.5 text-right">
                      <button
                        onClick={() => handleDeleteReceipt(r.id)}
                        disabled={deletingReceiptId === r.id}
                        className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600 disabled:opacity-50"
                        title="Delete payment"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              {receipts.length > 0 && (
                <tfoot>
                  <tr className="border-t border-gray-200 bg-gray-50 font-semibold text-[#162B4D]">
                    <td colSpan={6} className="px-3 py-2.5 text-right">Total</td>
                    <td className="px-3 py-2.5 text-right text-green-700">
                      {formatRupees(receipts.reduce((s, r) => s + Number(r.amount || 0), 0))}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      ) : (
      <>
      {/* Toolbar */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-3 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="Search by vendor or invoice no."
              className="w-full h-9 pl-9 pr-3 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-[#162B4D]/20 focus:border-[#162B4D]/40 focus:bg-white"
            />
          </div>
          <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
            <SelectTrigger className="h-9 text-sm w-[110px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={v => { setSort(v); setPage(1); }}>
            <SelectTrigger className="h-9 text-sm w-[150px] gap-1">
              <ArrowUpDown className="w-3 h-3 text-gray-400" /><SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="date_desc">Newest First</SelectItem>
              <SelectItem value="date_asc">Oldest First</SelectItem>
              <SelectItem value="amount_desc">Highest Amount</SelectItem>
              <SelectItem value="amount_asc">Lowest Amount</SelectItem>
              <SelectItem value="vendor_asc">Vendor A–Z</SelectItem>
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant={showFilters ? "default" : "outline"}
            className={`h-9 px-3 gap-1.5 ${showFilters ? "bg-[#162B4D] text-white" : "text-gray-600"}`}
            onClick={() => setShowFilters(s => !s)}
          >
            <Filter className="w-3.5 h-3.5" /> More Options
          </Button>
        </div>
        {showFilters && (
          <div className="border-t border-gray-100 pt-3 flex items-end gap-3 flex-wrap">
            <div>
              <label className="text-xs text-gray-500 font-medium block mb-1">From date</label>
              <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }} className="h-9 px-2 rounded-lg border border-gray-200 text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium block mb-1">To date</label>
              <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }} className="h-9 px-2 rounded-lg border border-gray-200 text-sm" />
            </div>
            {(dateFrom || dateTo) && (
              <Button size="sm" variant="ghost" className="h-9 text-xs text-gray-500" onClick={() => { setDateFrom(""); setDateTo(""); }}>
                Clear dates
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr className="text-gray-500 text-[11px] uppercase tracking-wider">
                <th className="px-3 py-3 text-left w-9">
                  <input type="checkbox"
                    checked={invoices.length > 0 && selected.size === invoices.length}
                    onChange={toggleSelectAll}
                    className="rounded border-gray-300" />
                </th>
                <th className="px-3 py-3 text-left font-semibold">Date</th>
                <th className="px-3 py-3 text-left font-semibold">Invoice No.</th>
                <th className="px-3 py-3 text-left font-semibold">Party Name</th>
                <th className="px-3 py-3 text-left font-semibold">Status</th>
                <th className="px-3 py-3 text-right font-semibold">Amount</th>
                <th className="px-3 py-3 text-right font-semibold">Due Amount</th>
                <th className="px-3 py-3 text-center font-semibold w-44">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td colSpan={8} className="px-3 py-4">
                      <div className="h-6 bg-gray-100 rounded animate-pulse" />
                    </td>
                  </tr>
                ))
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-16 text-center">
                    <FileText className="w-10 h-10 text-gray-200 mx-auto mb-2" />
                    <p className="text-gray-500 font-medium">No invoices found</p>
                    <p className="text-gray-400 text-xs mt-1">Drafts and saved invoices will appear here</p>
                  </td>
                </tr>
              ) : invoices.map(inv => (
                <tr key={inv.id} className="border-b border-gray-100 hover:bg-gray-50/60 transition-colors">
                  <td className="px-3 py-3">
                    <input type="checkbox" checked={selected.has(inv.id)} onChange={() => toggleSelect(inv.id)} className="rounded border-gray-300" />
                  </td>
                  <td className="px-3 py-3 text-gray-700">{formatDateDDMMYYYY(inv.purchaseDate)}</td>
                  <td className="px-3 py-3">
                    <span className="inline-flex items-center gap-1 font-medium text-[#162B4D]">
                      <Hash className="w-3 h-3 text-gray-400" />
                      {inv.invoiceNumber || "—"}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-gray-700">{inv.vendorName || "—"}</td>
                  <td className="px-3 py-3"><StatusBadge status={inv.status} /></td>
                  <td className="px-3 py-3 text-right font-semibold text-gray-800">{formatRupees(inv.totalAmount)}</td>
                  <td className="px-3 py-3 text-right text-gray-500">{formatRupees(0)}</td>
                  <td className="px-3 py-3">
                    <div className="flex items-center justify-center gap-0.5">
                      <button title="Edit" onClick={() => openEdit(inv)} className="p-1.5 rounded hover:bg-amber-50 text-amber-600">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button title="View" onClick={() => setViewTarget(inv)} className="p-1.5 rounded hover:bg-blue-50 text-blue-600">
                        <Eye className="w-4 h-4" />
                      </button>
                      <button title="Share on WhatsApp" onClick={() => shareWhatsApp(inv)} className="p-1.5 rounded hover:bg-emerald-50 text-emerald-600">
                        <MessageCircle className="w-4 h-4" />
                      </button>
                      <button title="Download PDF" onClick={() => downloadInvoice(inv)} className="p-1.5 rounded hover:bg-emerald-50 text-emerald-600">
                        <Download className="w-4 h-4" />
                      </button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button title="More" className="p-1.5 rounded hover:bg-gray-100 text-gray-500">
                            <MoreVertical className="w-4 h-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem onClick={() => copyVoucher(inv)}>
                            <Copy className="w-4 h-4 mr-2 text-gray-500" /> Copy Voucher
                          </DropdownMenuItem>
                          {(inv.status || "saved") !== "draft" && (
                            <DropdownMenuItem onClick={() => setReceiptTarget(inv)}>
                              <Receipt className="w-4 h-4 mr-2 text-violet-600" /> Create Payment
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => shareMail(inv)}>
                            <Mail className="w-4 h-4 mr-2 text-sky-600" /> Share on Mail
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => printInvoice(inv)}>
                            <Printer className="w-4 h-4 mr-2 text-gray-600" /> Print Voucher
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => setDeleteTarget(inv)} className="text-red-600 focus:text-red-700">
                            <Trash2 className="w-4 h-4 mr-2" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-t border-gray-200 text-xs text-gray-500">
          <div>Showing {invoices.length === 0 ? 0 : (page - 1) * LIMIT + 1}–{(page - 1) * LIMIT + invoices.length} of {total} Results</div>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={page === 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
              <ChevronLeft className="w-3.5 h-3.5" />
            </Button>
            {Array.from({ length: Math.min(5, totalPages) }).map((_, i) => {
              const p = i + 1;
              return (
                <button key={p}
                  onClick={() => setPage(p)}
                  className={`w-7 h-7 text-xs rounded ${p === page ? "bg-[#1A56DB] text-white" : "text-gray-600 hover:bg-gray-200"}`}>{p}</button>
              );
            })}
            {totalPages > 5 && <span className="px-1">…</span>}
            <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>
      </>
      )}

      {/* Voucher Preview dialog */}
      <VoucherPreviewDialog invoice={viewTarget} onClose={() => setViewTarget(null)} />

      {/* Add Receipt dialog */}
      <AddReceiptDialog
        invoice={receiptTarget}
        onClose={() => setReceiptTarget(null)}
        onSaved={() => { setReceiptTarget(null); load(); loadReceipts(); setTab("receipts"); }}
      />

      {/* Edit dialog */}
      <Dialog open={!!editTarget} onOpenChange={open => !open && setEditTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Edit Invoice</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Invoice Number</Label>
              <Input value={editForm.invoiceNumber} onChange={e => setEditForm(f => ({ ...f, invoiceNumber: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Date</Label>
              <Input type="date" value={editForm.purchaseDate} onChange={e => setEditForm(f => ({ ...f, purchaseDate: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Notes</Label>
              <textarea rows={3} value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#162B4D]/20 resize-none" />
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

      {/* Delete confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5" /> Delete Invoice
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600 py-2">
            Delete invoice <strong>{deleteTarget?.invoiceNumber || ""}</strong> from <strong>{deleteTarget?.vendorName}</strong>? This cannot be undone.
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

// ---------------- Voucher Preview ----------------

function VoucherPreviewDialog({ invoice, onClose }: { invoice: Invoice | null; onClose: () => void }) {
  if (!invoice) return null;

  const items = invoice.items || [];
  const totalQty = items.reduce((s: number, it: any) => s + Number(it.quantity || 0), 0);
  const subTotal = items.reduce((s: number, it: any) => s + Number(it.totalPrice || 0), 0);
  const grandTotal = Number(invoice.totalAmount || subTotal);
  const dateObj = invoice.purchaseDate ? new Date(invoice.purchaseDate) : null;
  const timeStr = dateObj ? dateObj.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }) : "";

  return (
    <Dialog open={!!invoice} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-800">Voucher Preview</h2>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-5 bg-gray-50">
            <div className="bg-white max-w-md mx-auto p-5 text-[13px] text-gray-800 shadow-sm border border-gray-200 rounded">
              <h3 className="v-title text-center font-bold text-[15px] mb-1">Fishtokri- Atha Foods Private Limited</h3>
              <div className="v-sep border-t border-dashed border-gray-400 my-2" />
              <div className="text-center text-[12px]">Mobile No: 9220200100</div>
              <div className="v-row flex justify-between mt-2">
                <span><b>Invoice No:</b> {invoice.invoiceNumber || "—"}</span>
                <span><b>Date:</b> {formatDateDDMMYYYY(invoice.purchaseDate)}</span>
              </div>
              <div className="v-row flex justify-between">
                <span><b>Payment Mode:</b> {(invoice.status || "saved") === "draft" ? "Due" : "Paid"}</span>
                <span><b>Time:</b> {timeStr || "—"}</span>
              </div>
              <div className="v-sep border-t border-dashed border-gray-400 my-2" />
              <div><b>Name:</b> {invoice.vendorName || "—"}</div>
              <div><b>Add :</b> India</div>
              {invoice.createdByName && <div className="text-[12px] text-gray-500 mt-1">Created by: {invoice.createdByName}</div>}
              <div className="v-sep border-t border-dashed border-gray-400 my-2" />

              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-gray-700 text-left">
                    <th className="py-1">Item</th>
                    <th className="py-1 right text-right">Qty</th>
                    <th className="py-1 right text-right">Rate</th>
                    <th className="py-1 right text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it: any, i: number) => (
                    <tr key={i}>
                      <td className="py-1">{it.productName}</td>
                      <td className="py-1 right text-right">{it.quantity} {it.unit || ""}</td>
                      <td className="py-1 right text-right">{Number(it.pricePerUnit || 0).toFixed(2)}</td>
                      <td className="py-1 right text-right">{Number(it.totalPrice || 0).toFixed(2)}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-gray-400">
                    <td className="py-1"><b>Total Items: {items.length}</b></td>
                    <td className="py-1 right text-right"><b>{totalQty}</b></td>
                    <td></td>
                    <td className="py-1 right text-right"><b>{subTotal.toFixed(2)}</b></td>
                  </tr>
                  <tr>
                    <td className="py-1" colSpan={3}>Discount :</td>
                    <td className="py-1 right text-right">- 0.00</td>
                  </tr>
                </tbody>
              </table>

              <div className="v-sep border-t border-dashed border-gray-400 my-2" />
              <div className="v-row total flex justify-between text-[15px] font-bold">
                <span>Grand Total:</span>
                <span>{grandTotal.toFixed(2)}</span>
              </div>
              <div className="text-center text-[11px] text-gray-600 mt-1">( {numberToWordsINR(grandTotal)} )</div>

              {invoice.notes && (
                <>
                  <div className="v-sep border-t border-dashed border-gray-400 my-2" />
                  <div className="text-[12px]"><b>Note:</b> {invoice.notes}</div>
                </>
              )}

              <div className="footer text-center text-[12px] text-gray-600 mt-3">
                Thank you for your business!<br />
                We appreciate your prompt payment.<br />
                Please feel free to contact us if you have any questions<br />
                regarding this invoice.
              </div>
            </div>
        </div>

        <div className="flex justify-end px-5 py-3 border-t border-gray-200 bg-white">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------- Add Receipt ----------------

const PAYMENT_MODES = ["Cash", "UPI", "Bank Transfer", "Cheque", "Card", "Other"];

type BankAccount = {
  id: string;
  accountName: string;
  bankName: string;
};

function AddReceiptDialog({
  invoice, onClose, onSaved,
}: {
  invoice: Invoice | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [date, setDate] = useState("");
  const [depositTo, setDepositTo] = useState("");
  const [depositOptions, setDepositOptions] = useState<BankAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [receivedFrom, setReceivedFrom] = useState("");
  const [paymentMode, setPaymentMode] = useState("");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [remarks, setRemarks] = useState("");
  const [lumpSum, setLumpSum] = useState(false);
  const [markAllPaid, setMarkAllPaid] = useState(false);
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [vendorInvoices, setVendorInvoices] = useState<Invoice[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);

  const totalDue = useMemo(
    () => vendorInvoices.reduce((s, i) => s + Number(i.totalAmount || 0), 0),
    [vendorInvoices]
  );

  const totalAllocated = useMemo(
    () => Object.values(allocations).reduce((s, v) => s + (Number(v) || 0), 0),
    [allocations]
  );

  useEffect(() => {
    if (!invoice) return;
    setDate(new Date().toISOString().slice(0, 10));
    setReceivedFrom(invoice.vendorName || "");
    setAmount(String(invoice.totalAmount || ""));
    setPaymentMode("");
    setReference(""); setRemarks("");
    setLumpSum(false); setMarkAllPaid(false);
    setDepositTo("");
    setAllocations({});
    setVendorInvoices([]);
    setLoadingInvoices(true);
    setLoadingAccounts(true);

    (async () => {
      try {
        const accounts: BankAccount[] = await apiFetch(`/api/banking/accounts`);
        setDepositOptions(accounts);
        if (accounts.length > 0) setDepositTo(accounts[0].accountName);
      } catch (e: any) {
        toast({ title: "Failed to load bank accounts", description: e.message, variant: "destructive" });
      } finally {
        setLoadingAccounts(false);
      }
    })();

    (async () => {
      try {
        const params = new URLSearchParams({
          vendorId: invoice.vendorId,
          page: "1",
          limit: "100",
          sort: "date_asc",
        });
        const data = await apiFetch(`/api/vendors/all-purchases?${params}`);
        const list: Invoice[] = (data.purchases || []).filter(
          (i: Invoice) => (i.status || "saved") !== "draft"
        );
        setVendorInvoices(list);
        const initAlloc: Record<string, string> = {};
        list.forEach(i => { initAlloc[i.id] = i.id === invoice.id ? String(i.totalAmount || 0) : "0"; });
        setAllocations(initAlloc);
      } catch (e: any) {
        toast({ title: "Failed to load vendor invoices", description: e.message, variant: "destructive" });
      } finally {
        setLoadingInvoices(false);
      }
    })();
  }, [invoice]);

  useEffect(() => {
    if (markAllPaid) {
      const next: Record<string, string> = {};
      vendorInvoices.forEach(i => { next[i.id] = String(i.totalAmount || 0); });
      setAllocations(next);
      setAmount(String(totalDue));
    }
  }, [markAllPaid]);

  if (!invoice) return null;

  const handleSave = async () => {
    if (!paymentMode) { toast({ title: "Choose payment mode", variant: "destructive" }); return; }
    if (!Number(amount)) { toast({ title: "Enter amount", variant: "destructive" }); return; }
    setSaving(true);
    try {
      await apiFetch(`/api/vendors/purchases/${invoice.id}/receipts`, {
        method: "POST",
        body: JSON.stringify({
          date, depositTo, receivedFrom, paymentMode,
          amount: Number(amount), reference, remarks,
          lumpSum, markAllPaid,
          allocations: Object.entries(allocations)
            .filter(([, v]) => Number(v) > 0)
            .map(([id, v]) => ({ invoiceId: id, amount: Number(v) || 0 })),
        }),
      });
      toast({ title: "Payment saved", description: `${formatRupees(Number(amount))} to ${receivedFrom}` });
      onSaved();
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={!!invoice} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-4xl p-0 gap-0 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-800">Add Payment</h2>
        </div>

        <div className="max-h-[75vh] overflow-y-auto p-5 space-y-4">
          {/* Top form */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs">Date</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Deposit To <span className="text-red-500">*</span></Label>
              <Select value={depositTo} onValueChange={setDepositTo} disabled={loadingAccounts || depositOptions.length === 0}>
                <SelectTrigger>
                  <SelectValue placeholder={
                    loadingAccounts
                      ? "Loading accounts..."
                      : depositOptions.length === 0
                        ? "No accounts — add one in Banking"
                        : "Choose Account"
                  } />
                </SelectTrigger>
                <SelectContent>
                  {depositOptions.map(a => (
                    <SelectItem key={a.id} value={a.accountName}>
                      {a.accountName}{a.bankName ? ` — ${a.bankName}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Received From <span className="text-red-500">*</span></Label>
              <Input value={receivedFrom} onChange={e => setReceivedFrom(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Payment Mode <span className="text-red-500">*</span></Label>
              <Select value={paymentMode} onValueChange={setPaymentMode}>
                <SelectTrigger><SelectValue placeholder="Choose Payment Mode" /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_MODES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs">Amount <span className="text-red-500">*</span></Label>
              <Input type="number" value={amount} onChange={e => setAmount(e.target.value)} />
              <p className="text-[11px] text-gray-500 mt-1">Total Due: <b>{formatRupees(totalDue)}</b></p>
            </div>
            <div>
              <Label className="text-xs">Reference No.</Label>
              <Input value={reference} onChange={e => setReference(e.target.value)} placeholder="Enter Reference No. Here" />
            </div>
            <div className="md:col-span-2">
              <Label className="text-xs">Remarks</Label>
              <Input value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Write your Remarks Here" />
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <button
              type="button"
              onClick={() => setLumpSum(s => !s)}
              className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg border ${lumpSum ? "bg-violet-50 border-violet-300 text-violet-700" : "bg-gray-50 border-gray-200 text-gray-600"}`}
            >
              <span className={`w-8 h-4 rounded-full relative transition-colors ${lumpSum ? "bg-violet-500" : "bg-gray-300"}`}>
                <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${lumpSum ? "left-4" : "left-0.5"}`} />
              </span>
              Received Lump Sum Amount
            </button>
            <button
              type="button"
              onClick={() => setMarkAllPaid(s => !s)}
              className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg border ${markAllPaid ? "bg-emerald-50 border-emerald-300 text-emerald-700" : "bg-gray-50 border-gray-200 text-gray-600"}`}
            >
              <span className={`w-8 h-4 rounded-full relative transition-colors ${markAllPaid ? "bg-emerald-500" : "bg-gray-300"}`}>
                <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${markAllPaid ? "left-4" : "left-0.5"}`} />
              </span>
              Mark all Paid ({formatRupees(totalDue)})
            </button>
          </div>

          {/* Allocations table */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Invoice No.</th>
                  <th className="px-3 py-2 text-right">Invoice Amount</th>
                  <th className="px-3 py-2 text-right">Due Amount</th>
                  <th className="px-3 py-2 text-right w-32">Amount</th>
                </tr>
              </thead>
              <tbody>
                {loadingInvoices ? (
                  <tr><td colSpan={5} className="py-6 text-center text-gray-400 text-sm">Loading vendor invoices…</td></tr>
                ) : vendorInvoices.length === 0 ? (
                  <tr><td colSpan={5} className="py-6 text-center text-gray-400 text-sm">No invoices for this vendor</td></tr>
                ) : vendorInvoices.map(i => (
                  <tr key={i.id} className="border-t border-gray-100">
                    <td className="px-3 py-2 text-gray-700">{formatDateDDMMYYYY(i.purchaseDate)}</td>
                    <td className="px-3 py-2 text-[#162B4D] font-medium">{i.invoiceNumber || "—"}</td>
                    <td className="px-3 py-2 text-right">{Number(i.totalAmount || 0).toFixed(2)}</td>
                    <td className="px-3 py-2 text-right">{Number(i.totalAmount || 0).toFixed(2)}</td>
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        value={allocations[i.id] ?? "0"}
                        onChange={e => setAllocations(a => ({ ...a, [i.id]: e.target.value }))}
                        className="h-8 text-right"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 border-t border-gray-200">
                  <td colSpan={4} className="px-3 py-2 text-right font-medium text-gray-700">Total Amount Received</td>
                  <td className="px-3 py-2 text-right font-bold text-[#162B4D]">{totalAllocated.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <DialogFooter className="px-5 py-3 border-t border-gray-200 bg-white">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-[#1A56DB] hover:bg-[#1e40af] text-white">
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function renderVoucherHTML(inv: Invoice): string {
  const items = inv.items || [];
  const totalQty = items.reduce((s: number, it: any) => s + Number(it.quantity || 0), 0);
  const subTotal = items.reduce((s: number, it: any) => s + Number(it.totalPrice || 0), 0);
  const grandTotal = Number(inv.totalAmount || subTotal);
  const dateObj = inv.purchaseDate ? new Date(inv.purchaseDate) : null;
  const timeStr = dateObj ? dateObj.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }) : "";
  const rowsHTML = items.map((it: any) => `
    <tr>
      <td>${escapeHtml(it.productName || "")}</td>
      <td class="right">${Number(it.quantity || 0)} ${escapeHtml(it.unit || "")}</td>
      <td class="right">${Number(it.pricePerUnit || 0).toFixed(2)}</td>
      <td class="right">${Number(it.totalPrice || 0).toFixed(2)}</td>
    </tr>`).join("");
  return `<!doctype html><html><head><title>Invoice ${escapeHtml(inv.invoiceNumber || "")}</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 24px; color: #111; max-width: 480px; margin: 0 auto; }
      h3 { text-align: center; margin: 0 0 4px; font-size: 16px; }
      .center { text-align: center; font-size: 12px; }
      .row { display: flex; justify-content: space-between; font-size: 13px; margin: 2px 0; }
      .sep { border-top: 1px dashed #999; margin: 8px 0; }
      table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 6px; }
      th, td { padding: 4px 6px; text-align: left; }
      th { border-bottom: 1px solid #333; }
      .right { text-align: right; }
      .total { font-weight: 700; font-size: 16px; display: flex; justify-content: space-between; }
      .footer { text-align:center; font-size: 12px; margin-top: 12px; color: #444; }
    </style></head><body>
    <h3>Fishtokri- Atha Foods Private Limited</h3>
    <div class="sep"></div>
    <div class="center">Mobile No: 9220200100</div>
    <div class="row"><span><b>Invoice No:</b> ${escapeHtml(inv.invoiceNumber || "—")}</span><span><b>Date:</b> ${escapeHtml(formatDateDDMMYYYY(inv.purchaseDate))}</span></div>
    <div class="row"><span><b>Payment Mode:</b> ${(inv.status || "saved") === "draft" ? "Due" : "Paid"}</span><span><b>Time:</b> ${escapeHtml(timeStr || "—")}</span></div>
    <div class="sep"></div>
    <div><b>Name:</b> ${escapeHtml(inv.vendorName || "—")}</div>
    <div><b>Add :</b> India</div>
    <div class="sep"></div>
    <table>
      <thead><tr><th>Item</th><th class="right">Qty</th><th class="right">Rate</th><th class="right">Amount</th></tr></thead>
      <tbody>${rowsHTML}
        <tr style="border-top:1px solid #555;"><td><b>Total Items: ${items.length}</b></td><td class="right"><b>${totalQty}</b></td><td></td><td class="right"><b>${subTotal.toFixed(2)}</b></td></tr>
        <tr><td colspan="3">Discount :</td><td class="right">- 0.00</td></tr>
      </tbody>
    </table>
    <div class="sep"></div>
    <div class="total"><span>Grand Total:</span><span>${grandTotal.toFixed(2)}</span></div>
    <div class="center" style="margin-top:4px;">( ${escapeHtml(numberToWordsINR(grandTotal))} )</div>
    ${inv.notes ? `<div class="sep"></div><div style="font-size:12px;"><b>Note:</b> ${escapeHtml(inv.notes)}</div>` : ""}
    <div class="footer">Thank you for your business!<br/>We appreciate your prompt payment.<br/>Please feel free to contact us if you have any questions<br/>regarding this invoice.</div>
    </body></html>`;
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

function numberToWordsINR(num: number): string {
  if (!isFinite(num)) return "";
  const n = Math.floor(num);
  const paise = Math.round((num - n) * 100);
  const words = inWords(n);
  let out = `${words} Rupees`;
  if (paise > 0) out += ` and ${inWords(paise)} Paise`;
  return out;
}

function inWords(num: number): string {
  const a = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
    "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  if (num === 0) return "Zero";
  const two = (n: number): string => n < 20 ? a[n] : `${b[Math.floor(n / 10)]}${n % 10 ? " " + a[n % 10] : ""}`;
  const three = (n: number): string => {
    const h = Math.floor(n / 100), r = n % 100;
    return `${h ? a[h] + " Hundred" + (r ? " " : "") : ""}${r ? two(r) : ""}`;
  };
  let result = "";
  const crore = Math.floor(num / 10000000); num %= 10000000;
  const lakh = Math.floor(num / 100000); num %= 100000;
  const thousand = Math.floor(num / 1000); num %= 1000;
  const rest = num;
  if (crore) result += two(crore) + " Crore ";
  if (lakh) result += two(lakh) + " Lakh ";
  if (thousand) result += two(thousand) + " Thousand ";
  if (rest) result += three(rest);
  return result.trim();
}

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Truck, Package, IndianRupee, Banknote, CreditCard, Wallet, RefreshCw, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

function getToken() {
  return localStorage.getItem("fishtokri_token") || "";
}

function getAdmin() {
  try {
    const raw = localStorage.getItem("fishtokri_admin");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function fetchDeliveryReport(from: string, to: string) {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const res = await fetch(`${BASE}/api/delivery-report?${params}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error("Failed to load report");
  return res.json();
}

function formatRupees(n: number) {
  return `₹${(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function formatDate(d: string | Date | undefined) {
  if (!d) return "-";
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function sevenDaysAgo() {
  const d = new Date();
  d.setDate(d.getDate() - 6);
  return d.toISOString().slice(0, 10);
}

const MODE_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  cash: { label: "Cash", color: "text-green-700 bg-green-50 border-green-200", icon: <Banknote className="w-3.5 h-3.5" /> },
  upi: { label: "UPI", color: "text-purple-700 bg-purple-50 border-purple-200", icon: <CreditCard className="w-3.5 h-3.5" /> },
  wallet: { label: "Wallet", color: "text-blue-700 bg-blue-50 border-blue-200", icon: <Wallet className="w-3.5 h-3.5" /> },
  card: { label: "Card", color: "text-orange-700 bg-orange-50 border-orange-200", icon: <CreditCard className="w-3.5 h-3.5" /> },
  bank: { label: "Bank", color: "text-sky-700 bg-sky-50 border-sky-200", icon: <IndianRupee className="w-3.5 h-3.5" /> },
  other: { label: "Other", color: "text-gray-700 bg-gray-50 border-gray-200", icon: <IndianRupee className="w-3.5 h-3.5" /> },
};

function modeMeta(mode: string) {
  return MODE_META[mode?.toLowerCase()] ?? { label: mode, color: "text-gray-700 bg-gray-50 border-gray-200", icon: <IndianRupee className="w-3.5 h-3.5" /> };
}

function ModeTag({ mode, amount }: { mode: string; amount: number }) {
  const m = modeMeta(mode);
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-xs font-medium ${m.color}`}>
      {m.icon}{m.label}: {formatRupees(amount)}
    </span>
  );
}

function ModeBadges({ byMode }: { byMode: Record<string, number> }) {
  const entries = Object.entries(byMode).filter(([, v]) => v > 0);
  if (!entries.length) return <span className="text-xs text-gray-400">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {entries.map(([mode, amount]) => (
        <ModeTag key={mode} mode={mode} amount={amount} />
      ))}
    </div>
  );
}

function SummaryCard({ label, value, sub, color }: { label: string; value: string; sub?: React.ReactNode; color: string }) {
  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-1 bg-white shadow-sm`}>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      {sub && <div className="mt-1">{sub}</div>}
    </div>
  );
}

function OrderRow({ order }: { order: any }) {
  const statusColor: Record<string, string> = {
    delivered: "bg-green-100 text-green-700",
    takeaway: "bg-blue-100 text-blue-700",
    cancelled: "bg-red-100 text-red-700",
  };
  const sc = statusColor[order.status] ?? "bg-gray-100 text-gray-600";
  return (
    <tr className="border-b border-gray-100 last:border-0 hover:bg-gray-50/60 transition-colors">
      <td className="py-2 px-3 text-xs font-mono text-gray-500">
        #{order.orderNumber ?? String(order.id).slice(-6).toUpperCase()}
      </td>
      <td className="py-2 px-3">
        <p className="text-sm font-medium text-gray-800">{order.customerName || "—"}</p>
        {order.phone && <p className="text-xs text-gray-400">{order.phone}</p>}
      </td>
      <td className="py-2 px-3 text-xs text-gray-500">{order.deliveryArea || order.subHubName || "—"}</td>
      <td className="py-2 px-3 text-xs text-gray-500">{formatDate(order.createdAt)}</td>
      <td className="py-2 px-3 text-right text-sm font-semibold text-gray-800">{formatRupees(order.total ?? 0)}</td>
      <td className="py-2 px-3">
        <div className="flex flex-wrap gap-1 justify-end">
          {Array.isArray(order.payments) && order.payments.map((p: any, i: number) => (
            <ModeTag key={i} mode={p.mode} amount={p.amount} />
          ))}
          {(!order.payments || order.payments.length === 0) && (
            <span className="text-xs text-gray-400">—</span>
          )}
        </div>
      </td>
      <td className="py-2 px-3 text-right">
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sc}`}>
          {order.status === "takeaway" ? "Takeaway" : order.paymentStatus ?? order.status}
        </span>
      </td>
    </tr>
  );
}

function PersonCard({ person, defaultOpen }: { person: any; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  const initials = person.personName.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <button
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50/60 transition-colors text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="w-9 h-9 rounded-full bg-brand-primary/10 flex items-center justify-center flex-shrink-0">
          <span className="text-xs font-bold text-brand-primary">{initials}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800 truncate">{person.personName}</p>
          <p className="text-xs text-gray-400">{person.orderCount} order{person.orderCount !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex items-center gap-3 mr-2">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-bold text-gray-800">{formatRupees(person.totalRevenue)}</p>
            <p className="text-xs text-gray-400">total collected</p>
          </div>
          <div className="hidden md:flex flex-wrap gap-1 max-w-xs">
            {Object.entries(person.byMode as Record<string, number>)
              .filter(([, v]) => v > 0)
              .map(([mode, amount]) => (
                <ModeTag key={mode} mode={mode} amount={amount} />
              ))}
          </div>
        </div>
        {open ? <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />}
      </button>

      {open && (
        <div className="border-t border-gray-100">
          {/* Mobile mode breakdown */}
          <div className="md:hidden px-4 py-2 bg-gray-50/60 flex flex-wrap gap-1 border-b border-gray-100">
            {Object.entries(person.byMode as Record<string, number>)
              .filter(([, v]) => v > 0)
              .map(([mode, amount]) => (
                <ModeTag key={mode} mode={mode} amount={amount} />
              ))}
            {Object.keys(person.byMode).length === 0 && <span className="text-xs text-gray-400">No payments recorded</span>}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="bg-gray-50/80 text-left">
                  <th className="py-2 px-3 text-xs font-semibold text-gray-500">Order #</th>
                  <th className="py-2 px-3 text-xs font-semibold text-gray-500">Customer</th>
                  <th className="py-2 px-3 text-xs font-semibold text-gray-500">Area</th>
                  <th className="py-2 px-3 text-xs font-semibold text-gray-500">Date</th>
                  <th className="py-2 px-3 text-xs font-semibold text-gray-500 text-right">Order Total</th>
                  <th className="py-2 px-3 text-xs font-semibold text-gray-500 text-right">Payments</th>
                  <th className="py-2 px-3 text-xs font-semibold text-gray-500 text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {person.orders.map((order: any) => (
                  <OrderRow key={order.id} order={order} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DeliveryReportPage() {
  const admin = getAdmin();
  const isDeliveryPerson = admin?.role === "delivery_person";

  const [from, setFrom] = useState(sevenDaysAgo());
  const [to, setTo] = useState(today());
  const [applied, setApplied] = useState({ from: sevenDaysAgo(), to: today() });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["delivery-report", applied.from, applied.to],
    queryFn: () => fetchDeliveryReport(applied.from, applied.to),
  });

  const summary = data?.summary ?? { totalOrders: 0, totalRevenue: 0, byMode: {} };
  const byPerson: any[] = data?.byPerson ?? [];

  const allModes = useMemo(() => {
    const modes = new Set<string>();
    byPerson.forEach((p) => Object.keys(p.byMode).forEach((m) => modes.add(m)));
    return Array.from(modes);
  }, [byPerson]);

  const handleApply = () => setApplied({ from, to });

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Truck className="w-5 h-5 text-brand-primary" />
            {isDeliveryPerson ? "My Delivery Report" : "Delivery Report"}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {isDeliveryPerson
              ? "Your deliveries and collections"
              : "Delivery-person wise order count and revenue breakdown"}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5 self-start sm:self-auto">
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </Button>
      </div>

      {/* Date filter */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex items-center gap-1 text-sm font-medium text-gray-700 mb-0.5 w-full sm:w-auto">
            <Calendar className="w-4 h-4 text-gray-400" />
            Date Range
          </div>
          <div className="flex flex-wrap gap-2 flex-1">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">From</label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40 text-sm" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">To</label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40 text-sm" />
            </div>
            <div className="flex flex-col justify-end">
              <Button size="sm" onClick={handleApply} className="bg-brand-primary hover:bg-brand-primary/90 text-white">
                Apply Filter
              </Button>
            </div>
          </div>
          {/* Quick filters */}
          <div className="flex gap-1.5 flex-wrap">
            {[
              { label: "Today", f: today(), t: today() },
              { label: "Last 7 days", f: sevenDaysAgo(), t: today() },
              {
                label: "This month",
                f: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10),
                t: today(),
              },
            ].map(({ label, f, t }) => (
              <button
                key={label}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  applied.from === f && applied.to === t
                    ? "bg-brand-primary text-white border-brand-primary"
                    : "bg-white text-gray-600 border-gray-200 hover:border-brand-primary hover:text-brand-primary"
                }`}
                onClick={() => {
                  setFrom(f);
                  setTo(t);
                  setApplied({ from: f, to: t });
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        <SummaryCard
          label="Total Deliveries"
          value={String(summary.totalOrders)}
          color="text-brand-primary"
          sub={
            !isDeliveryPerson && byPerson.length > 0 ? (
              <p className="text-xs text-gray-400">{byPerson.length} delivery person{byPerson.length !== 1 ? "s" : ""}</p>
            ) : undefined
          }
        />
        <SummaryCard
          label="Total Collected"
          value={formatRupees(summary.totalRevenue)}
          color="text-green-600"
        />
        {allModes.map((mode) => {
          const m = modeMeta(mode);
          return (
            <SummaryCard
              key={mode}
              label={`${m.label} Collected`}
              value={formatRupees(summary.byMode[mode] ?? 0)}
              color={m.color.split(" ")[0]}
            />
          );
        })}
      </div>

      {/* Loading / error states */}
      {isLoading && (
        <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
          <RefreshCw className="w-4 h-4 animate-spin" />
          <span className="text-sm">Loading report…</span>
        </div>
      )}

      {isError && (
        <div className="text-center py-10 text-red-500 text-sm">
          Failed to load report. Please try again.
        </div>
      )}

      {/* Per-person breakdown */}
      {!isLoading && !isError && byPerson.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <Package className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm font-medium">No delivered orders found</p>
          <p className="text-xs mt-1">Try adjusting the date range</p>
        </div>
      )}

      {!isLoading && !isError && byPerson.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
            {isDeliveryPerson ? "Your Orders" : "Breakdown by Delivery Person"}
          </h2>
          {byPerson.map((person, idx) => (
            <PersonCard key={person.personId} person={person} defaultOpen={isDeliveryPerson || byPerson.length === 1 || idx === 0} />
          ))}
        </div>
      )}
    </div>
  );
}

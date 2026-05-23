import { Router } from "express";
import { requireAuth } from "../middlewares/auth.js";
import { loadScope, type ScopedRequest } from "../middlewares/scope.js";
import { getSubHubDbConnection } from "../db/sub-hub-connections.js";

const router = Router();
router.use(requireAuth as any);
router.use(loadScope as any);

async function getOrdersDb() {
  return getSubHubDbConnection("orders");
}

// GET /api/delivery-report?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get("/", async (req: ScopedRequest, res) => {
  try {
    const conn = await getOrdersDb();
    const col = conn.db.collection("orders");

    const { from = "", to = "" } = req.query as Record<string, string>;

    const filter: any = {
      $or: [{ status: "delivered" }, { deliveryType: "takeaway" }],
    };

    if (from || to) {
      const dateFilter: any = {};
      if (from) dateFilter.$gte = new Date(from);
      if (to) {
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        dateFilter.$lte = toDate;
      }
      filter.createdAt = dateFilter;
    }

    const scope = req.scope;
    if (scope && !scope.isMaster) {
      if (scope.role === "delivery_person") {
        const uid = req.admin?.adminId;
        if (!uid) {
          res.json({ summary: { totalOrders: 0, totalRevenue: 0, byMode: {} }, byPerson: [] });
          return;
        }
        filter.assignedDeliveryPersonId = String(uid);
      } else if (scope.subHubIds && scope.subHubIds.length > 0) {
        filter.subHubId = { $in: scope.subHubIds };
      } else {
        res.json({ summary: { totalOrders: 0, totalRevenue: 0, byMode: {} }, byPerson: [] });
        return;
      }
    }

    const orders = await col
      .find(filter, {
        projection: {
          _id: 1,
          orderNumber: 1,
          customerName: 1,
          phone: 1,
          total: 1,
          paidAmount: 1,
          dueAmount: 1,
          payments: 1,
          paymentStatus: 1,
          status: 1,
          deliveryType: 1,
          assignedDeliveryPersonId: 1,
          assignedDeliveryPersonName: 1,
          createdAt: 1,
          subHubName: 1,
          deliveryArea: 1,
        },
      })
      .sort({ createdAt: -1 })
      .toArray();

    const personMap = new Map<string, any>();

    for (const order of orders) {
      const personId = String(order.assignedDeliveryPersonId || "unassigned");
      const personName =
        order.assignedDeliveryPersonName ||
        (order.deliveryType === "takeaway" ? "Takeaway (Counter)" : "Unassigned");

      if (!personMap.has(personId)) {
        personMap.set(personId, {
          personId,
          personName,
          orderCount: 0,
          totalRevenue: 0,
          byMode: {} as Record<string, number>,
          orders: [] as any[],
        });
      }

      const person = personMap.get(personId)!;
      person.orderCount++;

      const payments: any[] = Array.isArray(order.payments) ? order.payments : [];
      for (const p of payments) {
        const mode = (p.mode || "other").toLowerCase();
        const amount = Number(p.amount) || 0;
        person.byMode[mode] = (person.byMode[mode] || 0) + amount;
        person.totalRevenue += amount;
      }

      person.orders.push({
        id: String(order._id),
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        phone: order.phone,
        total: order.total,
        paidAmount: order.paidAmount,
        dueAmount: order.dueAmount,
        paymentStatus: order.paymentStatus,
        payments: payments.map((p: any) => ({ mode: p.mode, amount: p.amount })),
        status: order.status,
        deliveryType: order.deliveryType,
        createdAt: order.createdAt,
        subHubName: order.subHubName,
        deliveryArea: order.deliveryArea,
      });
    }

    const byPersonArr = Array.from(personMap.values()).sort((a, b) => b.orderCount - a.orderCount);

    const globalByMode: Record<string, number> = {};
    let totalRevenue = 0;
    for (const p of byPersonArr) {
      for (const [mode, amount] of Object.entries(p.byMode) as [string, number][]) {
        globalByMode[mode] = (globalByMode[mode] || 0) + amount;
      }
      totalRevenue += p.totalRevenue;
    }

    res.json({
      summary: {
        totalOrders: orders.length,
        totalRevenue,
        byMode: globalByMode,
      },
      byPerson: byPersonArr,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch delivery report");
    res.status(500).json({ error: "InternalError", message: "Failed to fetch delivery report" });
  }
});

export default router;

"use strict";
const jsxRuntime = require("react/jsx-runtime");
const adminSdk = require("@medusajs/admin-sdk");
const ui = require("@medusajs/ui");
const react = require("react");
const icons = require("@medusajs/icons");
const recharts = require("recharts");
const ManualPaymentWidget = ({ data: order }) => {
  const [amount, setAmount] = react.useState("");
  const [reference, setReference] = react.useState("");
  const [note, setNote] = react.useState("");
  const [isLoading, setIsLoading] = react.useState(false);
  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const res = await fetch(`/admin/orders/${order.id}/manual-payment`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          amount: Number(amount),
          reference,
          note
        })
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to record payment");
      }
      ui.toast.success("Success", {
        description: "Manual payment recorded successfully"
      });
      setAmount("");
      setReference("");
      setNote("");
      window.location.reload();
    } catch (err) {
      ui.toast.error("Error", {
        description: err.message
      });
    } finally {
      setIsLoading(false);
    }
  };
  return /* @__PURE__ */ jsxRuntime.jsxs(ui.Container, { className: "p-6 mt-4", children: [
    /* @__PURE__ */ jsxRuntime.jsx(ui.Heading, { level: "h2", className: "mb-4", children: "Record Manual Payment" }),
    /* @__PURE__ */ jsxRuntime.jsxs("form", { onSubmit: handleSubmit, className: "flex flex-col gap-4", children: [
      /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "flex flex-col gap-2", children: [
        /* @__PURE__ */ jsxRuntime.jsx(ui.Label, { htmlFor: "amount", children: "Amount" }),
        /* @__PURE__ */ jsxRuntime.jsx(
          ui.Input,
          {
            id: "amount",
            type: "number",
            step: "0.01",
            value: amount,
            onChange: (e) => setAmount(e.target.value),
            required: true,
            placeholder: "e.g. 50.00"
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "flex flex-col gap-2", children: [
        /* @__PURE__ */ jsxRuntime.jsx(ui.Label, { htmlFor: "reference", children: "Reference (Optional)" }),
        /* @__PURE__ */ jsxRuntime.jsx(
          ui.Input,
          {
            id: "reference",
            type: "text",
            value: reference,
            onChange: (e) => setReference(e.target.value),
            placeholder: "e.g. Bank Transfer TXN-123"
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "flex flex-col gap-2", children: [
        /* @__PURE__ */ jsxRuntime.jsx(ui.Label, { htmlFor: "note", children: "Note (Optional)" }),
        /* @__PURE__ */ jsxRuntime.jsx(
          ui.Textarea,
          {
            id: "note",
            value: note,
            onChange: (e) => setNote(e.target.value),
            placeholder: "Additional details..."
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntime.jsx("div", { className: "flex justify-end mt-2", children: /* @__PURE__ */ jsxRuntime.jsx(ui.Button, { type: "submit", variant: "primary", isLoading, children: "Record Payment" }) })
    ] })
  ] });
};
adminSdk.defineWidgetConfig({
  zone: "order.details.after"
});
const PaymentHistoryWidget = ({ data: order }) => {
  var _a;
  const paymentCollection = (_a = order.payment_collections) == null ? void 0 : _a[0];
  const payments = (paymentCollection == null ? void 0 : paymentCollection.payments) || [];
  return /* @__PURE__ */ jsxRuntime.jsxs(ui.Container, { className: "p-6 mt-4", children: [
    /* @__PURE__ */ jsxRuntime.jsx(ui.Heading, { level: "h2", className: "mb-4", children: "Payment History" }),
    payments.length === 0 ? /* @__PURE__ */ jsxRuntime.jsx(ui.Text, { className: "text-ui-fg-subtle", children: "No payments recorded yet." }) : /* @__PURE__ */ jsxRuntime.jsxs(ui.Table, { children: [
      /* @__PURE__ */ jsxRuntime.jsx(ui.Table.Header, { children: /* @__PURE__ */ jsxRuntime.jsxs(ui.Table.Row, { children: [
        /* @__PURE__ */ jsxRuntime.jsx(ui.Table.HeaderCell, { children: "ID" }),
        /* @__PURE__ */ jsxRuntime.jsx(ui.Table.HeaderCell, { children: "Provider" }),
        /* @__PURE__ */ jsxRuntime.jsx(ui.Table.HeaderCell, { children: "Amount" }),
        /* @__PURE__ */ jsxRuntime.jsx(ui.Table.HeaderCell, { children: "Status" }),
        /* @__PURE__ */ jsxRuntime.jsx(ui.Table.HeaderCell, { children: "Date" })
      ] }) }),
      /* @__PURE__ */ jsxRuntime.jsx(ui.Table.Body, { children: payments.map((payment) => /* @__PURE__ */ jsxRuntime.jsxs(ui.Table.Row, { children: [
        /* @__PURE__ */ jsxRuntime.jsx(ui.Table.Cell, { className: "font-mono text-xs", children: payment.id.slice(-8) }),
        /* @__PURE__ */ jsxRuntime.jsx(ui.Table.Cell, { children: /* @__PURE__ */ jsxRuntime.jsx(ui.Badge, { size: "small", color: payment.provider_id === "paystack" ? "blue" : "grey", children: payment.provider_id }) }),
        /* @__PURE__ */ jsxRuntime.jsx(ui.Table.Cell, { children: new Intl.NumberFormat("en-US", { style: "currency", currency: payment.currency_code }).format(payment.amount) }),
        /* @__PURE__ */ jsxRuntime.jsx(ui.Table.Cell, { children: /* @__PURE__ */ jsxRuntime.jsx(ui.Badge, { size: "small", color: payment.captured_at ? "green" : payment.canceled_at ? "red" : "orange", children: payment.captured_at ? "Captured" : payment.canceled_at ? "Canceled" : "Pending" }) }),
        /* @__PURE__ */ jsxRuntime.jsx(ui.Table.Cell, { children: new Date(payment.created_at).toLocaleDateString() })
      ] }, payment.id)) })
    ] })
  ] });
};
adminSdk.defineWidgetConfig({
  zone: "order.details.after"
});
const config = adminSdk.defineRouteConfig({
  label: "Paystack",
  icon: icons.CurrencyDollar
});
function PaystackDashboard() {
  var _a;
  const [data, setData] = react.useState(null);
  const [payments, setPayments] = react.useState([]);
  const [loading, setLoading] = react.useState(true);
  const [loadingMore, setLoadingMore] = react.useState(false);
  const [page, setPage] = react.useState(1);
  const [search, setSearch] = react.useState("");
  const [hasMore, setHasMore] = react.useState(true);
  const observer = react.useRef(null);
  const lastElementRef = react.useCallback((node) => {
    if (loading || loadingMore || !hasMore) return;
    if (observer.current) observer.current.disconnect();
    observer.current = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        setPage((prev) => prev + 1);
      }
    });
    if (node) observer.current.observe(node);
  }, [loading, loadingMore, hasMore]);
  const fetchData = async (currentPage, currentSearch, isAppend = false) => {
    if (isAppend) setLoadingMore(true);
    else setLoading(true);
    try {
      const res = await fetch(`/admin/paystack/dashboard?page=${currentPage}&search=${encodeURIComponent(currentSearch)}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const json = await res.json();
      if (isAppend) {
        setPayments((prev) => [...prev, ...json.payments]);
      } else {
        setData(json);
        setPayments(json.payments);
      }
      setHasMore(json.has_more);
    } catch (err) {
      console.error("Error fetching Paystack dashboard data:", err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };
  react.useEffect(() => {
    setPage(1);
    const delayDebounceFn = setTimeout(() => {
      fetchData(1, search, false);
    }, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [search]);
  react.useEffect(() => {
    if (page > 1) {
      fetchData(page, search, true);
    }
  }, [page]);
  react.useEffect(() => {
    const interval = setInterval(() => {
      if (page === 1 && !search) {
        fetchData(1, "", false);
      }
    }, 5 * 60 * 1e3);
    return () => clearInterval(interval);
  }, [page, search]);
  if (loading && page === 1 && !data) {
    return /* @__PURE__ */ jsxRuntime.jsx(ui.Container, { className: "p-8 flex items-center justify-center", children: /* @__PURE__ */ jsxRuntime.jsx(ui.Text, { children: "Loading Paystack Dashboard..." }) });
  }
  const currencies = Object.keys((data == null ? void 0 : data.totals) || {});
  const colors = ["#0ea5e9", "#10b981", "#f59e0b", "#8b5cf6"];
  return /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "flex flex-col gap-y-4", children: [
    /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "flex items-center justify-between", children: [
      /* @__PURE__ */ jsxRuntime.jsx(ui.Heading, { level: "h1", children: "Paystack Dashboard" }),
      /* @__PURE__ */ jsxRuntime.jsx(ui.Text, { className: "text-ui-fg-subtle", children: "Auto-refreshes every 5 mins" })
    ] }),
    !search && /* @__PURE__ */ jsxRuntime.jsx("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: currencies.length === 0 ? /* @__PURE__ */ jsxRuntime.jsxs(ui.Container, { className: "p-6", children: [
      /* @__PURE__ */ jsxRuntime.jsx(ui.Text, { className: "text-ui-fg-subtle mb-2", children: "Current Balance" }),
      /* @__PURE__ */ jsxRuntime.jsx(ui.Heading, { level: "h2", children: "0.00" })
    ] }) : currencies.map((currency) => {
      var _a2;
      return /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4 col-span-1 md:col-span-2", children: [
        /* @__PURE__ */ jsxRuntime.jsxs(ui.Container, { className: "p-6 bg-ui-bg-base border-l-4 border-l-emerald-500", children: [
          /* @__PURE__ */ jsxRuntime.jsxs(ui.Text, { className: "text-ui-fg-subtle mb-2", children: [
            "Current Balance (",
            currency,
            ")"
          ] }),
          /* @__PURE__ */ jsxRuntime.jsx(ui.Heading, { level: "h1", className: "text-emerald-600 dark:text-emerald-400", children: new Intl.NumberFormat("en-US", {
            style: "currency",
            currency
          }).format(((_a2 = data.balances) == null ? void 0 : _a2[currency]) || 0) })
        ] }),
        /* @__PURE__ */ jsxRuntime.jsxs(ui.Container, { className: "p-6", children: [
          /* @__PURE__ */ jsxRuntime.jsxs(ui.Text, { className: "text-ui-fg-subtle mb-2", children: [
            "Total Received All-Time (",
            currency,
            ")"
          ] }),
          /* @__PURE__ */ jsxRuntime.jsx(ui.Heading, { level: "h2", children: new Intl.NumberFormat("en-US", {
            style: "currency",
            currency
          }).format(data.totals[currency]) })
        ] })
      ] }, currency);
    }) }),
    !search && /* @__PURE__ */ jsxRuntime.jsxs(ui.Container, { className: "p-6 h-[400px]", children: [
      /* @__PURE__ */ jsxRuntime.jsx(ui.Heading, { level: "h2", className: "mb-6", children: "Revenue Over Time" }),
      ((_a = data == null ? void 0 : data.chart_data) == null ? void 0 : _a.length) > 0 ? /* @__PURE__ */ jsxRuntime.jsx(recharts.ResponsiveContainer, { width: "100%", height: "100%", children: /* @__PURE__ */ jsxRuntime.jsxs(recharts.BarChart, { data: data.chart_data, margin: { top: 10, right: 30, left: 0, bottom: 0 }, children: [
        /* @__PURE__ */ jsxRuntime.jsx(recharts.CartesianGrid, { strokeDasharray: "3 3", vertical: false, stroke: "#e5e7eb" }),
        /* @__PURE__ */ jsxRuntime.jsx(recharts.XAxis, { dataKey: "name", axisLine: false, tickLine: false, tick: { fill: "#6b7280", fontSize: 12 }, dy: 10 }),
        /* @__PURE__ */ jsxRuntime.jsx(recharts.YAxis, { axisLine: false, tickLine: false, tick: { fill: "#6b7280", fontSize: 12 }, dx: -10 }),
        /* @__PURE__ */ jsxRuntime.jsx(
          recharts.Tooltip,
          {
            cursor: { fill: "#f3f4f6" },
            contentStyle: { borderRadius: "8px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }
          }
        ),
        /* @__PURE__ */ jsxRuntime.jsx(recharts.Legend, { wrapperStyle: { paddingTop: "20px" } }),
        currencies.map((currency, index) => /* @__PURE__ */ jsxRuntime.jsx(
          recharts.Bar,
          {
            dataKey: currency,
            fill: colors[index % colors.length],
            radius: [4, 4, 0, 0],
            maxBarSize: 50
          },
          currency
        ))
      ] }) }) : /* @__PURE__ */ jsxRuntime.jsx("div", { className: "flex items-center justify-center h-full", children: /* @__PURE__ */ jsxRuntime.jsx(ui.Text, { className: "text-ui-fg-subtle", children: "No revenue data available yet." }) })
    ] }),
    /* @__PURE__ */ jsxRuntime.jsxs(ui.Container, { className: "p-0 overflow-hidden", children: [
      /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "p-6 border-b border-ui-border-base flex items-center justify-between", children: [
        /* @__PURE__ */ jsxRuntime.jsx(ui.Heading, { level: "h2", children: "Payment History" }),
        /* @__PURE__ */ jsxRuntime.jsx("div", { className: "w-64", children: /* @__PURE__ */ jsxRuntime.jsx(
          ui.Input,
          {
            type: "search",
            placeholder: "Search Order ID or Reference...",
            value: search,
            onChange: (e) => setSearch(e.target.value)
          }
        ) })
      ] }),
      /* @__PURE__ */ jsxRuntime.jsxs(ui.Table, { children: [
        /* @__PURE__ */ jsxRuntime.jsx(ui.Table.Header, { children: /* @__PURE__ */ jsxRuntime.jsxs(ui.Table.Row, { children: [
          /* @__PURE__ */ jsxRuntime.jsx(ui.Table.HeaderCell, { children: "Order No / Ref" }),
          /* @__PURE__ */ jsxRuntime.jsx(ui.Table.HeaderCell, { children: "Date" }),
          /* @__PURE__ */ jsxRuntime.jsx(ui.Table.HeaderCell, { children: "Customer" }),
          /* @__PURE__ */ jsxRuntime.jsx(ui.Table.HeaderCell, { children: "Amount" }),
          /* @__PURE__ */ jsxRuntime.jsx(ui.Table.HeaderCell, { children: "Status" })
        ] }) }),
        /* @__PURE__ */ jsxRuntime.jsxs(ui.Table.Body, { children: [
          payments.map((payment) => /* @__PURE__ */ jsxRuntime.jsxs(ui.Table.Row, { children: [
            /* @__PURE__ */ jsxRuntime.jsxs(ui.Table.Cell, { children: [
              "#",
              payment.order_number
            ] }),
            /* @__PURE__ */ jsxRuntime.jsx(ui.Table.Cell, { children: new Date(payment.date).toLocaleString() }),
            /* @__PURE__ */ jsxRuntime.jsx(ui.Table.Cell, { children: /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "flex flex-col", children: [
              /* @__PURE__ */ jsxRuntime.jsx(ui.Text, { size: "small", weight: "plus", children: payment.customer_name }),
              /* @__PURE__ */ jsxRuntime.jsx(ui.Text, { size: "small", className: "text-ui-fg-subtle", children: payment.customer_email })
            ] }) }),
            /* @__PURE__ */ jsxRuntime.jsx(ui.Table.Cell, { children: new Intl.NumberFormat("en-US", {
              style: "currency",
              currency: payment.currency_code
            }).format(payment.amount) }),
            /* @__PURE__ */ jsxRuntime.jsx(ui.Table.Cell, { children: /* @__PURE__ */ jsxRuntime.jsx(ui.StatusBadge, { color: payment.status === "captured" ? "green" : payment.status === "pending" ? "orange" : "red", children: payment.status.charAt(0).toUpperCase() + payment.status.slice(1) }) })
          ] }, payment.id)),
          payments.length === 0 && !loading && /* @__PURE__ */ jsxRuntime.jsx(ui.Table.Row, { children: /* @__PURE__ */ jsxRuntime.jsx(ui.Table.Cell, { colSpan: 5, className: "text-center py-8 text-ui-fg-subtle", children: "No Paystack payments found." }) })
        ] })
      ] }),
      hasMore && !search && /* @__PURE__ */ jsxRuntime.jsx("div", { ref: lastElementRef, className: "p-4 text-center text-ui-fg-subtle", children: loadingMore ? "Loading more payments..." : "Scroll for more" })
    ] })
  ] });
}
const i18nTranslations0 = {};
const widgetModule = { widgets: [
  {
    Component: ManualPaymentWidget,
    zone: ["order.details.after"]
  },
  {
    Component: PaymentHistoryWidget,
    zone: ["order.details.after"]
  }
] };
const routeModule = {
  routes: [
    {
      Component: PaystackDashboard,
      path: "/payments/paystack"
    }
  ]
};
const menuItemModule = {
  menuItems: [
    {
      label: config.label,
      icon: config.icon,
      path: "/payments/paystack",
      nested: void 0,
      rank: void 0,
      translationNs: void 0
    }
  ]
};
const formModule = { customFields: {} };
const displayModule = {
  displays: {}
};
const i18nModule = { resources: i18nTranslations0 };
const plugin = {
  widgetModule,
  routeModule,
  menuItemModule,
  formModule,
  displayModule,
  i18nModule
};
module.exports = plugin;

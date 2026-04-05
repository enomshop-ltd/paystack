import { jsxs, jsx } from "react/jsx-runtime";
import { defineWidgetConfig, defineRouteConfig } from "@medusajs/admin-sdk";
import { Container, Heading, Label, Input, Textarea, Button, toast, Text, Table, Badge, StatusBadge } from "@medusajs/ui";
import { useState, useRef, useCallback, useEffect } from "react";
import { CurrencyDollar } from "@medusajs/icons";
import { ResponsiveContainer, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend, Bar } from "recharts";
const ManualPaymentWidget = ({ data: order }) => {
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [isLoading, setIsLoading] = useState(false);
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
      toast.success("Success", {
        description: "Manual payment recorded successfully"
      });
      setAmount("");
      setReference("");
      setNote("");
      window.location.reload();
    } catch (err) {
      toast.error("Error", {
        description: err.message
      });
    } finally {
      setIsLoading(false);
    }
  };
  return /* @__PURE__ */ jsxs(Container, { className: "p-6 mt-4", children: [
    /* @__PURE__ */ jsx(Heading, { level: "h2", className: "mb-4", children: "Record Manual Payment" }),
    /* @__PURE__ */ jsxs("form", { onSubmit: handleSubmit, className: "flex flex-col gap-4", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex flex-col gap-2", children: [
        /* @__PURE__ */ jsx(Label, { htmlFor: "amount", children: "Amount" }),
        /* @__PURE__ */ jsx(
          Input,
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
      /* @__PURE__ */ jsxs("div", { className: "flex flex-col gap-2", children: [
        /* @__PURE__ */ jsx(Label, { htmlFor: "reference", children: "Reference (Optional)" }),
        /* @__PURE__ */ jsx(
          Input,
          {
            id: "reference",
            type: "text",
            value: reference,
            onChange: (e) => setReference(e.target.value),
            placeholder: "e.g. Bank Transfer TXN-123"
          }
        )
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex flex-col gap-2", children: [
        /* @__PURE__ */ jsx(Label, { htmlFor: "note", children: "Note (Optional)" }),
        /* @__PURE__ */ jsx(
          Textarea,
          {
            id: "note",
            value: note,
            onChange: (e) => setNote(e.target.value),
            placeholder: "Additional details..."
          }
        )
      ] }),
      /* @__PURE__ */ jsx("div", { className: "flex justify-end mt-2", children: /* @__PURE__ */ jsx(Button, { type: "submit", variant: "primary", isLoading, children: "Record Payment" }) })
    ] })
  ] });
};
defineWidgetConfig({
  zone: "order.details.after"
});
const PaymentHistoryWidget = ({ data: order }) => {
  var _a;
  const paymentCollection = (_a = order.payment_collections) == null ? void 0 : _a[0];
  const payments = (paymentCollection == null ? void 0 : paymentCollection.payments) || [];
  return /* @__PURE__ */ jsxs(Container, { className: "p-6 mt-4", children: [
    /* @__PURE__ */ jsx(Heading, { level: "h2", className: "mb-4", children: "Payment History" }),
    payments.length === 0 ? /* @__PURE__ */ jsx(Text, { className: "text-ui-fg-subtle", children: "No payments recorded yet." }) : /* @__PURE__ */ jsxs(Table, { children: [
      /* @__PURE__ */ jsx(Table.Header, { children: /* @__PURE__ */ jsxs(Table.Row, { children: [
        /* @__PURE__ */ jsx(Table.HeaderCell, { children: "Ref No." }),
        /* @__PURE__ */ jsx(Table.HeaderCell, { children: "Provider" }),
        /* @__PURE__ */ jsx(Table.HeaderCell, { children: "Amount" }),
        /* @__PURE__ */ jsx(Table.HeaderCell, { children: "Status" }),
        /* @__PURE__ */ jsx(Table.HeaderCell, { children: "Date" })
      ] }) }),
      /* @__PURE__ */ jsx(Table.Body, { children: payments.map((payment) => {
        var _a2, _b;
        const reference = ((_a2 = payment.data) == null ? void 0 : _a2.paystackTxRef) || ((_b = payment.data) == null ? void 0 : _b.reference) || payment.id.slice(-8);
        return /* @__PURE__ */ jsxs(Table.Row, { children: [
          /* @__PURE__ */ jsx(Table.Cell, { className: "font-mono text-xs", children: reference }),
          /* @__PURE__ */ jsx(Table.Cell, { children: /* @__PURE__ */ jsx(Badge, { size: "small", color: payment.provider_id === "paystack" || payment.provider_id === "pp_paystack" ? "blue" : "grey", children: payment.provider_id }) }),
          /* @__PURE__ */ jsx(Table.Cell, { children: new Intl.NumberFormat("en-US", { style: "currency", currency: payment.currency_code }).format(payment.amount) }),
          /* @__PURE__ */ jsx(Table.Cell, { children: /* @__PURE__ */ jsx(Badge, { size: "small", color: payment.captured_at ? "green" : payment.canceled_at ? "red" : "orange", children: payment.captured_at ? "Captured" : payment.canceled_at ? "Canceled" : "Pending" }) }),
          /* @__PURE__ */ jsx(Table.Cell, { children: new Date(payment.created_at).toLocaleDateString() })
        ] }, payment.id);
      }) })
    ] })
  ] });
};
defineWidgetConfig({
  zone: "order.details.after"
});
const config = defineRouteConfig({
  label: "Paystack",
  icon: CurrencyDollar
});
function PaystackDashboard() {
  var _a;
  const [data, setData] = useState(null);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [hasMore, setHasMore] = useState(true);
  const observer = useRef(null);
  const lastElementRef = useCallback((node) => {
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
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };
  useEffect(() => {
    setPage(1);
    const delayDebounceFn = setTimeout(() => {
      fetchData(1, search, false);
    }, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [search]);
  useEffect(() => {
    if (page > 1) {
      fetchData(page, search, true);
    }
  }, [page]);
  useEffect(() => {
    const interval = setInterval(() => {
      if (page === 1 && !search) {
        fetchData(1, "", false);
      }
    }, 5 * 60 * 1e3);
    return () => clearInterval(interval);
  }, [page, search]);
  if (loading && page === 1 && !data) {
    return /* @__PURE__ */ jsx(Container, { className: "p-8 flex items-center justify-center", children: /* @__PURE__ */ jsx(Text, { children: "Loading Paystack Dashboard..." }) });
  }
  const currencies = Object.keys((data == null ? void 0 : data.totals) || {});
  const colors = ["#0ea5e9", "#10b981", "#f59e0b", "#8b5cf6"];
  return /* @__PURE__ */ jsxs("div", { className: "flex flex-col gap-y-4", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between", children: [
      /* @__PURE__ */ jsx(Heading, { level: "h1", children: "Paystack Dashboard" }),
      /* @__PURE__ */ jsx(Text, { className: "text-ui-fg-subtle", children: "Auto-refreshes every 5 mins" })
    ] }),
    !search && /* @__PURE__ */ jsx("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: currencies.length === 0 ? /* @__PURE__ */ jsxs(Container, { className: "p-6", children: [
      /* @__PURE__ */ jsx(Text, { className: "text-ui-fg-subtle mb-2", children: "Current Balance" }),
      /* @__PURE__ */ jsx(Heading, { level: "h2", children: "0.00" })
    ] }) : currencies.map((currency) => {
      var _a2;
      return /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4 col-span-1 md:col-span-2", children: [
        /* @__PURE__ */ jsxs(Container, { className: "p-6 bg-ui-bg-base border-l-4 border-l-emerald-500", children: [
          /* @__PURE__ */ jsxs(Text, { className: "text-ui-fg-subtle mb-2", children: [
            "Current Balance (",
            currency,
            ")"
          ] }),
          /* @__PURE__ */ jsx(Heading, { level: "h1", className: "text-emerald-600 dark:text-emerald-400", children: new Intl.NumberFormat("en-US", {
            style: "currency",
            currency
          }).format(((_a2 = data.balances) == null ? void 0 : _a2[currency]) || 0) })
        ] }),
        /* @__PURE__ */ jsxs(Container, { className: "p-6", children: [
          /* @__PURE__ */ jsxs(Text, { className: "text-ui-fg-subtle mb-2", children: [
            "Total Received All-Time (",
            currency,
            ")"
          ] }),
          /* @__PURE__ */ jsx(Heading, { level: "h2", children: new Intl.NumberFormat("en-US", {
            style: "currency",
            currency
          }).format(data.totals[currency]) })
        ] })
      ] }, currency);
    }) }),
    !search && /* @__PURE__ */ jsxs(Container, { className: "p-6 h-[400px]", children: [
      /* @__PURE__ */ jsx(Heading, { level: "h2", className: "mb-6", children: "Revenue Over Time" }),
      ((_a = data == null ? void 0 : data.chart_data) == null ? void 0 : _a.length) > 0 ? /* @__PURE__ */ jsx(ResponsiveContainer, { width: "100%", height: "100%", children: /* @__PURE__ */ jsxs(BarChart, { data: data.chart_data, margin: { top: 10, right: 30, left: 0, bottom: 0 }, children: [
        /* @__PURE__ */ jsx(CartesianGrid, { strokeDasharray: "3 3", vertical: false, stroke: "#e5e7eb" }),
        /* @__PURE__ */ jsx(XAxis, { dataKey: "name", axisLine: false, tickLine: false, tick: { fill: "#6b7280", fontSize: 12 }, dy: 10 }),
        /* @__PURE__ */ jsx(YAxis, { axisLine: false, tickLine: false, tick: { fill: "#6b7280", fontSize: 12 }, dx: -10 }),
        /* @__PURE__ */ jsx(
          Tooltip,
          {
            cursor: { fill: "#f3f4f6" },
            contentStyle: { borderRadius: "8px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }
          }
        ),
        /* @__PURE__ */ jsx(Legend, { wrapperStyle: { paddingTop: "20px" } }),
        currencies.map((currency, index) => /* @__PURE__ */ jsx(
          Bar,
          {
            dataKey: currency,
            fill: colors[index % colors.length],
            radius: [4, 4, 0, 0],
            maxBarSize: 50
          },
          currency
        ))
      ] }) }) : /* @__PURE__ */ jsx("div", { className: "flex items-center justify-center h-full", children: /* @__PURE__ */ jsx(Text, { className: "text-ui-fg-subtle", children: "No revenue data available yet." }) })
    ] }),
    /* @__PURE__ */ jsxs(Container, { className: "p-0 overflow-hidden", children: [
      /* @__PURE__ */ jsxs("div", { className: "p-6 border-b border-ui-border-base flex items-center justify-between", children: [
        /* @__PURE__ */ jsx(Heading, { level: "h2", children: "Payment History" }),
        /* @__PURE__ */ jsx("div", { className: "w-64", children: /* @__PURE__ */ jsx(
          Input,
          {
            type: "search",
            placeholder: "Search Order ID or Reference...",
            value: search,
            onChange: (e) => setSearch(e.target.value)
          }
        ) })
      ] }),
      /* @__PURE__ */ jsxs(Table, { children: [
        /* @__PURE__ */ jsx(Table.Header, { children: /* @__PURE__ */ jsxs(Table.Row, { children: [
          /* @__PURE__ */ jsx(Table.HeaderCell, { children: "Ref No." }),
          /* @__PURE__ */ jsx(Table.HeaderCell, { children: "Date" }),
          /* @__PURE__ */ jsx(Table.HeaderCell, { children: "Customer" }),
          /* @__PURE__ */ jsx(Table.HeaderCell, { children: "Amount" }),
          /* @__PURE__ */ jsx(Table.HeaderCell, { children: "Status" })
        ] }) }),
        /* @__PURE__ */ jsxs(Table.Body, { children: [
          payments.map((payment) => /* @__PURE__ */ jsxs(Table.Row, { children: [
            /* @__PURE__ */ jsx(Table.Cell, { className: "font-mono text-xs", children: payment.reference }),
            /* @__PURE__ */ jsx(Table.Cell, { children: new Date(payment.date).toLocaleString() }),
            /* @__PURE__ */ jsx(Table.Cell, { children: /* @__PURE__ */ jsxs("div", { className: "flex flex-col", children: [
              /* @__PURE__ */ jsx(Text, { size: "small", weight: "plus", children: payment.customer_name }),
              /* @__PURE__ */ jsx(Text, { size: "small", className: "text-ui-fg-subtle", children: payment.customer_email })
            ] }) }),
            /* @__PURE__ */ jsx(Table.Cell, { children: new Intl.NumberFormat("en-US", {
              style: "currency",
              currency: payment.currency_code
            }).format(payment.amount) }),
            /* @__PURE__ */ jsx(Table.Cell, { children: /* @__PURE__ */ jsx(StatusBadge, { color: payment.status === "captured" ? "green" : payment.status === "pending" ? "orange" : "red", children: payment.status.charAt(0).toUpperCase() + payment.status.slice(1) }) })
          ] }, payment.id)),
          payments.length === 0 && !loading && /* @__PURE__ */ jsx(Table.Row, { children: /* @__PURE__ */ jsx(Table.Cell, { colSpan: 5, className: "text-center py-8 text-ui-fg-subtle", children: "No Paystack payments found." }) })
        ] })
      ] }),
      hasMore && !search && /* @__PURE__ */ jsx("div", { ref: lastElementRef, className: "p-4 text-center text-ui-fg-subtle", children: loadingMore ? "Loading more payments..." : "Scroll for more" })
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
export {
  plugin as default
};

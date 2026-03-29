import { useEffect, useState, useRef, useCallback } from "react";
import { defineRouteConfig } from "@medusajs/admin-sdk";
import { CurrencyDollar } from "@medusajs/icons";
import { Container, Heading, Text, Table, StatusBadge, Input } from "@medusajs/ui";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

export const config = defineRouteConfig({
  label: "Paystack",
  icon: CurrencyDollar,
});

export default function PaystackDashboard() {
  const [data, setData] = useState<any>(null);
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [hasMore, setHasMore] = useState(true);
  
  const observer = useRef<IntersectionObserver | null>(null);

  const lastElementRef = useCallback((node: HTMLDivElement) => {
    if (loading || loadingMore || !hasMore) return;
    if (observer.current) observer.current.disconnect();
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) {
        setPage(prev => prev + 1);
      }
    });
    if (node) observer.current.observe(node);
  }, [loading, loadingMore, hasMore]);

  const fetchData = async (currentPage: number, currentSearch: string, isAppend: boolean = false) => {
    if (isAppend) setLoadingMore(true);
    else setLoading(true);

    try {
      const res = await fetch(`/admin/paystack/dashboard?page=${currentPage}&search=${encodeURIComponent(currentSearch)}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const json = await res.json();
      
      if (isAppend) {
        setPayments(prev => [...prev, ...json.payments]);
      } else {
        setData(json);
        setPayments(json.payments);
      }
      setHasMore(json.has_more);
    } catch (err) {
      // Silently handle error in UI or show a toast if available
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  // Initial fetch and search changes
  useEffect(() => {
    setPage(1);
    const delayDebounceFn = setTimeout(() => {
      fetchData(1, search, false);
    }, 500); // debounce search
    return () => clearTimeout(delayDebounceFn);
  }, [search]);

  // Pagination changes
  useEffect(() => {
    if (page > 1) {
      fetchData(page, search, true);
    }
  }, [page]);

  // Auto-refresh every 5 mins (only if on page 1 and no search)
  useEffect(() => {
    const interval = setInterval(() => {
      if (page === 1 && !search) {
        fetchData(1, "", false);
      }
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [page, search]);

  if (loading && page === 1 && !data) {
    return (
      <Container className="p-8 flex items-center justify-center">
        <Text>Loading Paystack Dashboard...</Text>
      </Container>
    );
  }

  const currencies = Object.keys(data?.totals || {});
  const colors = ["#0ea5e9", "#10b981", "#f59e0b", "#8b5cf6"];

  return (
    <div className="flex flex-col gap-y-4">
      <div className="flex items-center justify-between">
        <Heading level="h1">Paystack Dashboard</Heading>
        <Text className="text-ui-fg-subtle">Auto-refreshes every 5 mins</Text>
      </div>

      {/* Top Section: Total Amount Cards */}
      {!search && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {currencies.length === 0 ? (
            <Container className="p-6">
              <Text className="text-ui-fg-subtle mb-2">Current Balance</Text>
              <Heading level="h2">0.00</Heading>
            </Container>
          ) : (
            currencies.map((currency) => (
              <div key={currency} className="grid grid-cols-1 md:grid-cols-2 gap-4 col-span-1 md:col-span-2">
                <Container className="p-6 bg-ui-bg-base border-l-4 border-l-emerald-500">
                  <Text className="text-ui-fg-subtle mb-2">Current Balance ({currency})</Text>
                  <Heading level="h1" className="text-emerald-600 dark:text-emerald-400">
                    {new Intl.NumberFormat("en-US", {
                      style: "currency",
                      currency: currency,
                    }).format(data.balances?.[currency] || 0)}
                  </Heading>
                </Container>
                <Container className="p-6">
                  <Text className="text-ui-fg-subtle mb-2">Total Received All-Time ({currency})</Text>
                  <Heading level="h2">
                    {new Intl.NumberFormat("en-US", {
                      style: "currency",
                      currency: currency,
                    }).format(data.totals[currency])}
                  </Heading>
                </Container>
              </div>
            ))
          )}
        </div>
      )}

      {/* Middle Section: Graph */}
      {!search && (
        <Container className="p-6 h-[400px]">
          <Heading level="h2" className="mb-6">Revenue Over Time</Heading>
          {data?.chart_data?.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.chart_data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 12 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 12 }} dx={-10} />
                <Tooltip 
                  cursor={{ fill: '#f3f4f6' }}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Legend wrapperStyle={{ paddingTop: '20px' }} />
                {currencies.map((currency, index) => (
                  <Bar 
                    key={currency} 
                    dataKey={currency} 
                    fill={colors[index % colors.length]} 
                    radius={[4, 4, 0, 0]} 
                    maxBarSize={50}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full">
              <Text className="text-ui-fg-subtle">No revenue data available yet.</Text>
            </div>
          )}
        </Container>
      )}

      {/* Bottom Section: Payment History Table */}
      <Container className="p-0 overflow-hidden">
        <div className="p-6 border-b border-ui-border-base flex items-center justify-between">
          <Heading level="h2">Payment History</Heading>
          <div className="w-64">
            <Input 
              type="search" 
              placeholder="Search Order ID or Reference..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Order No / Ref</Table.HeaderCell>
              <Table.HeaderCell>Date</Table.HeaderCell>
              <Table.HeaderCell>Customer</Table.HeaderCell>
              <Table.HeaderCell>Amount</Table.HeaderCell>
              <Table.HeaderCell>Status</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {payments.map((payment: any) => (
              <Table.Row key={payment.id}>
                <Table.Cell>#{payment.order_number}</Table.Cell>
                <Table.Cell>{new Date(payment.date).toLocaleString()}</Table.Cell>
                <Table.Cell>
                  <div className="flex flex-col">
                    <Text size="small" weight="plus">{payment.customer_name}</Text>
                    <Text size="small" className="text-ui-fg-subtle">{payment.customer_email}</Text>
                  </div>
                </Table.Cell>
                <Table.Cell>
                  {new Intl.NumberFormat("en-US", {
                    style: "currency",
                    currency: payment.currency_code,
                  }).format(payment.amount)}
                </Table.Cell>
                <Table.Cell>
                  <StatusBadge color={
                    payment.status === "captured" ? "green" : 
                    payment.status === "pending" ? "orange" : "red"
                  }>
                    {payment.status.charAt(0).toUpperCase() + payment.status.slice(1)}
                  </StatusBadge>
                </Table.Cell>
              </Table.Row>
            ))}
            {payments.length === 0 && !loading && (
              <Table.Row>
                <Table.Cell colSpan={5} className="text-center py-8 text-ui-fg-subtle">
                  No Paystack payments found.
                </Table.Cell>
              </Table.Row>
            )}
          </Table.Body>
        </Table>
        
        {/* Endless Scroll Trigger */}
        {hasMore && !search && (
          <div ref={lastElementRef} className="p-4 text-center text-ui-fg-subtle">
            {loadingMore ? "Loading more payments..." : "Scroll for more"}
          </div>
        )}
      </Container>
    </div>
  );
}

import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Container, Heading, Text, Input, Button, Badge } from "@medusajs/ui"
import { CreditCard, MagnifyingGlass } from "@medusajs/icons"
import { useQuery } from "@tanstack/react-query"
import { useState, useEffect } from "react"
import { sdk } from "../../lib/client"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"

interface PaystackBalance {
  currency: string
  balance: number
}

interface PaystackTransaction {
  id: number
  reference: string
  amount: number
  currency: string
  status: string
  paid_at: string | null
  created_at: string
  customer: {
    email: string
  }
  metadata?: {
    order_id?: string
  }
}

interface PaystackTransactionsResponse {
  status: boolean
  message: string
  data: PaystackTransaction[]
  meta: {
    total: number
    total_volume: number
    total_value: number
    page: number
    pageCount: number
  }
}

const PaystackPage = () => {
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [searchTerm, setSearchTerm] = useState("")

  // Fetch balance data
  const { data: balanceData, isLoading: isLoadingBalance } = useQuery({
    queryKey: ["paystack-balance"],
    queryFn: async () => {
      const response = await sdk.client.fetch<{
        balances: PaystackBalance[]
        total_received: number
      }>("/admin/paystack/balance")
      return response
    },
  })

  // Fetch transactions with pagination and search
  const { data: transactionsData, isLoading: isLoadingTransactions } = useQuery({
    queryKey: ["paystack-transactions", page, searchTerm],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        per_page: "50",
      })

      if (searchTerm) {
        params.append("search", searchTerm)
      }

      const response = await sdk.client.fetch<PaystackTransactionsResponse>(
        `/admin/paystack/transactions?${params.toString()}`
      )
      return response
    },
  })

  // Handle search with debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchTerm(search)
      setPage(1) // Reset to first page on search
    }, 500)

    return () => clearTimeout(timer)
  }, [search])

  // Handle infinite scroll
  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.innerHeight + window.scrollY
      const scrollThreshold = document.documentElement.scrollHeight - 100

      if (
        scrollPosition >= scrollThreshold &&
        !isLoadingTransactions &&
        transactionsData?.meta &&
        page < transactionsData.meta.pageCount
      ) {
        setPage((prev) => prev + 1)
      }
    }

    window.addEventListener("scroll", handleScroll)
    return () => window.removeEventListener("scroll", handleScroll)
  }, [isLoadingTransactions, transactionsData, page])

  // Prepare revenue chart data (last 30 days)
  const chartData = transactionsData?.data
    ? (() => {
        const last30Days = Array.from({ length: 30 }, (_, i) => {
          const date = new Date()
          date.setDate(date.getDate() - (29 - i))
          return date.toISOString().split("T")[0]
        })

        return last30Days.map((date) => {
          const dayTotal = transactionsData.data
            .filter((tx) => {
              const txDate = new Date(tx.created_at).toISOString().split("T")[0]
              return txDate === date && tx.status === "success"
            })
            .reduce((sum, tx) => sum + tx.amount / 100, 0)

          return {
            date: new Date(date).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            }),
            revenue: dayTotal,
          }
        })
      })()
    : []

  // Format currency
  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency,
    }).format(amount)
  }

  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  return (
    <div className="flex flex-col gap-y-6">
      {/* Account Balance Section */}
      <Container className="p-0">
        <div className="flex items-center justify-between px-6 py-4 border-b border-ui-border-base">
          <Heading level="h2">Live Account Balance</Heading>
        </div>
        <div className="px-6 py-4">
          {isLoadingBalance ? (
            <div className="flex items-center justify-center py-8">
              <Text size="small" className="text-ui-fg-subtle">
                Loading balance...
              </Text>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {balanceData?.balances?.map((balance) => (
                <div
                  key={balance.currency}
                  className="flex flex-col gap-y-2 p-4 bg-ui-bg-subtle rounded-lg"
                >
                  <Text size="small" leading="compact" weight="plus" className="text-ui-fg-subtle">
                    {balance.currency}
                  </Text>
                  <Text size="xlarge" leading="compact" weight="plus">
                    {formatCurrency(balance.balance, balance.currency)}
                  </Text>
                </div>
              ))}
              <div className="flex flex-col gap-y-2 p-4 bg-ui-bg-highlight rounded-lg border border-ui-border-strong">
                <Text size="small" leading="compact" weight="plus" className="text-ui-fg-subtle">
                  Total Received (All Time)
                </Text>
                <Text size="xlarge" leading="compact" weight="plus" className="text-ui-fg-base">
                  {formatCurrency(
                    balanceData?.total_received || 0,
                    balanceData?.balances?.[0]?.currency || "USD"
                  )}
                </Text>
              </div>
            </div>
          )}
        </div>
      </Container>

      {/* Revenue Chart Section */}
      <Container className="p-0">
        <div className="flex items-center justify-between px-6 py-4 border-b border-ui-border-base">
          <Heading level="h2">Revenue (Last 30 Days)</Heading>
        </div>
        <div className="px-6 py-4">
          {isLoadingTransactions ? (
            <div className="flex items-center justify-center py-8">
              <Text size="small" className="text-ui-fg-subtle">
                Loading chart...
              </Text>
            </div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--ui-border-base)" />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: "var(--ui-fg-subtle)", fontSize: 12 }}
                  />
                  <YAxis
                    tick={{ fill: "var(--ui-fg-subtle)", fontSize: 12 }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--ui-bg-base)",
                      border: "1px solid var(--ui-border-base)",
                      borderRadius: "6px",
                    }}
                    formatter={(value: number) =>
                      formatCurrency(value, balanceData?.balances?.[0]?.currency || "USD")
                    }
                  />
                  <Bar dataKey="revenue" fill="var(--ui-fg-interactive)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </Container>

      {/* Transaction History Section */}
      <Container className="p-0">
        <div className="flex items-center justify-between px-6 py-4 border-b border-ui-border-base">
          <Heading level="h2">Payment History</Heading>
          <div className="flex items-center gap-x-2">
            <div className="relative">
              <MagnifyingGlass className="absolute left-2 top-1/2 -translate-y-1/2 text-ui-fg-muted" />
              <Input
                size="small"
                placeholder="Search by Order ID or Reference..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 w-72"
              />
            </div>
          </div>
        </div>
        <div className="divide-y divide-ui-border-base">
          {isLoadingTransactions && page === 1 ? (
            <div className="flex items-center justify-center py-12">
              <Text size="small" className="text-ui-fg-subtle">
                Loading transactions...
              </Text>
            </div>
          ) : !transactionsData?.data || transactionsData.data.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <Text size="small" className="text-ui-fg-subtle">
                No transactions found
              </Text>
            </div>
          ) : (
            <>
              {transactionsData.data.map((transaction) => (
                <div
                  key={transaction.id}
                  className="px-6 py-4 hover:bg-ui-bg-subtle transition-colors"
                >
                  <div className="grid grid-cols-12 gap-x-4 items-center">
                    <div className="col-span-3">
                      <Text size="small" leading="compact" weight="plus">
                        {transaction.reference}
                      </Text>
                      <Text size="xsmall" leading="compact" className="text-ui-fg-subtle">
                        {transaction.customer.email}
                      </Text>
                    </div>
                    <div className="col-span-2">
                      {transaction.metadata?.order_id && (
                        <Text size="small" leading="compact" className="text-ui-fg-subtle">
                          Order: {transaction.metadata.order_id}
                        </Text>
                      )}
                    </div>
                    <div className="col-span-2">
                      <Text size="small" leading="compact" weight="plus">
                        {formatCurrency(transaction.amount / 100, transaction.currency)}
                      </Text>
                    </div>
                    <div className="col-span-2">
                      <Badge
                        size="2xsmall"
                        color={
                          transaction.status === "success"
                            ? "green"
                            : transaction.status === "failed"
                            ? "red"
                            : "grey"
                        }
                      >
                        {transaction.status}
                      </Badge>
                    </div>
                    <div className="col-span-3">
                      <Text size="xsmall" leading="compact" className="text-ui-fg-subtle">
                        {formatDate(transaction.created_at)}
                      </Text>
                    </div>
                  </div>
                </div>
              ))}

              {/* Load more indicator */}
              {isLoadingTransactions && page > 1 && (
                <div className="px-6 py-4 text-center">
                  <Text size="small" className="text-ui-fg-subtle">
                    Loading more transactions...
                  </Text>
                </div>
              )}

              {/* End of results indicator */}
              {transactionsData.meta && page >= transactionsData.meta.pageCount && (
                <div className="px-6 py-4 text-center">
                  <Text size="small" className="text-ui-fg-subtle">
                    End of transaction history
                  </Text>
                </div>
              )}
            </>
          )}
        </div>
      </Container>
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Paystack",
  icon: CreditCard,
})

export default PaystackPage

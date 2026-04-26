import { defineRouteConfig } from "@medusajs/admin-sdk"
import { CreditCard } from "@medusajs/icons"
import { Container, Heading } from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import { useState, useEffect } from "react"
import { Select } from "@medusajs/ui"
import { Label } from "@medusajs/ui"

interface PaystackProvider {
  id: string
  identifier: string
  display_name: string
}

interface BalanceData {
  balance: Array<{
    currency: string
    balance: number
  }>
}

interface Transaction {
  id: number
  reference: string
  amount: number
  currency: string
  status: string
  customer: {
    email: string
  }
  created_at: string
}

interface TransactionsData {
  data: Transaction[]
  meta: {
    total: number
    page: number
    pageCount: number
  }
}

const PaystackPage = () => {
  const [selectedProvider, setSelectedProvider] = useState<string>("")
  const [page, setPage] = useState(1)
  const [searchTerm, setSearchTerm] = useState("")

  // Fetch available Paystack providers
  const { data: providers } = useQuery<PaystackProvider[]>({
    queryKey: ["paystack-providers"],
    queryFn: async () => {
      const res = await fetch("/admin/paystack/providers", {
        credentials: "include",
      })
      if (!res.ok) throw new Error("Failed to fetch providers")
      return res.json()
    },
  })

  // Auto-select first provider when available
  useEffect(() => {
    if (providers && providers.length > 0 && !selectedProvider) {
      setSelectedProvider(providers[0].id)
    }
  }, [providers, selectedProvider])

  // Fetch balance for selected provider
  const { data: balanceData } = useQuery<BalanceData>({
    queryKey: ["paystack-balance", selectedProvider],
    queryFn: async () => {
      const res = await fetch(`/admin/paystack/${selectedProvider}/balance`, {
        credentials: "include",
      })
      if (!res.ok) throw new Error("Failed to fetch balance")
      return res.json()
    },
    enabled: !!selectedProvider,
  })

  // Fetch transactions for selected provider
  const { data: transactionsData } = useQuery<TransactionsData>({
    queryKey: ["paystack-transactions", selectedProvider, page, searchTerm],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        ...(searchTerm && { search: searchTerm }),
      })
      const res = await fetch(
        `/admin/paystack/${selectedProvider}/transactions?${params}`,
        {
          credentials: "include",
        }
      )
      if (!res.ok) throw new Error("Failed to fetch transactions")
      return res.json()
    },
    enabled: !!selectedProvider,
  })

  const handleProviderChange = (value: string) => {
    setSelectedProvider(value)
    setPage(1)
    setSearchTerm("")
  }

  if (!providers || providers.length === 0) {
    return (
      <Container>
        <Heading level="h1">Paystack</Heading>
        <p className="text-ui-fg-subtle">
          No Paystack providers configured. Please check your medusa-config.ts
        </p>
      </Container>
    )
  }

  return (
    <Container>
      <div className="flex items-center justify-between mb-6">
        <Heading level="h1">Paystack</Heading>

        {providers.length > 1 && (
          <div className="flex items-center gap-2">
            <Label>Account:</Label>
            <Select value={selectedProvider} onValueChange={handleProviderChange}>
              <Select.Trigger>
                <Select.Value placeholder="Select provider" />
              </Select.Trigger>
              <Select.Content>
                {providers.map((provider) => (
                  <Select.Item key={provider.id} value={provider.id}>
                    {provider.display_name || provider.identifier}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
          </div>
        )}
      </div>

      {/* Balance Section */}
      <div className="mb-8">
        <Heading level="h2" className="mb-4">
          Account Balance
        </Heading>
        {balanceData ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {balanceData.balance.map((bal) => (
              <div
                key={bal.currency}
                className="border rounded-lg p-4 bg-ui-bg-subtle"
              >
                <p className="text-sm text-ui-fg-subtle">{bal.currency}</p>
                <p className="text-2xl font-semibold">
                  {new Intl.NumberFormat("en-US", {
                    style: "currency",
                    currency: bal.currency,
                  }).format(bal.balance / 100)}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-ui-fg-subtle">Loading balance...</p>
        )}
      </div>

      {/* Transactions Section */}
      <div>
        <Heading level="h2" className="mb-4">
          Recent Transactions
        </Heading>

        {/* Search */}
        <div className="mb-4">
          <input
            type="text"
            placeholder="Search by reference or email..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value)
              setPage(1)
            }}
            className="w-full px-3 py-2 border rounded-lg"
          />
        </div>

        {/* Transactions Table */}
        {transactionsData ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b">
                  <tr>
                    <th className="text-left p-2">Reference</th>
                    <th className="text-left p-2">Amount</th>
                    <th className="text-left p-2">Customer</th>
                    <th className="text-left p-2">Status</th>
                    <th className="text-left p-2">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {transactionsData.data.map((tx) => (
                    <tr key={tx.id} className="border-b">
                      <td className="p-2 font-mono text-sm">{tx.reference}</td>
                      <td className="p-2">
                        {new Intl.NumberFormat("en-US", {
                          style: "currency",
                          currency: tx.currency,
                        }).format(tx.amount / 100)}
                      </td>
                      <td className="p-2">{tx.customer.email}</td>
                      <td className="p-2">
                        <span
                          className={`px-2 py-1 rounded text-xs ${
                            tx.status === "success"
                              ? "bg-green-100 text-green-800"
                              : "bg-yellow-100 text-yellow-800"
                          }`}
                        >
                          {tx.status}
                        </span>
                      </td>
                      <td className="p-2 text-sm">
                        {new Date(tx.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-ui-fg-subtle">
                Page {transactionsData.meta.page} of{" "}
                {transactionsData.meta.pageCount} ({transactionsData.meta.total}{" "}
                total)
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1 border rounded disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page >= transactionsData.meta.pageCount}
                  className="px-3 py-1 border rounded disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        ) : (
          <p className="text-ui-fg-subtle">Loading transactions...</p>
        )}
      </div>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Paystack",
  icon: CreditCard,
})

export default PaystackPage

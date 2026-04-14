import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Container, Heading, Text, Input, Button, Badge, Label, Textarea } from "@medusajs/ui"
import { CurrencyDollar, Plus } from "@medusajs/icons"
import { useState } from "react"
import { sdk } from "../lib/client"

const OrderPartialPaymentWidget = ({ data }: { data: any }) => {
  const [isAdding, setIsAdding] = useState(false)
  const [amount, setAmount] = useState("")
  const [reference, setReference] = useState("")
  const [notes, setNotes] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  const order = data

  // Calculate total paid and remaining balance
  const paymentCollection = order.payment_collections?.[0]
  const totalPaid = paymentCollection?.payments?.reduce((sum: number, payment: any) => {
    return sum + (payment.amount || 0)
  }, 0) || 0

  const remaining = order.total - totalPaid
  const isFullyPaid = remaining <= 0

  // Get all payments for this order
  const payments = paymentCollection?.payments || []

  const handleAddPayment = async () => {
    setError("")
    setSuccess("")

    if (!amount || parseFloat(amount) <= 0) {
      setError("Please enter a valid amount")
      return
    }

    if (!reference.trim()) {
      setError("Please enter a payment reference")
      return
    }

    const paymentAmount = parseFloat(amount)

    // Overpayment prevention
    if (paymentAmount > remaining) {
      setError(`Payment amount (${paymentAmount}) exceeds remaining balance (${remaining})`)
      return
    }

    setIsSubmitting(true)

    try {
      await sdk.client.fetch("/admin/paystack/record-manual-payment", {
        method: "POST",
        body: JSON.stringify({
          order_id: order.id,
          amount: paymentAmount,
          reference: reference.trim(),
          notes: notes.trim(),
        }),
      })

      setSuccess(`Manual payment of ${paymentAmount} recorded successfully`)
      setAmount("")
      setReference("")
      setNotes("")
      setIsAdding(false)

      // Reload the page to show updated data
      setTimeout(() => {
        window.location.reload()
      }, 1500)
    } catch (err: any) {
      setError(err.message || "Failed to record payment")
    } finally {
      setIsSubmitting(false)
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: order.currency_code.toUpperCase(),
    }).format(amount)
  }

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
    <Container className="p-0">
      <div className="flex items-center justify-between px-6 py-4 border-b border-ui-border-base">
        <div className="flex items-center gap-x-2">
          <CurrencyDollar className="text-ui-fg-subtle" />
          <Heading level="h2">Partial Payments</Heading>
        </div>
        {!isFullyPaid && !isAdding && (
          <Button size="small" variant="secondary" onClick={() => setIsAdding(true)}>
            <Plus /> Record Manual Payment
          </Button>
        )}
      </div>

      <div className="px-6 py-4">
        {/* Payment Summary */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="flex flex-col gap-y-1 p-3 bg-ui-bg-subtle rounded-lg">
            <Text size="xsmall" className="text-ui-fg-subtle">
              Total Amount
            </Text>
            <Text size="large" weight="plus">
              {formatCurrency(order.total)}
            </Text>
          </div>
          <div className="flex flex-col gap-y-1 p-3 bg-ui-bg-subtle rounded-lg">
            <Text size="xsmall" className="text-ui-fg-subtle">
              Total Paid
            </Text>
            <Text size="large" weight="plus" className="text-ui-fg-interactive">
              {formatCurrency(totalPaid)}
            </Text>
          </div>
          <div className="flex flex-col gap-y-1 p-3 bg-ui-bg-subtle rounded-lg">
            <Text size="xsmall" className="text-ui-fg-subtle">
              Remaining Balance
            </Text>
            <Text size="large" weight="plus" className={isFullyPaid ? "text-green-600" : "text-orange-600"}>
              {formatCurrency(remaining)}
            </Text>
          </div>
        </div>

        {/* Payment Status Badge */}
        <div className="mb-4">
          <Badge
            size="small"
            color={isFullyPaid ? "green" : totalPaid > 0 ? "orange" : "grey"}
          >
            {isFullyPaid ? "Fully Paid" : totalPaid > 0 ? "Partially Paid" : "Unpaid"}
          </Badge>
        </div>

        {/* Add Manual Payment Form */}
        {isAdding && (
          <div className="mb-6 p-4 border border-ui-border-base rounded-lg bg-ui-bg-base">
            <Heading level="h3" className="mb-4">
              Record Manual Payment
            </Heading>
            <Text size="small" className="text-ui-fg-subtle mb-4">
              Record payments made outside of Paystack (e.g., cash, bank transfer, mobile money)
            </Text>

            <div className="flex flex-col gap-y-4">
              <div>
                <Label htmlFor="amount">Amount ({order.currency_code.toUpperCase()})</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={remaining}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  disabled={isSubmitting}
                />
                <Text size="xsmall" className="text-ui-fg-subtle mt-1">
                  Maximum: {formatCurrency(remaining)}
                </Text>
              </div>

              <div>
                <Label htmlFor="reference">Payment Reference *</Label>
                <Input
                  id="reference"
                  type="text"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="e.g., MPESA-ABC123, CHECK-456, CASH-789"
                  disabled={isSubmitting}
                />
                <Text size="xsmall" className="text-ui-fg-subtle mt-1">
                  Enter the transaction reference or receipt number
                </Text>
              </div>

              <div>
                <Label htmlFor="notes">Notes (Optional)</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Additional notes about this payment..."
                  rows={3}
                  disabled={isSubmitting}
                />
              </div>

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <Text size="small" className="text-red-600">
                    {error}
                  </Text>
                </div>
              )}

              {success && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                  <Text size="small" className="text-green-600">
                    {success}
                  </Text>
                </div>
              )}

              <div className="flex items-center gap-x-2">
                <Button
                  variant="primary"
                  onClick={handleAddPayment}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Recording..." : "Record Payment"}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setIsAdding(false)
                    setAmount("")
                    setReference("")
                    setNotes("")
                    setError("")
                    setSuccess("")
                  }}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Payment History */}
        {payments.length > 0 && (
          <div>
            <Heading level="h3" className="mb-3">
              Payment History
            </Heading>
            <div className="divide-y divide-ui-border-base border border-ui-border-base rounded-lg">
              {payments.map((payment: any, index: number) => {
                const isManualPayment = payment.data?.is_manual_payment === true
                const paymentReference = payment.data?.reference || payment.id

                return (
                  <div key={payment.id} className="px-4 py-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-x-2 mb-1">
                          <Text size="small" weight="plus">
                            {formatCurrency(payment.amount)}
                          </Text>
                          {isManualPayment && (
                            <Badge size="2xsmall" color="purple">
                              Manual
                            </Badge>
                          )}
                        </div>
                        <Text size="xsmall" className="text-ui-fg-subtle">
                          Reference: {paymentReference}
                        </Text>
                        {payment.data?.notes && (
                          <Text size="xsmall" className="text-ui-fg-subtle mt-1">
                            Notes: {payment.data.notes}
                          </Text>
                        )}
                      </div>
                      <div className="text-right">
                        <Text size="xsmall" className="text-ui-fg-subtle">
                          {formatDate(payment.created_at)}
                        </Text>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {payments.length === 0 && (
          <div className="text-center py-8">
            <Text size="small" className="text-ui-fg-subtle">
              No payments recorded yet
            </Text>
          </div>
        )}
      </div>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "order.details.after",
})

export default OrderPartialPaymentWidget

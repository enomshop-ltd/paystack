import { defineWidgetConfig } from "@medusajs/admin-sdk";
import { DetailWidgetProps, AdminOrder } from "@medusajs/framework/types";
import { Container, Heading, Text, Button, Input, toast } from "@medusajs/ui";
import { useState } from "react";

// For Medusa Admin V2, UI extensions are React components
const OrderPaymentPaystackWidget = ({
  data: order,
}: DetailWidgetProps<AdminOrder>) => {
  const [stkPhone, setStkPhone] = useState("");
  const [stkAmount, setStkAmount] = useState("");
  const [isStkLoading, setIsStkLoading] = useState(false);

  const [manualAmount, setManualAmount] = useState("");
  const [manualNote, setManualNote] = useState("");
  const [isManualLoading, setIsManualLoading] = useState(false);

  // Compute remaining balance roughly
  const capturedTotal = order.payment_collections?.reduce((acc, pc) => {
    return acc + (pc.payments?.reduce((pAcc, p) => pAcc + (p.captured_at ? p.amount : 0), 0) || 0);
  }, 0) || 0;
  
  const total = order.total || 0;
  const remaining = Math.max(0, total - capturedTotal);

  const handleStkPush = async () => {
    if (!stkPhone || !stkAmount) {
      toast.error("Please enter both phone number and amount");
      return;
    }

    setIsStkLoading(true);
    try {
      const response = await fetch(`/api/admin/orders/${order.id}/paystack/stk-push`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: Number(stkAmount), phone: stkPhone }),
      });

      const data = await response.json();
      if (data.success) {
        toast.success("STK Push initiated successfully");
        setStkPhone("");
        setStkAmount("");
      } else {
        toast.error(data.message || "Failed to initiate STK Push");
      }
    } catch (err: any) {
      toast.error(err.message || "An error occurred");
    } finally {
      setIsStkLoading(false);
    }
  };

  const handleManualPayment = async () => {
    if (!manualAmount) {
      toast.error("Please enter an amount");
      return;
    }

    setIsManualLoading(true);
    try {
      const response = await fetch(`/api/admin/orders/${order.id}/manual-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: Number(manualAmount), note: manualNote }),
      });

      const data = await response.json();
      if (data.success) {
        toast.success("Manual payment recorded successfully");
        setManualAmount("");
        setManualNote("");
        // Ideally reload the page or optimistically update the UI
        window.location.reload();
      } else {
        toast.error(data.message || "Failed to record manual payment");
      }
    } catch (err: any) {
      toast.error(err.message || "An error occurred");
    } finally {
      setIsManualLoading(false);
    }
  };

  return (
    <Container className="p-6">
      <Heading level="h2" className="mb-4">Paystack & Manual Payments</Heading>
      
      <div className="mb-6 flex gap-4">
        <Text><strong>Order Total:</strong> {total} {order.currency_code}</Text>
        <Text><strong>Captured:</strong> {capturedTotal} {order.currency_code}</Text>
        <Text><strong>Remaining:</strong> {remaining} {order.currency_code}</Text>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* STK Push Section */}
        <div className="border border-ui-border-base p-4 rounded-lg">
          <Heading level="h3" className="mb-2">Trigger STK Push (M-Pesa)</Heading>
          <Text className="text-ui-fg-subtle mb-4">Send a mobile money prompt to the customer to collect payment.</Text>
          
          <div className="flex flex-col gap-3">
            <div>
              <Text className="mb-1 text-sm font-medium">Amount</Text>
              <Input
                type="number"
                placeholder={`Remaining: ${remaining}`}
                value={stkAmount}
                onChange={(e) => setStkAmount(e.target.value)}
              />
            </div>
            <div>
              <Text className="mb-1 text-sm font-medium">Phone Number</Text>
              <Input
                type="tel"
                placeholder="e.g. +254712345678"
                value={stkPhone}
                onChange={(e) => setStkPhone(e.target.value)}
              />
            </div>
            <Button
              variant="secondary"
              isLoading={isStkLoading}
              onClick={handleStkPush}
            >
              Send STK Push
            </Button>
          </div>
        </div>

        {/* Manual Payment Section */}
        <div className="border border-ui-border-base p-4 rounded-lg">
          <Heading level="h3" className="mb-2">Record Manual Payment</Heading>
          <Text className="text-ui-fg-subtle mb-4">Record a payment made via cash, bank transfer, etc.</Text>
          
          <div className="flex flex-col gap-3">
            <div>
              <Text className="mb-1 text-sm font-medium">Amount</Text>
              <Input
                type="number"
                placeholder={`Remaining: ${remaining}`}
                value={manualAmount}
                onChange={(e) => setManualAmount(e.target.value)}
              />
            </div>
            <div>
              <Text className="mb-1 text-sm font-medium">Note</Text>
              <Input
                type="text"
                placeholder="e.g. Bank Transfer Ref: 1234"
                value={manualNote}
                onChange={(e) => setManualNote(e.target.value)}
              />
            </div>
            <Button
              variant="secondary"
              isLoading={isManualLoading}
              onClick={handleManualPayment}
            >
              Record Payment
            </Button>
          </div>
        </div>
      </div>
    </Container>
  );
};

export const config = defineWidgetConfig({
  zone: "order.details.after",
});

export default OrderPaymentPaystackWidget;

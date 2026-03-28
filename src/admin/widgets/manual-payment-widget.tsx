import { defineWidgetConfig } from "@medusajs/admin-sdk";
import { Button, Container, Heading, Input, Label, Textarea, toast } from "@medusajs/ui";
import { useState } from "react";

const ManualPaymentWidget = ({ data: order }: { data: any }) => {
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const res = await fetch(`/admin/orders/${order.id}/manual-payment`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: Number(amount),
          reference,
          note,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to record payment");
      }

      toast.success("Success", {
        description: "Manual payment recorded successfully",
      });

      // Reset form
      setAmount("");
      setReference("");
      setNote("");
      
      // Optionally reload the page to reflect the new payment status
      window.location.reload();
    } catch (err: any) {
      toast.error("Error", {
        description: err.message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Container className="p-6 mt-4">
      <Heading level="h2" className="mb-4">Record Manual Payment</Heading>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="amount">Amount</Label>
          <Input
            id="amount"
            type="number"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            placeholder="e.g. 50.00"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="reference">Reference (Optional)</Label>
          <Input
            id="reference"
            type="text"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="e.g. Bank Transfer TXN-123"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="note">Note (Optional)</Label>
          <Textarea
            id="note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Additional details..."
          />
        </div>
        <div className="flex justify-end mt-2">
          <Button type="submit" variant="primary" isLoading={isLoading}>
            Record Payment
          </Button>
        </div>
      </form>
    </Container>
  );
};

export const config = defineWidgetConfig({
  zone: "order.details.after",
});

export default ManualPaymentWidget;

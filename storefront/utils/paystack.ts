export async function triggerPartialPayment(orderId: string, amount: number) {
  try {
    const response = await fetch(`/api/store/orders/${orderId}/paystack/partial`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ amount }),
    });

    const data = await response.json();
    
    if (data.success) {
      // The backend has generated an access_code for the partial payment
      // You can now resume the transaction using Paystack v2 Inline JS
      
      // @ts-ignore
      const paystack = new PaystackPop();
      
      paystack.resumeTransaction(data.data.access_code, {
        onSuccess: (transaction: any) => {
          console.log("Partial payment successful:", transaction);
          // Refresh the page or update order status
          window.location.reload();
        },
        onCancel: () => {
          console.log("User closed the payment window");
        }
      });
      
    } else {
      console.error("Failed to initialize partial payment:", data.message);
      alert(data.message);
    }
  } catch (error) {
    console.error("Error triggering partial payment:", error);
  }
}

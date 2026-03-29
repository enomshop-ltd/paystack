import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import Paystack from "../../../../lib/paystack";

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const logger = req.scope.resolve("logger");
  try {
    const paystackSecret = process.env.PAYSTACK_SECRET_KEY as string;
    if (!paystackSecret) {
      throw new Error("PAYSTACK_SECRET_KEY is not configured.");
    }

    const paystack = new Paystack(paystackSecret);
    const page = parseInt(req.query.page as string) || 1;
    const search = (req.query.search as string) || "";

    logger.info(`[Paystack API] Fetching dashboard data. Page: ${page}, Search: "${search}"`);

    let transactions: any[] = [];
    let currentBalances: Record<string, number> = {};
    let totalsByCurrency: Record<string, number> = {};
    let chartData: any[] = [];

    if (search) {
      // SEARCH MODE
      try {
        // Try to verify as a Paystack reference first
        logger.info(`[Paystack API] Attempting to verify search term as Paystack reference: ${search}`);
        const verifyRes = await paystack.transaction.verify(search);
        if (verifyRes.data) {
          transactions = [verifyRes.data];
          logger.info(`[Paystack API] Found transaction by reference: ${search}`);
        }
      } catch (e) {
        logger.info(`[Paystack API] Search term is not a valid Paystack reference. Attempting order lookup.`);
        // If it fails, try to search Medusa orders by display_id
        if (!isNaN(Number(search))) {
          const query = req.scope.resolve("query");
          const { data: orders } = await query.graph({
            entity: "order",
            fields: ["payment_collections.payments.data"],
            filters: { display_id: Number(search) }
          });
          
          if (orders.length > 0) {
            logger.info(`[Paystack API] Found ${orders.length} orders matching display_id: ${search}`);
            // Extract reference
            for (const order of orders) {
              for (const pc of order.payment_collections || []) {
                for (const payment of pc.payments || []) {
                  const ref = payment.data?.paystackTxRef || payment.data?.reference;
                  if (ref) {
                    try {
                      logger.info(`[Paystack API] Verifying transaction reference from order: ${ref}`);
                      const vRes = await paystack.transaction.verify(ref as string);
                      if (vRes.data) transactions.push(vRes.data);
                    } catch (err) {
                      logger.error(`[Paystack API] Failed to verify transaction reference ${ref}`, err);
                    }
                  }
                }
              }
            }
          } else {
            logger.info(`[Paystack API] No orders found matching display_id: ${search}`);
          }
        }
      }
    } else {
      // NORMAL / PAGINATION MODE
      logger.info(`[Paystack API] Fetching transactions list. Page: ${page}`);
      const response = await paystack.transaction.list({ perPage: 50, page });
      transactions = response.data || [];

      if (page === 1) {
        logger.info(`[Paystack API] Fetching balance and totals for page 1`);
        const [balanceResponse, totalsResponse] = await Promise.all([
          paystack.transaction.balance(),
          paystack.transaction.totals()
        ]);

        const balancesData = balanceResponse.data || [];
        for (const b of balancesData) {
          currentBalances[b.currency] = b.balance / 100;
        }

        const totalsData = totalsResponse.data?.total_volume_by_currency || [];
        for (const t of totalsData) {
          totalsByCurrency[t.currency] = t.amount / 100;
        }

        // Calculate chart data from the first 50 transactions
        const monthlyDataMap: Record<string, Record<string, number>> = {}; 
        for (const tx of transactions) {
          if (tx.status === "success") {
            const amount = tx.amount / 100;
            const currency = (tx.currency || "NGN").toUpperCase();
            const date = new Date(tx.created_at);
            const monthYear = `${date.toLocaleString('default', { month: 'short' })} ${date.getFullYear()}`;
            if (!monthlyDataMap[monthYear]) monthlyDataMap[monthYear] = {};
            monthlyDataMap[monthYear][currency] = (monthlyDataMap[monthYear][currency] || 0) + amount;
          }
        }
        chartData = Object.entries(monthlyDataMap).map(([name, currencies]) => ({
          name,
          ...currencies
        })).reverse();
      }
    }

    const paymentsList: any[] = [];
    for (const tx of transactions) {
      const amount = tx.amount / 100;
      const currency = (tx.currency || "NGN").toUpperCase();
      const customerName = tx.customer?.first_name 
        ? `${tx.customer.first_name} ${tx.customer.last_name || ""}`.trim() 
        : "Guest";
      const orderNumber = tx.metadata?.order_id || tx.metadata?.cart_id || tx.reference;

      let uiStatus = "pending";
      if (tx.status === "success") uiStatus = "captured";
      if (tx.status === "failed" || tx.status === "abandoned" || tx.status === "reversed") uiStatus = "canceled";

      paymentsList.push({
        id: tx.id,
        order_number: orderNumber,
        date: tx.created_at,
        customer_name: customerName,
        customer_email: tx.customer?.email || "N/A",
        amount: amount,
        currency_code: currency,
        status: uiStatus
      });
    }

    logger.info(`[Paystack API] Successfully processed dashboard data. Returning ${paymentsList.length} transactions.`);
    res.json({
      totals: totalsByCurrency,
      balances: currentBalances,
      chart_data: chartData,
      payments: paymentsList,
      has_more: transactions.length === 50
    });
  } catch (error: any) {
    const logger = req.scope.resolve("logger");
    logger.error(`[Paystack API] Error fetching dashboard data`, error);
    res.status(500).json({ message: error.message });
  }
}

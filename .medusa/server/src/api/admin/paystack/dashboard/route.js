"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GET = GET;
const paystack_1 = __importDefault(require("../../../../lib/paystack"));
async function GET(req, res) {
    const logger = req.scope.resolve("logger");
    try {
        const paystackSecret = process.env.PAYSTACK_SECRET_KEY;
        if (!paystackSecret) {
            throw new Error("PAYSTACK_SECRET_KEY is not configured.");
        }
        const paystack = new paystack_1.default(paystackSecret);
        const page = parseInt(req.query.page) || 1;
        const search = req.query.search || "";
        logger.info(`[Paystack API] Fetching dashboard data. Page: ${page}, Search: "${search}"`);
        let transactions = [];
        let currentBalances = {};
        let totalsByCurrency = {};
        let chartData = [];
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
            }
            catch (e) {
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
                                            const vRes = await paystack.transaction.verify(ref);
                                            if (vRes.data)
                                                transactions.push(vRes.data);
                                        }
                                        catch (err) {
                                            logger.error(`[Paystack API] Failed to verify transaction reference ${ref}`, err);
                                        }
                                    }
                                }
                            }
                        }
                    }
                    else {
                        logger.info(`[Paystack API] No orders found matching display_id: ${search}`);
                    }
                }
            }
        }
        else {
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
                const balancesData = balanceResponse.data;
                for (const b of balancesData) {
                    currentBalances[b.currency] = b.balance / 100;
                }
                const totalsData = totalsResponse.data?.total_volume_by_currency;
                for (const t of totalsData) {
                    totalsByCurrency[t.currency] = t.amount / 100;
                }
                const monthlyDataMap = {};
                for (const tx of transactions) {
                    if (tx.status === "success") {
                        const amount = tx.amount / 100;
                        const currency = (tx.currency || "KES").toUpperCase();
                        const date = new Date(tx.created_at);
                        const monthYear = `${date.toLocaleString('default', { month: 'short' })} ${date.getFullYear()}`;
                        if (!monthlyDataMap[monthYear])
                            monthlyDataMap[monthYear] = {};
                        monthlyDataMap[monthYear][currency] = (monthlyDataMap[monthYear][currency] || 0) + amount;
                    }
                }
                chartData = Object.entries(monthlyDataMap).map(([name, currencies]) => ({
                    name,
                    ...currencies
                })).reverse();
            }
        }
        const paymentsList = [];
        for (const tx of transactions) {
            const amount = tx.amount / 100;
            const currency = (tx.currency || "NGN").toUpperCase();
            const customerName = tx.customer?.first_name
                ? `${tx.customer.first_name} ${tx.customer.last_name || ""}`.trim()
                : "Guest";
            const orderNumber = tx.metadata?.order_id || tx.metadata?.cart_id || tx.reference;
            let uiStatus = "pending";
            if (tx.status === "success")
                uiStatus = "captured";
            if (tx.status === "failed" || tx.status === "abandoned" || tx.status === "reversed")
                uiStatus = "canceled";
            paymentsList.push({
                id: tx.id,
                order_number: orderNumber,
                reference: tx.reference,
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
    }
    catch (error) {
        const logger = req.scope.resolve("logger");
        logger.error(`[Paystack API] Error fetching dashboard data`, error);
        res.status(500).json({ message: error.message });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi9zcmMvYXBpL2FkbWluL3BheXN0YWNrL2Rhc2hib2FyZC9yb3V0ZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7OztBQWFBLGtCQWlKQztBQTdKRCx3RUFBZ0Q7QUFZekMsS0FBSyxVQUFVLEdBQUcsQ0FBQyxHQUFrQixFQUFFLEdBQW1CO0lBQy9ELE1BQU0sTUFBTSxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBQzNDLElBQUksQ0FBQztRQUNILE1BQU0sY0FBYyxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsbUJBQTZCLENBQUM7UUFDakUsSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDO1lBQ3BCLE1BQU0sSUFBSSxLQUFLLENBQUMsd0NBQXdDLENBQUMsQ0FBQztRQUM1RCxDQUFDO1FBRUQsTUFBTSxRQUFRLEdBQUcsSUFBSSxrQkFBUSxDQUFDLGNBQWMsQ0FBQyxDQUFDO1FBQzlDLE1BQU0sSUFBSSxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLElBQWMsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNyRCxNQUFNLE1BQU0sR0FBSSxHQUFHLENBQUMsS0FBSyxDQUFDLE1BQWlCLElBQUksRUFBRSxDQUFDO1FBRWxELE1BQU0sQ0FBQyxJQUFJLENBQUMsaURBQWlELElBQUksY0FBYyxNQUFNLEdBQUcsQ0FBQyxDQUFDO1FBRTFGLElBQUksWUFBWSxHQUFVLEVBQUUsQ0FBQztRQUM3QixJQUFJLGVBQWUsR0FBMkIsRUFBRSxDQUFDO1FBQ2pELElBQUksZ0JBQWdCLEdBQTJCLEVBQUUsQ0FBQztRQUNsRCxJQUFJLFNBQVMsR0FBVSxFQUFFLENBQUM7UUFFMUIsSUFBSSxNQUFNLEVBQUUsQ0FBQztZQUNYLGNBQWM7WUFDZCxJQUFJLENBQUM7Z0JBQ0gsOENBQThDO2dCQUM5QyxNQUFNLENBQUMs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
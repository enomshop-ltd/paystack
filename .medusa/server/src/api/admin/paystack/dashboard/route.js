"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GET = GET;
const paystack_1 = __importDefault(require("../../../../lib/paystack"));
async function GET(req, res) {
    try {
        const paystackSecret = process.env.PAYSTACK_SECRET_KEY;
        if (!paystackSecret) {
            throw new Error("PAYSTACK_SECRET_KEY is not configured.");
        }
        const paystack = new paystack_1.default(paystackSecret);
        const page = parseInt(req.query.page) || 1;
        const search = req.query.search || "";
        let transactions = [];
        let currentBalances = {};
        let totalsByCurrency = {};
        let chartData = [];
        if (search) {
            // SEARCH MODE
            try {
                // Try to verify as a Paystack reference first
                const verifyRes = await paystack.transaction.verify(search);
                if (verifyRes.data) {
                    transactions = [verifyRes.data];
                }
            }
            catch (e) {
                // If it fails, try to search Medusa orders by display_id
                if (!isNaN(Number(search))) {
                    const query = req.scope.resolve("query");
                    const { data: orders } = await query.graph({
                        entity: "order",
                        fields: ["payment_collections.payments.data"],
                        filters: { display_id: Number(search) }
                    });
                    if (orders.length > 0) {
                        // Extract reference
                        for (const order of orders) {
                            for (const pc of order.payment_collections || []) {
                                for (const payment of pc.payments || []) {
                                    const ref = payment.data?.paystackTxRef || payment.data?.reference;
                                    if (ref) {
                                        try {
                                            const vRes = await paystack.transaction.verify(ref);
                                            if (vRes.data)
                                                transactions.push(vRes.data);
                                        }
                                        catch (err) { }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        else {
            // NORMAL / PAGINATION MODE
            const response = await paystack.transaction.list({ perPage: 50, page });
            transactions = response.data || [];
            if (page === 1) {
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
                const monthlyDataMap = {};
                for (const tx of transactions) {
                    if (tx.status === "success") {
                        const amount = tx.amount / 100;
                        const currency = (tx.currency || "NGN").toUpperCase();
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
                date: tx.created_at,
                customer_name: customerName,
                customer_email: tx.customer?.email || "N/A",
                amount: amount,
                currency_code: currency,
                status: uiStatus
            });
        }
        res.json({
            totals: totalsByCurrency,
            balances: currentBalances,
            chart_data: chartData,
            payments: paymentsList,
            has_more: transactions.length === 50
        });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi9zcmMvYXBpL2FkbWluL3BheXN0YWNrL2Rhc2hib2FyZC9yb3V0ZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7OztBQUdBLGtCQStIQztBQWpJRCx3RUFBZ0Q7QUFFekMsS0FBSyxVQUFVLEdBQUcsQ0FBQyxHQUFrQixFQUFFLEdBQW1CO0lBQy9ELElBQUksQ0FBQztRQUNILE1BQU0sY0FBYyxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsbUJBQTZCLENBQUM7UUFDakUsSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDO1lBQ3BCLE1BQU0sSUFBSSxLQUFLLENBQUMsd0NBQXdDLENBQUMsQ0FBQztRQUM1RCxDQUFDO1FBRUQsTUFBTSxRQUFRLEdBQUcsSUFBSSxrQkFBUSxDQUFDLGNBQWMsQ0FBQyxDQUFDO1FBQzlDLE1BQU0sSUFBSSxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLElBQWMsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNyRCxNQUFNLE1BQU0sR0FBSSxHQUFHLENBQUMsS0FBSyxDQUFDLE1BQWlCLElBQUksRUFBRSxDQUFDO1FBRWxELElBQUksWUFBWSxHQUFVLEVBQUUsQ0FBQztRQUM3QixJQUFJLGVBQWUsR0FBMkIsRUFBRSxDQUFDO1FBQ2pELElBQUksZ0JBQWdCLEdBQTJCLEVBQUUsQ0FBQztRQUNsRCxJQUFJLFNBQVMsR0FBVSxFQUFFLENBQUM7UUFFMUIsSUFBSSxNQUFNLEVBQUUsQ0FBQztZQUNYLGNBQWM7WUFDZCxJQUFJLENBQUM7Z0JBQ0gsOENBQThDO2dCQUM5QyxNQUFNLFNBQVMsR0FBRyxNQUFNLFFBQVEsQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDO2dCQUM1RCxJQUFJLFNBQVMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztvQkFDbkIsWUFBWSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUks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
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
exports.default = syncPaystackPayments;
const paystack_1 = __importDefault(require("../lib/paystack"));
const core_flows_1 = require("@medusajs/core-flows");
// Helper to prevent hitting Paystack rate limits
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function syncPaystackPayments(container) {
    const logger = container.resolve("logger");
    const query = container.resolve("query");
    logger.info("Starting Paystack payment sync...");
    try {
        const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
        const { data: payments } = await query.graph({
            entity: "payment",
            fields: [
                "id",
                "amount",
                "currency_code",
                "data",
                "created_at"
            ],
            filters: {
                // 1. Only Paystack payments
                payment_session: {
                    provider_id: "pp_paystack",
                },
                // 2. Must be uncaptured (null)
                captured_at: null,
                // 3. Must not be canceled (null)
                canceled_at: null,
                // 4. Must be older than 15 minutes ($lt = Less Than)
                created_at: {
                    $lt: fifteenMinutesAgo,
                },
            },
        });
        const pendingPayments = payments.filter((p) => !p.captured_at &&
            !p.canceled_at &&
            p.created_at && new Date(p.created_at) < fifteenMinutesAgo);
        if (pendingPayments.length === 0) {
            logger.info("No stale pending Paystack payments found.");
            return;
        }
        logger.info(`Found ${pendingPayments.length} stale payments to verify.`);
        // Initialize Paystack client
        const paystack = new paystack_1.default(process.env.PAYSTACK_SECRET_KEY);
        for (const payment of pendingPayments) {
            try {
                const txRef = payment.data?.paystackTxRef;
                if (!txRef)
                    continue;
                const { data, status } = await paystack.transaction.verify(txRef);
                if (status && data.status === "success") {
                    logger.info(`Capturing payment ${payment.id} from Paystack sync`);
                    await (0, core_flows_1.capturePaymentWorkflow)(container).run({
                        input: {
                            payment_id: payment.id,
                        }
                    });
                }
                else if (status && (data.status === "failed" || data.status === "abandoned")) {
                    logger.info(`Canceling failed/abandoned payment ${payment.id} from Paystack sync`);
                }
                await sleep(200);
            }
            catch (error) {
                logger.error(`Error syncing Paystack payment ${payment.id}:`, error);
            }
        }
    }
    catch (error) {
        logger.error("Error running Paystack payment sync job:", error);
    }
}
exports.config = {
    name: "sync-paystack-payments",
    schedule: "*/5 * * * *",
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3luYy1wYXlzdGFjay1wYXltZW50cy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9qb2JzL3N5bmMtcGF5c3RhY2stcGF5bWVudHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBUUEsdUNBK0VDO0FBckZELCtEQUF1QztBQUN2QyxxREFBOEQ7QUFFOUQsaURBQWlEO0FBQ2pELE1BQU0sS0FBSyxHQUFHLENBQUMsRUFBVSxFQUFFLEVBQUUsQ0FBQyxJQUFJLE9BQU8sQ0FBQyxDQUFDLE9BQU8sRUFBRSxFQUFFLENBQUMsVUFBVSxDQUFDLE9BQU8sRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDO0FBRWpFLEtBQUssVUFBVSxvQkFBb0IsQ0FBQyxTQUEwQjtJQUMzRSxNQUFNLE1BQU0sR0FBRyxTQUFTLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBQzNDLE1BQU0sS0FBSyxHQUFHLFNBQVMsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUM7SUFFekMsTUFBTSxDQUFDLElBQUksQ0FBQyxtQ0FBbUMsQ0FBQyxDQUFDO0lBRWpELElBQUksQ0FBQztRQUNILE1BQU0saUJBQWlCLEdBQUcsSUFBSSxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsSUFBSSxDQUFDLENBQUM7UUFFaEUsTUFBTSxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsR0FBRyxNQUFNLEtBQUssQ0FBQyxLQUFLLENBQUM7WUFDM0MsTUFBTSxFQUFFLFNBQVM7WUFDakIsTUFBTSxFQUFFO2dCQUNOLElBQUk7Z0JBQ0osUUFBUTtnQkFDUixlQUFlO2dCQUNmLE1BQU07Z0JBQ04sWUFBWTthQUNiO1lBQ0QsT0FBTyxFQUFFO2dCQUNQLDRCQUE0QjtnQkFDNUIsZUFBZSxFQUFFO29CQUNmLFdBQVcsRUFBRSxhQUFhO2lCQUMzQjtnQkFDRCwrQkFBK0I7Z0JBQy9CLFdBQVcsRUFBRSxJ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
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
    // 1. Resolve the query tool
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
                // Note: query.graph returns 'data' as part of the payment object
                const txRef = payment.data?.paystackTxRef;
                if (!txRef)
                    continue;
                // 3. Verify transaction status with Paystack
                const { data, status } = await paystack.transaction.verify(txRef);
                if (status && data.status === "success") {
                    logger.info(`Capturing payment ${payment.id} from Paystack sync`);
                    // 4. Capture the payment in Medusa
                    await (0, core_flows_1.captureOrderPaymentWorkflow)(container).run({
                        input: {
                            payment_id: payment.id,
                        }
                    });
                }
                else if (status && (data.status === "failed" || data.status === "abandoned")) {
                    logger.info(`Canceling failed/abandoned payment ${payment.id} from Paystack sync`);
                }
                // 5. Sleep for 200ms to respect Paystack API rate limits
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3luYy1wYXlzdGFjay1wYXltZW50cy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9qb2JzL3N5bmMtcGF5c3RhY2stcGF5bWVudHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBUUEsdUNBb0ZDO0FBMUZELCtEQUF1QztBQUN2QyxxREFBbUU7QUFFbkUsaURBQWlEO0FBQ2pELE1BQU0sS0FBSyxHQUFHLENBQUMsRUFBVSxFQUFFLEVBQUUsQ0FBQyxJQUFJLE9BQU8sQ0FBQyxDQUFDLE9BQU8sRUFBRSxFQUFFLENBQUMsVUFBVSxDQUFDLE9BQU8sRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDO0FBRWpFLEtBQUssVUFBVSxvQkFBb0IsQ0FBQyxTQUEwQjtJQUMzRSxNQUFNLE1BQU0sR0FBRyxTQUFTLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBQzNDLDRCQUE0QjtJQUM1QixNQUFNLEtBQUssR0FBRyxTQUFTLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBRXpDLE1BQU0sQ0FBQyxJQUFJLENBQUMsbUNBQW1DLENBQUMsQ0FBQztJQUVqRCxJQUFJLENBQUM7UUFDSCxNQUFNLGlCQUFpQixHQUFHLElBQUksSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLElBQUksQ0FBQyxDQUFDO1FBRWhFLE1BQU0sRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLEdBQUcsTUFBTSxLQUFLLENBQUMsS0FBSyxDQUFDO1lBQzNDLE1BQU0sRUFBRSxTQUFTO1lBQ2pCLE1BQU0sRUFBRTtnQkFDTixJQUFJO2dCQUNKLFFBQVE7Z0JBQ1IsZUFBZTtnQkFDZixNQUFNO2dCQUNOLFlBQVk7YUFDYjtZQUNELE9BQU8sRUFBRTtnQkFDUCw0QkFBNEI7Z0JBQzVCLGVBQWUsRUFBRTtvQkFDZixXQUFXLEVBQUUsYUFBYTtpQkFDM0I7Z0JBQ0QsK0JBQStCO2dCQUMv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
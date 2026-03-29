"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
exports.default = syncPaystackPayments;
const utils_1 = require("@medusajs/framework/utils");
const paystack_1 = __importDefault(require("../lib/paystack"));
// Helper to prevent hitting Paystack rate limits
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function syncPaystackPayments(container) {
    const paymentModuleService = container.resolve(utils_1.Modules.PAYMENT);
    const logger = container.resolve("logger");
    logger.info("Starting Paystack payment sync...");
    try {
        // @ts-ignore
        const payments = await paymentModuleService.listPayments({
            id: "pp_paystack",
        });
        // 2. Filter for pending payments that are OLDER than 15 minutes
        // This prevents race conditions with incoming webhooks
        const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
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
                // 3. Verify transaction status with Paystack
                const { data, status } = await paystack.transaction.verify(txRef);
                if (status && data.status === "success") {
                    logger.info(`Capturing payment ${payment.id} from Paystack sync`);
                    // 4. Capture the payment in Medusa
                    await paymentModuleService.capturePayment({
                        payment_id: payment.id,
                        amount: payment.amount,
                    });
                }
                else if (status && (data.status === "failed" || data.status === "abandoned")) {
                    logger.info(`Canceling failed/abandoned payment ${payment.id} from Paystack sync`);
                    // Optional: You can cancel the payment in Medusa to clean up the database
                    // await paymentModuleService.cancelPayment(payment.id);
                }
                // 5. Sleep for 200ms to respect Paystack API rate limits (approx 5 req/sec)
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
    schedule: "*/15 * * * *", // Runs every 15 minutes
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3luYy1wYXlzdGFjay1wYXltZW50cy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9qb2JzL3N5bmMtcGF5c3RhY2stcGF5bWVudHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBT0EsdUNBaUVDO0FBdkVELHFEQUFvRDtBQUNwRCwrREFBdUM7QUFFdkMsaURBQWlEO0FBQ2pELE1BQU0sS0FBSyxHQUFHLENBQUMsRUFBVSxFQUFFLEVBQUUsQ0FBQyxJQUFJLE9BQU8sQ0FBQyxDQUFDLE9BQU8sRUFBRSxFQUFFLENBQUMsVUFBVSxDQUFDLE9BQU8sRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDO0FBRWpFLEtBQUssVUFBVSxvQkFBb0IsQ0FBQyxTQUEwQjtJQUMzRSxNQUFNLG9CQUFvQixHQUFHLFNBQVMsQ0FBQyxPQUFPLENBQUMsZUFBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQ2hFLE1BQU0sTUFBTSxHQUFHLFNBQVMsQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLENBQUM7SUFFM0MsTUFBTSxDQUFDLElBQUksQ0FBQyxtQ0FBbUMsQ0FBQyxDQUFDO0lBRWpELElBQUksQ0FBQztRQUNMLGFBQWE7UUFDYixNQUFNLFFBQVEsR0FBRyxNQUFNLG9CQUFvQixDQUFDLFlBQVksQ0FBQztZQUN2RCxFQUFFLEVBQUUsYUFBYTtTQUNsQixDQUFDLENBQUM7UUFFRCxnRUFBZ0U7UUFDaEUsdURBQXVEO1FBQ3ZELE1BQU0saUJBQWlCLEdBQUcsSUFBSSxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsSUFBSSxDQUFDLENBQUM7UUFFaEUsTUFBTSxlQUFlLEdBQUcsUUFBUSxDQUFDLE1BQU0sQ0FDckMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUNKLENBQUMsQ0FBQyxDQUFDLFdBQVc7WUFDZCxDQUFDLENBQUMsQ0FBQyxXQUFXO1lBQ2QsQ0FBQyxDQUFDLFVBQVUsSUFBSSxJQUFJLElBQUksQ0FBQyxDQUFDLENBQUMsVUFBaUIsQ0FBQyxHQUFHLGlCQUFpQixDQUNwRSxDQUFDO1FBRUYsSUFBSSxlQUFlLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQ2pDLE1BQU0sQ0FBQyxJQUFJLENBQUMsMkNBQTJDLENBQUMsQ0FBQztZQUN6RCxPQUFPO1FBQ1QsQ0FBQztRQUVELE1BQU0sQ0FBQyxJQUFJLENBQUMsU0FBUyxlQUFlLENBQUMsTUFBTSw0QkFBNEIsQ0FBQyxDQUFDO1FBRXpFLDZCQUE2QjtRQUM3QixNQUFNLFFBQVEsR0FBRyxJQUFJLGtCQUFRLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxtQkFBNkIsQ0FBQyxDQUFDO1FBRXpFLEtBQUssTUFBTSxPQUFPLElBQUksZUFBZSxFQUFFLENBQUM7WUFDdEMsSUFBSSxDQUFDO2dCQUNILE1BQU0sS0FBSyxHQUFHLE9BQU8sQ0FBQyxJQUFJLEVBQUUsYUFBdUIsQ0FBQztnQkFDcEQsSUFBSSxDQUFDLEtBQUs7b0JBQUUsU0FBUztnQkFFckIsNkNBQTZDO2dCQUM3QyxNQUFNLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxHQUFHLE1BQU0sUUFBUSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUM7Z0JBRWxFLElBQUksTUFBTSxJQUFJLElBQUksQ0FBQyxNQUFNLEtBQUssU0FBUyxFQUFFLENBQUM7b0JBQ3hDLE1BQU0sQ0FBQyxJQUFJLENBQUMscUJBQXFCLE9BQU8sQ0FBQyxFQUFFLHFCQUFxQixDQUFDLENBQUM7b0JBRWxFLG1DQUFtQztvQkFDbkMsTUFBTSxvQkFBb0IsQ0FBQyxjQUFjLENBQUM7d0JBQ3hDLFVBQVUsRUFBRSxPQUFPLENBQUMsRUFBRTt3QkFDdEIsTUFBTSxFQUFFLE9BQU8sQ0FBQyxNQUFNO3FCQUN2QixDQUFDLENBQUM7Z0JBQ0wsQ0FBQztxQkFBTSxJQUFJLE1BQU0sSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLEtBQUssUUFBUSxJQUFJLElBQUksQ0FBQyxNQUFNLEtBQUssV0FBVyxDQUFDLEVBQUUsQ0FBQztvQkFDL0UsTUFBTSxDQUFDLElBQUksQ0FBQyxzQ0FBc0MsT0FBTyxDQUFDLEVBQUUscUJBQXFCLENBQUMsQ0FBQztvQkFDbkYsMEVBQTBFO29CQUMxRSx3REFBd0Q7Z0JBQzFELENBQUM7Z0JBRUQsNEVBQTRFO2dCQUM1RSxNQUFNLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUVuQixDQUFDO1lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztnQkFDZixNQUFNLENBQUMsS0FBSyxDQUFDLGtDQUFrQyxPQUFPLENBQUMsRUFBRSxHQUFHLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDdkUsQ0FBQztRQUNILENBQUM7SUFDSCxDQUFDO0lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztRQUNmLE1BQU0sQ0FBQyxLQUFLLENBQUMsMENBQTBDLEVBQUUsS0FBSyxDQUFDLENBQUM7SUFDbEUsQ0FBQztBQUNILENBQUM7QUFFWSxRQUFBLE1BQU0sR0FBRztJQUNwQixJQUFJLEVBQUUsd0JBQXdCO0lBQzlCLFFBQVEsRUFBRSxjQUFjLEVBQUUsd0JBQXdCO0NBQ25ELENBQUMifQ==
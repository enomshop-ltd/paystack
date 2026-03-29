"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
exports.default = syncPaystackPayments;
const utils_1 = require("@medusajs/framework/utils");
const paystack_1 = __importDefault(require("../lib/paystack"));
const core_flows_1 = require("@medusajs/core-flows");
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
                    await (0, core_flows_1.capturePaymentWorkflow)(container).run({
                        input: {
                            payment_id: payment.id,
                        }
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3luYy1wYXlzdGFjay1wYXltZW50cy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9qb2JzL3N5bmMtcGF5c3RhY2stcGF5bWVudHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBUUEsdUNBa0VDO0FBekVELHFEQUFvRDtBQUNwRCwrREFBdUM7QUFDdkMscURBQThEO0FBRTlELGlEQUFpRDtBQUNqRCxNQUFNLEtBQUssR0FBRyxDQUFDLEVBQVUsRUFBRSxFQUFFLENBQUMsSUFBSSxPQUFPLENBQUMsQ0FBQyxPQUFPLEVBQUUsRUFBRSxDQUFDLFVBQVUsQ0FBQyxPQUFPLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQztBQUVqRSxLQUFLLFVBQVUsb0JBQW9CLENBQUMsU0FBMEI7SUFDM0UsTUFBTSxvQkFBb0IsR0FBRyxTQUFTLENBQUMsT0FBTyxDQUFDLGVBQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUNoRSxNQUFNLE1BQU0sR0FBRyxTQUFTLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBRTNDLE1BQU0sQ0FBQyxJQUFJLENBQUMsbUNBQW1DLENBQUMsQ0FBQztJQUVqRCxJQUFJLENBQUM7UUFDTCxhQUFhO1FBQ2IsTUFBTSxRQUFRLEdBQUcsTUFBTSxvQkFBb0IsQ0FBQyxZQUFZLENBQUM7WUFDdkQsRUFBRSxFQUFFLGFBQWE7U0FDbEIsQ0FBQyxDQUFDO1FBRUQsZ0VBQWdFO1FBQ2hFLHVEQUF1RDtRQUN2RCxNQUFNLGlCQUFpQixHQUFHLElBQUksSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLElBQUksQ0FBQyxDQUFDO1FBRWhFLE1BQU0sZUFBZSxHQUFHLFFBQVEsQ0FBQyxNQUFNLENBQ3JDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FDSixDQUFDLENBQUMsQ0FBQyxXQUFXO1lBQ2QsQ0FBQyxDQUFDLENBQUMsV0FBVztZQUNkLENBQUMsQ0FBQyxVQUFVLElBQUksSUFBSSxJQUFJLENBQUMsQ0FBQyxDQUFDLFVBQWlCLENBQUMsR0FBRyxpQkFBaUIsQ0FDcEUsQ0FBQztRQUVGLElBQUksZUFBZSxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUNqQyxNQUFNLENBQUMsSUFBSSxDQUFDLDJDQUEyQyxDQUFDLENBQUM7WUFDekQsT0FBTztRQUNULENBQUM7UUFFRCxNQUFNLENBQUMsSUFBSSxDQUFDLFNBQVMsZUFBZSxDQUFDLE1BQU0sNEJBQTRCLENBQUMsQ0FBQztRQUV6RSw2QkFBNkI7UUFDN0IsTUFBTSxRQUFRLEdBQUcsSUFBSSxrQkFBUSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsbUJBQTZCLENBQUMsQ0FBQztRQUV6RSxLQUFLLE1BQU0sT0FBTyxJQUFJLGVBQWUsRUFBRSxDQUFDO1lBQ3RDLElBQUksQ0FBQztnQkFDSCxNQUFNLEtBQUssR0FBRyxPQUFPLENBQUMsSUFBSSxFQUFFLGFBQXVCLENBQUM7Z0JBQ3BELElBQUksQ0FBQyxLQUFLO29CQUFFLFNBQVM7Z0JBRXJCLDZDQUE2QztnQkFDN0MsTUFBTSxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsR0FBRyxNQUFNLFFBQVEsQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDO2dCQUVsRSxJQUFJLE1BQU0sSUFBSSxJQUFJLENBQUMsTUFBTSxLQUFLLFNBQVMsRUFBRSxDQUFDO29CQUN4QyxNQUFNLENBQUMsSUFBSSxDQUFDLHFCQUFxQixPQUFPLENBQUMsRUFBRSxxQkFBcUIsQ0FBQyxDQUFDO29CQUVsRSxtQ0FBbUM7b0JBQ25DLE1BQU0sSUFBQSxtQ0FBc0IsRUFBQyxTQUFTLENBQUMsQ0FBQyxHQUFHLENBQUM7d0JBQzFDLEtBQUssRUFBRTs0QkFDTCxVQUFVLEVBQUUsT0FBTyxDQUFDLEVBQUU7eUJBQ3ZCO3FCQUNGLENBQUMsQ0FBQztnQkFDTCxDQUFDO3FCQUFNLElBQUksTUFBTSxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sS0FBSyxRQUFRLElBQUksSUFBSSxDQUFDLE1BQU0sS0FBSyxXQUFXLENBQUMsRUFBRSxDQUFDO29CQUMvRSxNQUFNLENBQUMsSUFBSSxDQUFDLHNDQUFzQyxPQUFPLENBQUMsRUFBRSxxQkFBcUIsQ0FBQyxDQUFDO29CQUNuRiwwRUFBMEU7b0JBQzFFLHdEQUF3RDtnQkFDMUQsQ0FBQztnQkFFRCw0RUFBNEU7Z0JBQzVFLE1BQU0sS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBRW5CLENBQUM7WUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO2dCQUNmLE1BQU0sQ0FBQyxLQUFLLENBQUMsa0NBQWtDLE9BQU8sQ0FBQyxFQUFFLEdBQUcsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUN2RSxDQUFDO1FBQ0gsQ0FBQztJQUNILENBQUM7SUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1FBQ2YsTUFBTSxDQUFDLEtBQUssQ0FBQywwQ0FBMEMsRUFBRSxLQUFLLENBQUMsQ0FBQztJQUNsRSxDQUFDO0FBQ0gsQ0FBQztBQUVZLFFBQUEsTUFBTSxHQUFHO0lBQ3BCLElBQUksRUFBRSx3QkFBd0I7SUFDOUIsUUFBUSxFQUFFLGNBQWMsRUFBRSx3QkFBd0I7Q0FDbkQsQ0FBQyJ9
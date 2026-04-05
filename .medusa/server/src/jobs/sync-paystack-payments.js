"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
exports.default = syncPaystackPayments;
const core_flows_1 = require("@medusajs/medusa/core-flows");
const utils_1 = require("@medusajs/framework/utils");
const paystack_1 = __importDefault(require("../lib/paystack"));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function syncPaystackPayments(container) {
    const logger = container.resolve("logger");
    const query = container.resolve("query");
    const paymentModule = container.resolve(utils_1.Modules.PAYMENT);
    logger.info("Starting Paystack payment sync...");
    try {
        const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
        const paystack = new paystack_1.default(process.env.PAYSTACK_SECRET_KEY);
        // --- Part 1: Sync pending payment sessions (authorized but not yet captured as Payment) ---
        // These are sessions created for partial payments that Paystack confirmed but the
        // webhook never fired (e.g., no session_id in metadata at the time).
        try {
            const { data: sessions } = await query.graph({
                entity: "payment_session",
                fields: ["id", "data", "status", "created_at"],
                filters: {
                    provider_id: "pp_paystack",
                    status: "pending",
                },
            });
            const staleSessions = (sessions || []).filter((s) => s.created_at && new Date(s.created_at) < fifteenMinutesAgo);
            if (staleSessions.length > 0) {
                logger.info(`Paystack sync: Found ${staleSessions.length} stale pending payment sessions to verify.`);
            }
            for (const session of staleSessions) {
                try {
                    const txRef = session.data?.paystackTxRef;
                    if (!txRef)
                        continue;
                    const { data, status } = await paystack.transaction.verify(txRef);
                    await sleep(200);
                    if (status && data.status === "success") {
                        logger.info(`Paystack sync: Authorizing stale session ${session.id} (ref: ${txRef})`);
                        try {
                            await paymentModule.authorizePaymentSession(session.id, {});
                            logger.info(`Paystack sync: Session ${session.id} authorized successfully`);
                        }
                        catch (authError) {
                            logger.error(`Paystack sync: Failed to authorize session ${session.id}: ${authError?.message}`);
                        }
                    }
                }
                catch (error) {
                    logger.error(`Paystack sync: Error processing session ${session.id}: ${error?.message}`);
                }
            }
        }
        catch (sessionError) {
            logger.error(`Paystack sync: Error querying pending sessions: ${sessionError?.message}`);
        }
        // --- Part 2: Sync authorized payments not yet captured ---
        // These are payments that were authorized (Payment record exists) but
        // capturePayment was never called.
        try {
            const { data: payments } = await query.graph({
                entity: "payment",
                fields: ["id", "amount", "currency_code", "data", "created_at", "captured_at", "canceled_at"],
                filters: {
                    captured_at: null,
                    canceled_at: null,
                    created_at: {
                        $lt: fifteenMinutesAgo,
                    },
                },
            });
            const pendingPayments = (payments || []).filter((p) => !p.captured_at &&
                !p.canceled_at &&
                p.data?.paystackTxRef);
            if (pendingPayments.length > 0) {
                logger.info(`Paystack sync: Found ${pendingPayments.length} pending payments to verify.`);
            }
            for (const payment of pendingPayments) {
                try {
                    const txRef = payment.data?.paystackTxRef;
                    if (!txRef)
                        continue;
                    const { data, status } = await paystack.transaction.verify(txRef);
                    await sleep(200);
                    if (status && data.status === "success") {
                        logger.info(`Paystack sync: Capturing payment ${payment.id} (ref: ${txRef})`);
                        await (0, core_flows_1.capturePaymentWorkflow)(container).run({
                            input: { payment_id: payment.id },
                        });
                        logger.info(`Paystack sync: Payment ${payment.id} captured successfully`);
                    }
                    else if (status &&
                        (data.status === "failed" || data.status === "abandoned")) {
                        logger.info(`Paystack sync: Skipping failed/abandoned payment ${payment.id}`);
                    }
                }
                catch (error) {
                    logger.error(`Paystack sync: Error syncing payment ${payment.id}: ${error?.message}`);
                }
            }
        }
        catch (paymentError) {
            logger.error(`Paystack sync: Error querying pending payments: ${paymentError?.message}`);
        }
        logger.info("Paystack payment sync complete.");
    }
    catch (error) {
        logger.error("Error running Paystack payment sync job:", error);
    }
}
exports.config = {
    name: "sync-paystack-payments",
    schedule: "*/15 * * * *",
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3luYy1wYXlzdGFjay1wYXltZW50cy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9qb2JzL3N5bmMtcGF5c3RhY2stcGF5bWVudHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBT0EsdUNBNklDO0FBbkpELDREQUFxRTtBQUNyRSxxREFBb0Q7QUFDcEQsK0RBQXVDO0FBRXZDLE1BQU0sS0FBSyxHQUFHLENBQUMsRUFBVSxFQUFFLEVBQUUsQ0FBQyxJQUFJLE9BQU8sQ0FBQyxDQUFDLE9BQU8sRUFBRSxFQUFFLENBQUMsVUFBVSxDQUFDLE9BQU8sRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDO0FBRWpFLEtBQUssVUFBVSxvQkFBb0IsQ0FBQyxTQUEwQjtJQUMzRSxNQUFNLE1BQU0sR0FBRyxTQUFTLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBQzNDLE1BQU0sS0FBSyxHQUFHLFNBQVMsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDekMsTUFBTSxhQUFhLEdBQUcsU0FBUyxDQUFDLE9BQU8sQ0FBQyxlQUFPLENBQUMsT0FBTyxDQUFDLENBQUM7SUFFekQsTUFBTSxDQUFDLElBQUksQ0FBQyxtQ0FBbUMsQ0FBQyxDQUFDO0lBRWpELElBQUksQ0FBQztRQUNILE1BQU0saUJBQWlCLEdBQUcsSUFBSSxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsSUFBSSxDQUFDLENBQUM7UUFDaEUsTUFBTSxRQUFRLEdBQUcsSUFBSSxrQkFBUSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsbUJBQTZCLENBQUMsQ0FBQztRQUV6RSw2RkFBNkY7UUFDN0Ysa0ZBQWtGO1FBQ2xGLHFFQUFxRTtRQUNyRSxJQUFJLENBQUM7WUFDSCxNQUFNLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxHQUFHLE1BQU0sS0FBSyxDQUFDLEtBQUssQ0FBQztnQkFDM0MsTUFBTSxFQUFFLGlCQUFpQjtnQkFDekIsTUFBTSxFQUFFLENBQUMsSUFBSSxFQUFFLE1BQU0sRUFBRSxRQUFRLEVBQUUsWUFBWSxDQUFDO2dCQUM5QyxPQUFPLEVBQUU7b0JBQ1AsV0FBVyxFQUFFLGFBQWE7b0JBQzFCLE1BQU0sRUFBRSxTQUFTO2lCQUNsQjthQUNGLENBQUMsQ0FBQztZQUVILE1BQU0sYUFBYSxHQUFHLENBQUMsUUFBUSxJQUFJLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FDM0MsQ0FBQyxDQUFNLEVBQUUsRUFBRSxDQUNULENBQUMsQ0FBQyxVQUFVLElBQUksSUFBSSxJQUFJLENBQUMsQ0FBQyxDQUFDLFVBQWlCLENBQUMsR0FBRyxpQkFBaUIsQ0FDcEUsQ0FBQztZQUVGLElBQUksYUFBYSxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztnQkFDN0IsTUFBTSxDQUFDLElBQUksQ0FDVCx3QkFBd0IsYUFBYSxDQUFDLE1BQU0sNENBQTRDLENBQ3pGLENBQUM7WUFDSixDQUFDO1lBRUQsS0FBSyxNQUFNLE9BQU8sSUFBSSxhQUFhLEVBQUUsQ0FBQztnQkFDcEMsSUFBSSxDQUFDO29CQUNILE1BQU0sS0FBSyxHQUFJLE9BQU8sQ0FBQyxJQUFZLEVBQUUsYUFBdUIsQ0FBQztvQkFDN0QsSUFBSSxDQUFDLEtBQUs7d0JBQUUsU0FBUztvQkFFckIsTUFBTSxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsR0FBRyxNQUFNLFFBQVEsQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDO29CQUNsRSxNQUFNLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztvQkFFakIsSUFBSSxNQUFNLElBQUksSUFBSSxDQUFDLE1BQU0sS0FBSyxTQUFTLEVBQUUsQ0FBQzt3QkFDeEMsTUFBTSxDQUFDLElBQUksQ0FDVCw0Q0FBNEMsT0FBTyxDQUFDLEVBQUUsVUFBVSxLQUFLLEdBQUcsQ0FDekUsQ0FBQzt3QkFDRixJQUFJLENBQUM7NEJBQ0gsTUFBTSxhQUFhLENBQUMsdUJBQXVCLENBQUMsT0FBTyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQzs0QkFDNUQsTUFBTSxDQUFDLElBQUksQ0FDVCwwQkFBMEIsT0FBTyxDQUFDLEVBQUUsMEJBQTBCLENBQy9ELENBQUM7d0JBQ0osQ0FBQzt3QkFBQyxPQUFPLFNBQWMsRUFBRSxDQUFDOzRCQUN4QixNQUFNLENBQUMsS0FBSyxDQUNWLDhDQUE4QyxPQUFPLENBQUMsRUFBRSxLQUFLLFNBQVMsRUFBRSxPQUFPLEVBQUUsQ0FDbEYsQ0FBQzt3QkFDSixDQUFDO29CQUNILENBQUM7Z0JBQ0gsQ0FBQztnQkFBQyxPQUFPLEtBQVUsRUFBRSxDQUFDO29CQUNwQixNQUFNLENBQUMsS0FBSyxDQUNWLDJDQUEyQyxPQUFPLENBQUMsRUFBRSxLQUFLLEtBQUssRUFBRSxPQUFPLEVBQUUsQ0FDM0UsQ0FBQztnQkFDSixDQUFDO1lBQ0gsQ0FBQztRQUNILENBQUM7UUFBQyxPQUFPLFlBQWlCLEVBQUUsQ0FBQztZQUMzQixNQUFNLENBQUMsS0FBSyxDQUNWLG1EQUFtRCxZQUFZLEVBQUUsT0FBTyxFQUFFLENBQzNFLENBQUM7UUFDSixDQUFDO1FBRUQsNERBQTREO1FBQzVELHNFQUFzRTtRQUN0RSxtQ0FBbUM7UUFDbkMsSUFBSSxDQUFDO1lBQ0gsTUFBTSxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsR0FBRyxNQUFNLEtBQUssQ0FBQyxLQUFLLENBQUM7Z0JBQzNDLE1BQU0sRUFBRSxTQUFTO2dCQUNqQixNQUFNLEVBQUUsQ0FBQyxJQUFJLEVBQUUsUUFBUSxFQUFFLGVBQWUsRUFBRSxNQUFNLEVBQUUsWUFBWSxFQUFFLGFBQWEsRUFBRSxhQUFhLENBQUM7Z0JBQzdGLE9BQU8sRUFBRTtvQkFDUCxXQUFXLEVBQUUsSUFBSTtvQkFDakIsV0FBVyxFQUFFLElBQUk7b0JBQ2pCLFVBQVUsRUFBRTt3QkFDVixHQUFHLEVBQUUsaUJBQWlCO3FCQUN2QjtpQkFDRjthQUNGLENBQUMsQ0FBQztZQUVILE1BQU0sZUFBZSxHQUFHLENBQUMsUUFBUSxJQUFJLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FDN0MsQ0FBQyxDQUFNLEVBQUUsRUFBRSxDQUNULENBQUMsQ0FBQyxDQUFDLFdBQVc7Z0JBQ2QsQ0FBQyxDQUFDLENBQUMsV0FBVztnQkFDYixDQUFDLENBQUMsSUFBWSxFQUFFLGFBQWEsQ0FDakMsQ0FBQztZQUVGLElBQUksZUFBZSxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztnQkFDL0IsTUFBTSxDQUFDLElBQUksQ0FDVCx3QkFBd0IsZUFBZSxDQUFDLE1BQU0sOEJBQThCLENBQzdFLENBQUM7WUFDSixDQUFDO1lBRUQsS0FBSyxNQUFNLE9BQU8sSUFBSSxlQUFlLEVBQUUsQ0FBQztnQkFDdEMsSUFBSSxDQUFDO29CQUNILE1BQU0sS0FBSyxHQUFJLE9BQU8sQ0FBQyxJQUFZLEVBQUUsYUFBdUIsQ0FBQztvQkFDN0QsSUFBSSxDQUFDLEtBQUs7d0JBQUUsU0FBUztvQkFFckIsTUFBTSxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsR0FBRyxNQUFNLFFBQVEsQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDO29CQUNsRSxNQUFNLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztvQkFFakIsSUFBSSxNQUFNLElBQUksSUFBSSxDQUFDLE1BQU0sS0FBSyxTQUFTLEVBQUUsQ0FBQzt3QkFDeEMsTUFBTSxDQUFDLElBQUksQ0FDVCxvQ0FBb0MsT0FBTyxDQUFDLEVBQUUsVUFBVSxLQUFLLEdBQUcsQ0FDakUsQ0FBQzt3QkFDRixNQUFNLElBQUEsbUNBQXNCLEVBQUMsU0FBUyxDQUFDLENBQUMsR0FBRyxDQUFDOzRCQUMxQyxLQUFLLEVBQUUsRUFBRSxVQUFVLEVBQUUsT0FBTyxDQUFDLEVBQUUsRUFBRTt5QkFDbEMsQ0FBQyxDQUFDO3dCQUNILE1BQU0sQ0FBQyxJQUFJLENBQ1QsMEJBQTBCLE9BQU8sQ0FBQyxFQUFFLHdCQUF3QixDQUM3RCxDQUFDO29CQUNKLENBQUM7eUJBQU0sSUFDTCxNQUFNO3dCQUNOLENBQUMsSUFBSSxDQUFDLE1BQU0sS0FBSyxRQUFRLElBQUksSUFBSSxDQUFDLE1BQU0sS0FBSyxXQUFXLENBQUMsRUFDekQsQ0FBQzt3QkFDRCxNQUFNLENBQUMsSUFBSSxDQUNULG9EQUFvRCxPQUFPLENBQUMsRUFBRSxFQUFFLENBQ2pFLENBQUM7b0JBQ0osQ0FBQztnQkFDSCxDQUFDO2dCQUFDLE9BQU8sS0FBVSxFQUFFLENBQUM7b0JBQ3BCLE1BQU0sQ0FBQyxLQUFLLENBQ1Ysd0NBQXdDLE9BQU8sQ0FBQyxFQUFFLEtBQUssS0FBSyxFQUFFLE9BQU8sRUFBRSxDQUN4RSxDQUFDO2dCQUNKLENBQUM7WUFDSCxDQUFDO1FBQ0gsQ0FBQztRQUFDLE9BQU8sWUFBaUIsRUFBRSxDQUFDO1lBQzNCLE1BQU0sQ0FBQyxLQUFLLENBQ1YsbURBQW1ELFlBQVksRUFBRSxPQUFPLEVBQUUsQ0FDM0UsQ0FBQztRQUNKLENBQUM7UUFFRCxNQUFNLENBQUMsSUFBSSxDQUFDLGlDQUFpQyxDQUFDLENBQUM7SUFDakQsQ0FBQztJQUFDLE9BQU8sS0FBVSxFQUFFLENBQUM7UUFDcEIsTUFBTSxDQUFDLEtBQUssQ0FBQywwQ0FBMEMsRUFBRSxLQUFLLENBQUMsQ0FBQztJQUNsRSxDQUFDO0FBQ0gsQ0FBQztBQUVZLFFBQUEsTUFBTSxHQUFHO0lBQ3BCLElBQUksRUFBRSx3QkFBd0I7SUFDOUIsUUFBUSxFQUFFLGNBQWM7Q0FDekIsQ0FBQyJ9
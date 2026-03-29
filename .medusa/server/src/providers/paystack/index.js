"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const utils_1 = require("@medusajs/framework/utils");
const paystack_payment_processor_1 = __importDefault(require("../../services/paystack-payment-processor"));
exports.default = (0, utils_1.ModuleProvider)(utils_1.Modules.PAYMENT, {
    services: [paystack_payment_processor_1.default],
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi9zcmMvcHJvdmlkZXJzL3BheXN0YWNrL2luZGV4LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7O0FBQUEscURBQW9FO0FBQ3BFLDJHQUFpRjtBQUVqRixrQkFBZSxJQUFBLHNCQUFjLEVBQUMsZUFBTyxDQUFDLE9BQU8sRUFBRTtJQUM3QyxRQUFRLEVBQUUsQ0FBQyxvQ0FBd0IsQ0FBQztDQUNyQyxDQUFDLENBQUMifQ==
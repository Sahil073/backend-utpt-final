"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DailySolveLog = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const ProblemSchema = new mongoose_1.Schema({
    id: { type: String, required: true },
    platform: { type: String, enum: ["leetcode", "codeforces"], required: true },
    difficulty: { type: String, enum: ["easy", "medium", "hard"], required: true },
}, { _id: false });
const DailySolveLogSchema = new mongoose_1.Schema({
    user_id: { type: String, required: true },
    date: { type: String, required: true }, // "YYYY-MM-DD"
    lc_solved: { type: Number, default: 0 },
    cf_solved: { type: Number, default: 0 },
    total_solved: { type: Number, default: 0 },
    problems: { type: [ProblemSchema], default: [] },
}, { timestamps: false });
// One document per user per day
DailySolveLogSchema.index({ user_id: 1, date: -1 });
exports.DailySolveLog = mongoose_1.default.model("DailySolveLog", DailySolveLogSchema);

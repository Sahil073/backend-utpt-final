"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateUpdateProfile = void 0;
const express_validator_1 = require("express-validator");
exports.validateUpdateProfile = [
    (0, express_validator_1.body)("github_username")
        .optional()
        .trim()
        .isLength({ max: 39 }).withMessage("GitHub username too long"),
    (0, express_validator_1.body)("leetcode_username")
        .optional()
        .trim()
        .isLength({ max: 50 }).withMessage("LeetCode username too long"),
    (0, express_validator_1.body)("codeforces_username")
        .optional()
        .trim()
        .isLength({ max: 50 }).withMessage("Codeforces handle too long"),
    (0, express_validator_1.body)("batch")
        .optional()
        .trim()
        .isLength({ max: 20 }).withMessage("Batch value too long"),
    (0, express_validator_1.body)("specialization")
        .optional()
        .trim()
        .isIn(["CSE", "IT", "ECE", "ME", "CE", "EE"])
        .withMessage("Invalid specialization"),
];

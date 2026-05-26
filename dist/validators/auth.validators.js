"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateLogin = void 0;
const express_validator_1 = require("express-validator");
exports.validateLogin = [
    (0, express_validator_1.body)("collegeId")
        .trim()
        .notEmpty().withMessage("collegeId is required")
        .isLength({ min: 3, max: 50 }).withMessage("Invalid college ID format"),
    (0, express_validator_1.body)("password")
        .notEmpty().withMessage("password is required"),
];

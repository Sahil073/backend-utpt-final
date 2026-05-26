"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateCreateQuestion = exports.validateImportStudents = exports.validateSendNotification = void 0;
const express_validator_1 = require("express-validator");
exports.validateSendNotification = [
    (0, express_validator_1.body)("title")
        .trim()
        .notEmpty().withMessage("title is required")
        .isLength({ max: 100 }).withMessage("title too long"),
    (0, express_validator_1.body)("body")
        .trim()
        .notEmpty().withMessage("body is required")
        .isLength({ max: 500 }).withMessage("body too long"),
    (0, express_validator_1.body)("target")
        .trim()
        .notEmpty().withMessage("target is required")
        .isIn(["all", "batch", "user"]).withMessage("target must be all | batch | user"),
    (0, express_validator_1.body)("batch")
        .optional()
        .trim()
        .isLength({ max: 20 }),
    (0, express_validator_1.body)("userId")
        .optional()
        .trim()
        .isUUID().withMessage("userId must be a valid UUID"),
];
exports.validateImportStudents = [
    (0, express_validator_1.body)("students")
        .isArray({ min: 1 }).withMessage("students must be a non-empty array"),
    (0, express_validator_1.body)("students.*.name")
        .trim()
        .notEmpty().withMessage("Each student must have a name"),
    (0, express_validator_1.body)("students.*.college_id")
        .trim()
        .notEmpty().withMessage("Each student must have a college_id"),
    (0, express_validator_1.body)("students.*.email")
        .trim()
        .isEmail().withMessage("Each student must have a valid email"),
    (0, express_validator_1.body)("students.*.batch")
        .trim()
        .notEmpty().withMessage("Each student must have a batch"),
];
exports.validateCreateQuestion = [
    (0, express_validator_1.body)("title")
        .trim()
        .notEmpty().withMessage("title is required")
        .isLength({ max: 200 }).withMessage("title too long"),
    (0, express_validator_1.body)("difficulty")
        .trim()
        .notEmpty().withMessage("difficulty is required")
        .isIn(["easy", "medium", "hard"]).withMessage("difficulty must be easy | medium | hard"),
    (0, express_validator_1.body)("tags")
        .optional()
        .isArray().withMessage("tags must be an array"),
    (0, express_validator_1.body)("platform_link")
        .optional()
        .trim()
        .isURL().withMessage("platform_link must be a valid URL"),
];

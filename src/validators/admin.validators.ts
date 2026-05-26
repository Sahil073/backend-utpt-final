import { body } from "express-validator";

export const validateSendNotification = [
  body("title")
    .trim()
    .notEmpty().withMessage("title is required")
    .isLength({ max: 100 }).withMessage("title too long"),
  body("body")
    .trim()
    .notEmpty().withMessage("body is required")
    .isLength({ max: 500 }).withMessage("body too long"),
  body("target")
    .trim()
    .notEmpty().withMessage("target is required")
    .isIn(["all", "batch", "user"]).withMessage("target must be all | batch | user"),
  body("batch")
    .optional()
    .trim()
    .isLength({ max: 20 }),
  body("userId")
    .optional()
    .trim()
    .isUUID().withMessage("userId must be a valid UUID"),
];

export const validateImportStudents = [
  body("students")
    .isArray({ min: 1 }).withMessage("students must be a non-empty array"),
  body("students.*.name")
    .trim()
    .notEmpty().withMessage("Each student must have a name"),
  body("students.*.college_id")
    .trim()
    .notEmpty().withMessage("Each student must have a college_id"),
  body("students.*.email")
    .trim()
    .isEmail().withMessage("Each student must have a valid email"),
  body("students.*.batch")
    .trim()
    .notEmpty().withMessage("Each student must have a batch"),
];

export const validateCreateQuestion = [
  body("title")
    .trim()
    .notEmpty().withMessage("title is required")
    .isLength({ max: 200 }).withMessage("title too long"),
  body("difficulty")
    .trim()
    .notEmpty().withMessage("difficulty is required")
    .isIn(["easy", "medium", "hard"]).withMessage("difficulty must be easy | medium | hard"),
  body("tags")
    .optional()
    .isArray().withMessage("tags must be an array"),
  body("platform_link")
    .optional()
    .trim()
    .isURL().withMessage("platform_link must be a valid URL"),
];
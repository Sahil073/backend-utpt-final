import { body } from "express-validator";

export const validateUpdateProfile = [
  body("github_username")
    .optional()
    .trim()
    .isLength({ max: 39 }).withMessage("GitHub username too long"),
  body("leetcode_username")
    .optional()
    .trim()
    .isLength({ max: 50 }).withMessage("LeetCode username too long"),
  body("codeforces_username")
    .optional()
    .trim()
    .isLength({ max: 50 }).withMessage("Codeforces handle too long"),
  body("batch")
    .optional()
    .trim()
    .isLength({ max: 20 }).withMessage("Batch value too long"),
  body("specialization")
    .optional()
    .trim()
    .isIn(["CSE", "IT", "ECE", "ME", "CE", "EE"])
    .withMessage("Invalid specialization"),
];
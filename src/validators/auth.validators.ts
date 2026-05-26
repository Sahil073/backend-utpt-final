import { body } from "express-validator";

export const validateLogin = [
  body("collegeId")
    .trim()
    .notEmpty().withMessage("collegeId is required")
    .isLength({ min: 3, max: 50 }).withMessage("Invalid college ID format"),
  body("password")
    .notEmpty().withMessage("password is required"),
];

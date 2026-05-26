import { Router } from "express";
import {
  getQuestions, createQuestion,
  updateQuestion, deleteQuestion,
} from "../controllers/question.controller";
import { verifyToken, requireRole } from "../middleware/auth.middleware";
import { validate } from "../middleware/validate.middleware";
import { validateCreateQuestion } from "../validators/admin.validators";

const router = Router();
router.use(verifyToken);

router.get("/",       getQuestions);
router.post("/",      requireRole("trainer", "admin"), validateCreateQuestion, validate, createQuestion);
router.put("/:id",    requireRole("trainer", "admin"), updateQuestion);
router.delete("/:id", requireRole("admin"),            deleteQuestion);

export default router;
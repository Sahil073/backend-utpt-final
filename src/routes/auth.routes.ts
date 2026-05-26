import { Router } from "express";
import { login, refreshToken, logout } from "../controllers/auth.controller";
import { verifyToken } from "../middleware/auth.middleware";
import { validate } from "../middleware/validate.middleware";
import { validateLogin } from "../validators/auth.validators";
import { authLimiter } from "../middleware/rateLimit.middleware";

const router = Router();

router.post("/login",   authLimiter, validateLogin, validate, login);
router.post("/refresh", refreshToken);
router.post("/logout",  verifyToken, logout);

export default router;

import { Router } from "express";
import {
  getMyNotifications,
  markOneRead,
  markAllRead,
  saveFcmToken,
} from "../controllers/notification.controller";
import { verifyToken } from "../middleware/auth.middleware";

const router = Router();

router.use(verifyToken);

router.get("/", getMyNotifications);
// FIX: /read-all MUST come before /:id/read — otherwise Express matches
// "read-all" as the :id parameter and calls markOneRead instead of markAllRead
router.patch("/read-all", markAllRead);
router.patch("/:id/read", markOneRead);

export default router;
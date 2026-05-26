import { Router } from "express";
import {
  getMyProfile, updateMyProfile,
  uploadAvatar as uploadAvatarController,
  getMyStats, getStudentById,
  searchStudents, triggerGitHubSync,
  triggerCodingSync, getMySolveHistory,
  changePassword,
} from "../controllers/student.controller";
import { saveFcmToken } from "../controllers/notification.controller";
import { verifyToken, requireRole } from "../middleware/auth.middleware";
import { uploadAvatar } from "../middleware/upload.middleware";
import { validate } from "../middleware/validate.middleware";
import { validateUpdateProfile } from "../validators/student.validators";

const router = Router();
router.use(verifyToken);

router.get("/me",               getMyProfile);
router.put("/me",               validateUpdateProfile, validate, updateMyProfile);
router.put("/me/password",      changePassword);
router.get("/me/stats",         getMyStats);
router.get("/me/history",       getMySolveHistory);
router.post("/me/avatar",       uploadAvatar.single("avatar"), uploadAvatarController);
router.post("/me/sync/github",  triggerGitHubSync);
router.post("/me/sync/coding",  triggerCodingSync);
router.put("/me/fcm-token",     saveFcmToken);

router.get("/",     requireRole("trainer", "admin"), searchStudents);
router.get("/:id",  getStudentById);

export default router;

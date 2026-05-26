import { Router } from "express";
import {
  getDashboard, getAllStudents, getStudentDetail,
  getPoorPerformers, getTopPerformers, getFullLeaderboard,
  sendAdminNotification, importStudents, importStudentsFromFile,
  toggleStudentActive, getActivityAnalytics, getGrowthAnalytics,
  getBatchAnalytics, createTrainer, searchStudentByEmail,
} from "../controllers/admin.controller";
import { verifyToken, requireRole } from "../middleware/auth.middleware";
import { validate } from "../middleware/validate.middleware";
import {
  validateSendNotification,
  validateImportStudents,
} from "../validators/admin.validators";
import { uploadStudentFile } from "../middleware/upload.middleware";

const router = Router();
router.use(verifyToken);
router.use(requireRole("admin", "trainer"));

router.get("/dashboard",                  getDashboard);
router.get("/students",                   getAllStudents);
router.get("/students/search",            searchStudentByEmail);
router.get("/students/:id/detail",        getStudentDetail);
router.get("/poor-performers",            getPoorPerformers);
router.get("/top-performers",             getTopPerformers);
router.get("/leaderboard",                getFullLeaderboard);
router.get("/analytics/activity",         getActivityAnalytics);
router.get("/analytics/growth",           getGrowthAnalytics);
router.get("/analytics/batch",            getBatchAnalytics);

// Admin-only actions
router.post("/create-trainer",             requireRole("admin"), createTrainer);
router.post("/notify/send",                requireRole("admin"), validateSendNotification, validate, sendAdminNotification);
router.post("/import-students",            requireRole("admin"), validateImportStudents, validate, importStudents);
router.post("/import-students/file",       requireRole("admin"), uploadStudentFile.single("file"), importStudentsFromFile);
router.put("/students/:id/toggle-active",  requireRole("admin"), toggleStudentActive);

export default router;

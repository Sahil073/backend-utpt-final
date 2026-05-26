import { Router } from "express";
import {
  getResources,
  uploadResource,
  deleteResource,
} from "../controllers/resource.controller";
import { verifyToken, requireRole } from "../middleware/auth.middleware";
import { uploadPDF } from "../middleware/upload.middleware";

const router = Router();

router.use(verifyToken);

router.get("/", getResources);

// File upload is optional — frontend may send JSON with file_url instead
router.post("/", requireRole("trainer", "admin"), (req, res, next) => {
  uploadPDF.single("file")(req, res, (err) => {
    // Ignore multer errors (e.g. no file uploaded) — controller handles both cases
    next();
  });
}, uploadResource);

router.delete("/:id", requireRole("trainer", "admin"), deleteResource);

export default router;

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const resource_controller_1 = require("../controllers/resource.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const upload_middleware_1 = require("../middleware/upload.middleware");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.verifyToken);
router.get("/", resource_controller_1.getResources);
// File upload is optional — frontend may send JSON with file_url instead
router.post("/", (0, auth_middleware_1.requireRole)("trainer", "admin"), (req, res, next) => {
    upload_middleware_1.uploadPDF.single("file")(req, res, (err) => {
        // Ignore multer errors (e.g. no file uploaded) — controller handles both cases
        next();
    });
}, resource_controller_1.uploadResource);
router.delete("/:id", (0, auth_middleware_1.requireRole)("trainer", "admin"), resource_controller_1.deleteResource);
exports.default = router;

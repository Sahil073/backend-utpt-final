"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const notification_controller_1 = require("../controllers/notification.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.verifyToken);
router.get("/", notification_controller_1.getMyNotifications);
// FIX: /read-all MUST come before /:id/read — otherwise Express matches
// "read-all" as the :id parameter and calls markOneRead instead of markAllRead
router.patch("/read-all", notification_controller_1.markAllRead);
router.patch("/:id/read", notification_controller_1.markOneRead);
exports.default = router;

import { Router } from "express";
import {
  getGlobalLeaderboard,
  getBatchLeaderboard,
  getSpecLeaderboard,
  getFilteredLeaderboard,
  getMyRank,
} from "../controllers/leaderboard.controller";
import { verifyToken } from "../middleware/auth.middleware";

const router = Router();

router.use(verifyToken);

router.get("/global",                 getGlobalLeaderboard);
router.get("/filter",                 getFilteredLeaderboard);
router.get("/batch/:batch",           getBatchLeaderboard);
router.get("/specialization/:spec",   getSpecLeaderboard);
router.get("/my-rank",                getMyRank);

export default router;

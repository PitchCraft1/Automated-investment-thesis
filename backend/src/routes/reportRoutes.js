import { Router } from "express";
import { clearReportHistory, downloadReport, getReport, listReports, publicDownloadReport, uploadDeck } from "../controllers/reportController.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { upload } from "../middleware/uploadMiddleware.js";

const router = Router();

router.get("/public/:reportId/download", publicDownloadReport);

router.use(requireAuth);
router.get("/", listReports);
router.delete("/", clearReportHistory);
router.get("/:reportId", getReport);
router.get("/:reportId/download", downloadReport);
router.post("/upload", upload.single("pitchDeck"), uploadDeck);

export default router;

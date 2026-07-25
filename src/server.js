import "dotenv/config";
import express from "express";
import previewRouter from "./routes/preview.js";
import jobsRouter from "./routes/jobs.js";
import uploadRouter from "./routes/upload.js";
import finalizeRouter from "./routes/finalize.js";
import questionnaireRouter from "./routes/questionnaire.js";
import improveAnswerRouter from "./routes/improveAnswer.js";
import draftsRouter from "./routes/drafts.js";
import woocommerceAuthRouter from "./routes/woocommerceAuth.js";
import creditsRouter from "./routes/credits.js";
import commerceCreditsRouter from "./routes/commerceCredits.js";
import commerceCheckoutRouter from "./routes/commerceCheckout.js";
import deliveriesRouter from "./routes/deliveries.js";
import previewRepairRouter from "./routes/previewRepair.js";
import previewModificationsRouter from "./routes/previewModifications.js";
import familySharesRouter from "./routes/familyShares.js";
import narrationRouter from "./routes/narration.js";
import storyScenarioRouter from "./routes/storyScenario.js";
import storyIntentionsRouter from "./routes/storyIntentions.js";
import storySuggestionsRouter from "./routes/storySuggestions.js";
import { projectStore } from "./services/projectStore.js";
import { familyShareStore } from "./services/familyShareStore.js";
import { configureImageMemory, logMemory } from "./services/runtimeMemory.js";
import { interactiveReaderInstallManifest } from "./services/interactiveReaderInstallManifest.js";
import { startProjectDeletionCleanupWorker } from "./services/projectDeletion.js";

const app = express();
const imageMemory = configureImageMemory();
app.set("trust proxy", 1);
app.use(express.json({ limit: "2mb" }));
app.get("/interactive-reader/install-manifest.webmanifest", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.type("application/manifest+json").json(interactiveReaderInstallManifest({
    projectId: req.query.project,
    language: req.query.lang,
  }));
});
app.use(express.static("public"));
app.use("/fonts", express.static("assets/fonts"));

// Serve generated images
app.use("/outputs", express.static("data/outputs"));

// Reference photos are written to private object storage. They are never exposed as static files.
app.use("/api", uploadRouter);

// Health check (Render)
app.get("/health", (req, res) => res.json({ ok: true }));

// Routes
app.use("/api", previewRouter);
app.use("/api", finalizeRouter);
app.use("/api", jobsRouter);
app.use("/api", questionnaireRouter);
app.use("/api", improveAnswerRouter);
app.use("/api", draftsRouter);
app.use("/api", storyScenarioRouter);
app.use("/api", storyIntentionsRouter);
app.use("/api", storySuggestionsRouter);
app.use("/api", woocommerceAuthRouter);
app.use("/api", creditsRouter);
app.use("/api", commerceCreditsRouter);
app.use("/api", commerceCheckoutRouter);
app.use("/api", deliveriesRouter);
app.use("/api", previewRepairRouter);
app.use("/api", previewModificationsRouter);
app.use("/api", narrationRouter);
app.use(familySharesRouter);

const port = process.env.PORT || 3000;
await projectStore.initialize();
await familyShareStore.initialize();
startProjectDeletionCleanupWorker();
app.listen(port, () => {
  logMemory("server.ready", { sharpConcurrency: imageMemory.concurrency, sharpCacheMemoryMb: imageMemory.memoryMb });
  console.log(`✅ Server listening on port ${port}`);
});

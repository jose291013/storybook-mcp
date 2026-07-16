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
import { projectStore } from "./services/projectStore.js";

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "2mb" }));
app.use(express.static("public"));
app.use("/fonts", express.static("assets/fonts"));

// Serve generated images
app.use("/outputs", express.static("data/outputs"));

// Uploads
app.use("/api", uploadRouter);
app.use("/uploads", express.static("data/uploads"));

// Health check (Render)
app.get("/health", (req, res) => res.json({ ok: true }));

// Routes
app.use("/api", previewRouter);
app.use("/api", finalizeRouter);
app.use("/api", jobsRouter);
app.use("/api", questionnaireRouter);
app.use("/api", improveAnswerRouter);
app.use("/api", draftsRouter);
app.use("/api", woocommerceAuthRouter);
app.use("/api", creditsRouter);
app.use("/api", commerceCreditsRouter);
app.use("/api", commerceCheckoutRouter);

const port = process.env.PORT || 3000;
await projectStore.initialize();
app.listen(port, () => {
  console.log(`✅ Server listening on port ${port}`);
});

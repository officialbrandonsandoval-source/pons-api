import express from "express";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";

import crmProviders from "./crmProviders.js";
import { detectLeaks as leakDetector } from "./leakDetector.js";

dotenv.config();

const app = express();
app.use(express.json());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
});
app.use(limiter);

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

app.get("/providers", (req, res) => {
  res.json(crmProviders);
});

app.post("/audit", (req, res) => {
  const result = leakDetector(req.body);
  res.json(result);
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`PONS API listening on port ${PORT}`);
});
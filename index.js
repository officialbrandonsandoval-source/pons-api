const express = require("express");
const cors = require("cors");

const app = express();
app.use(express.json());

app.use(
  cors({
    origin: [
      "https://pons.solutions",
      "https://www.pons.solutions",
      "https://pons-revenue-leak-detector-219733399964.us-west1.run.app"
    ],
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  })
);

app.options("*", cors());

// HEALTH CHECK
app.get("/", (req, res) => {
  res.send("PONS API OK");
});

// AUDIT ENDPOINT
app.post("/audit", (req, res) => {
  res.json({
    generated_at: new Date().toISOString(),
    leaks: [
      {
        id: "unworked_high_intent_leads",
        severity: "CRITICAL",
        revenue_at_risk: 21500,
        cause: "2 inbound leads untouched for over 36 hours",
        recommended_action: "Call top 5 inbound leads immediately",
        time_sensitivity: "Delay >48h reduces recovery odds by ~60%",
        priority_score: 34400,
      },
    ],
  });
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`PONS API listening on ${port}`);
});

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/", (req, res) => {
  res.status(200).send("NeedNetAI server is running!");
});

app.post("/api/analyze", async (req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "GEMINI_API_KEY is missing. Check your .env file."
      });
    }

    const ai = new GoogleGenAI({ apiKey });

    const prompt = `
You are NeedNetAI, an AI assistant for hospital-to-hospital
medical supply sharing.

Analyze the information provided below.

Explain:
1. The requesting hospital and its requested item.
2. The potential donor hospital and its available surplus.
3. Whether the surplus appears sufficient for the request.
4. The potential benefits of the proposed match.
5. What a human coordinator must verify before approving a transfer.

Never claim a transfer has already occurred.
Never invent missing stock information.
Do not authorize medical supply transfers.
A human coordinator must verify stock, expiry, storage,
transport and hospital authorization.

Hospital request and inventory data:
${JSON.stringify(req.body, null, 2)}
`;

    console.log("Sending analysis request to Gemini...");

    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
      contents: prompt
    });

    const analysis =
      response.text || "Gemini did not return an analysis.";

    console.log("Gemini analysis generated successfully.");

    return res.status(200).json({
      analysis,
      result: analysis,
      text: analysis
    });

  } catch (error) {
    console.error("NeedNetAI Gemini error:", error);

    let message = error.message || "AI analysis failed.";

    if (
      error.cause?.code === "ECONNRESET" ||
      error.message?.includes("fetch failed")
    ) {
      message =
        "Could not connect to Gemini. Check your internet connection, " +
        "network restrictions, and try again.";
    }

    return res.status(500).json({
      error: message
    });
  }
});

app.listen(PORT, () => {
  console.log(`NeedNetAI server running at http://localhost:${PORT}`);
});
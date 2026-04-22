import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import axios from "axios";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const categories = [
  {
    key: "problemStatement",
    title: "Problem Statement",
    weight: 10,
    criteria: "Clarity of problem, evidence of customer pain, and scope of impact."
  },
  {
    key: "solutionProduct",
    title: "Solution/Product",
    weight: 15,
    criteria: "Feasibility, innovation, alignment with problem, and clarity of explanation."
  },
  {
    key: "marketOpportunity",
    title: "Market Opportunity",
    weight: 20,
    criteria: "TAM/SAM/SOM defined, realism of estimates, and evidence of demand."
  },
  {
    key: "businessModel",
    title: "Business Model",
    weight: 15,
    criteria: "Revenue streams, scalability, customer acquisition plan, and pricing clarity."
  },
  {
    key: "competitiveLandscape",
    title: "Competitive Landscape",
    weight: 10,
    criteria: "Identification of competitors, strength of UVP, and defensibility of position."
  },
  {
    key: "team",
    title: "Team",
    weight: 15,
    criteria: "Relevant experience, completeness of roles, and evidence of execution ability."
  },
  {
    key: "tractionMilestones",
    title: "Traction/Milestones",
    weight: 10,
    criteria: "Metrics, achieved milestones, and alignment with funding ask."
  },
  {
    key: "financialProjections",
    title: "Financial Projections",
    weight: 10,
    criteria: "3-5 year forecasts, transparency of assumptions, and realism of growth rates."
  },
  {
    key: "clarityPresentation",
    title: "Clarity and Presentation",
    weight: 5,
    criteria: "Logical flow, grammar, conciseness, and how clearly the material supports investor understanding."
  }
];

const validRecommendations = new Set(["Strong Buy", "Hold", "Pass"]);
const MAX_SLIDE_PREVIEW_COUNT = 15;
const MAX_SLIDE_TEXT_CHARS = 400;
const MAX_COMPLETION_TOKENS = 3500;
const MAX_ANALYSIS_ATTEMPTS = 1;

export async function analyzePitchDeck({ filePath, originalName, env }) {
  const extraction = await extractDeck(filePath);

  if (!extraction.fullText || extraction.fullText.trim() === "") {
    extraction.fullText = extraction.slides
      .map((slide) => slide.text || "")
      .join("\n");
  }

  const startupName = inferStartupName(originalName, extraction.slides);
  let lastValidationError = null;

  for (let attempt = 1; attempt <= MAX_ANALYSIS_ATTEMPTS; attempt++) {
    try {
      const llmAnalysis = await analyzeWithLlm({
        env,
        startupName,
        extraction,
        retryCount: attempt,
        lastValidationError
      });

      const categoryResults = normalizeCategoryResults(llmAnalysis.categories);
      const overallScore = calculateOverallScore(categoryResults);
      const recommendation = normalizeRecommendation(llmAnalysis.recommendation);
      const confidenceScore = normalizeInteger(llmAnalysis.confidenceScore, 0, 100, "confidenceScore");
      const confidenceSummary = validateWordCount(llmAnalysis.confidenceSummary, 0, 120, "confidenceSummary");
      const executiveSummary = validateWordCount(llmAnalysis.executiveSummary, 0, 140, "executiveSummary");
      const strengths = normalizeBulletList(llmAnalysis.strengths, "strengths");
      const weaknesses = normalizeBulletList(llmAnalysis.weaknesses, "weaknesses");
      const recommendations = validateWordCount(llmAnalysis.recommendations, 0, 200, "recommendations");

      return {
        startupName,
        recommendation,
        overallScore,
        confidenceScore,
        confidenceSummary,
        executiveSummary,
        strengths,
        weaknesses,
        recommendations,
        processingDateUtc: formatUtcDate(new Date()),
        slideCount: extraction.slideCount,
        categories: categoryResults,
        extraction
      };
    } catch (error) {
      lastValidationError = error;
      if (attempt < MAX_ANALYSIS_ATTEMPTS && shouldRetryAnalysisValidation(error)) {
        continue;
      }
      throw error;
    }
  }

  throw lastValidationError;
}

async function extractDeck(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const pythonScript = path.resolve(__dirname, "../../../python-worker/extract_pitch_deck.py");

  if (extension === ".ppt") {
    return {
      slideCount: 0,
      slides: [],
      fullText: "",
      warnings: ["Legacy .ppt conversion hook not configured. Install LibreOffice for automatic conversion in production."]
    };
  }

  return new Promise((resolve, reject) => {
    const pythonProcess = spawn("python", [pythonScript, filePath], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    pythonProcess.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    pythonProcess.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    pythonProcess.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || "Failed to extract pitch deck content."));
        return;
      }

      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error("Pitch deck extraction returned invalid data."));
      }
    });
  });
}

async function analyzeWithLlm({ env, startupName, extraction, retryCount = 1, lastValidationError = null }) {
  if (!env.groqApiUrl || !env.groqApiKey || !extraction.fullText.trim()) {
    throw new Error("LLM analysis is required, but the LLM API is not configured or no extractable pitch deck text was found.");
  }

  const prompt = buildLlmPrompt({
    startupName,
    extraction,
    categories,
    retryCount,
    lastValidationError
  });

  try {
    const response = await axios.post(
      env.groqApiUrl,
      buildGroqPayload(env, prompt, retryCount),
      {
        headers: {
          Authorization: `Bearer ${env.groqApiKey}`,
          "Content-Type": "application/json"
        },
        timeout: 240000
      }
    );

    const content = response.data?.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("LLM response did not include content.");
    }

    return parseJsonResponse(content);
  } catch (error) {
    const providerMessage = error?.response?.data
      ? JSON.stringify(error.response.data)
      : error?.message || "Unknown LLM error.";

    throw new Error(`LLM analysis failed. The app did not receive usable investor analysis from Groq. Details: ${providerMessage}`);
  }
}

export function buildLlmPrompt({ startupName, extraction, categories, retryCount = 1, lastValidationError = null }) {
  const MAX_CHARS = 3000;

  function smartTrim(text, max = MAX_CHARS) {
    if (!text) return "";
    return text.length > max
      ? text.slice(0, max) + "\n...[truncated]"
      : text;
  }

  // Safe extraction
  const safeExtraction = extraction || {};
  const trimmedText = smartTrim(safeExtraction.fullText || "");

  // Safe categories
  const safeCategories = Array.isArray(categories) ? categories : [];

  const categoryConfig = safeCategories.map((c) => ({
    key: c?.key || "",
    title: c?.title || "",
    weight: c?.weight || 0,
    criteria: c?.criteria || ""
  }));

  // Safe slide types
  const safeSlideTypes = Array.isArray(safeExtraction.detectedSlideTypes)
    ? safeExtraction.detectedSlideTypes
    : [];

  const slideSummary = safeSlideTypes.reduce((acc, type) => {
    if (!type) return acc;
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});

  const retryInstruction = retryCount > 1 && lastValidationError
    ? `RETRY CORRECTION: The previous response was invalid. Fix this exact issue: ${lastValidationError.message}`
    : "";

  // Evaluation framework
  const evaluationCriteria = `
EVALUATION FRAMEWORK (STRICTLY FOLLOW):

1. Problem Statement (Weight: 10%)
- Evaluate clarity, customer pain evidence, and impact scope
- Score: 0 → 10 (well-defined with data validation)
-feedback: 50-80 words analyzing the strength of the problem statement, citing specific evidence from the pitch deck. Discuss how well the problem is articulated, the quality of customer pain evidence, and the potential market impact. Highlight any weaknesses or gaps in the problem definition and explain implications for investors.

2. Solution/Product (Weight: 15%)
- Evaluate feasibility, innovation, alignment with problem
- Score: 0 → 10 (practical and well-articulated)
-feedback: 50-80 words analyzing the solution/product section. Assess how well the proposed solution addresses the problem, the level of innovation, and the clarity of the explanation. Discuss any potential challenges in execution or gaps in the solution's design, and explain what this means for potential investors.

3. Market Opportunity (Weight: 20%)
- Evaluate TAM/SAM/SOM, demand evidence, realism
- Score: 0 → 10 (data-backed and credible)
-feedback: 50-80 words analyzing the market opportunity. Evaluate the quality of the TAM/SAM/SOM analysis, the realism of market size estimates, and the strength of demand evidence. Discuss any red flags or particularly strong points in the market analysis, and explain how this impacts investor confidence.

4. Business Model (Weight: 15%)
- Evaluate revenue streams, pricing, scalability
- Score: 0 → 10 (clear and sustainable)
-feedback: 50-80 words analyzing the business model. Assess the clarity and sustainability of the revenue streams, the realism of pricing strategies, and the scalability of the business model. Discuss any potential risks or opportunities in the business model and explain their implications for investors.

5. Competitive Landscape (Weight: 10%)
- Evaluate competitors, differentiation, defensibility
- Score: 0 → 10 (strong positioning)
-feedback: 50-80 words analyzing the competitive landscape. Evaluate how well the pitch identifies competitors, the strength of the unique value proposition, and the defensibility of the market position. Discuss any weaknesses in the competitive analysis or particularly strong differentiators, and explain what this means for potential investors.

6. Team (Weight: 15%)
- Evaluate experience, roles, execution capability
- Score: 0 → 10 (balanced and proven)
-feedback: 50-80 words analyzing the team. Assess the relevant experience of the founders and key team members, the completeness of roles, and evidence of execution ability. Discuss any gaps in the team or particularly strong qualifications, and explain how this impacts investor confidence.

7. Traction/Milestones (Weight: 10%)
- Evaluate metrics, growth, achievements
- Score: 0 → 10 (quantifiable progress)
-feedback: 50-80 words analyzing the traction or milestones. Evaluate the quality and quantity of the metrics, the rate of growth, and the significance of the achievements. Discuss any concerns about the sustainability of the traction or what this means for potential investors.

8. Financial Projections (Weight: 10%)
- Evaluate forecasts, assumptions, realism
- Score: 0 → 10 (detailed and credible)
-feedback: 50-80 words analyzing the financial projections. Assess the detail and credibility of the forecasts, the transparency of assumptions, and the realism of growth rates. Discuss any red flags in the financials or particularly strong points, and explain how this impacts investor confidence.

9. Clarity and Presentation (Weight: 5%)
- Evaluate structure, clarity, grammar, conciseness
- Score: 0 → 10 (polished and professional)
-feedback: 50-80 words analyzing the clarity and presentation. Evaluate the logical flow of the pitch deck, the clarity of the writing, the quality of grammar, and how well the material supports investor understanding. Discuss any issues with presentation or particularly strong aspects, and explain what this means for potential investors.

IMPORTANT:
- Base scores strictly on these criteria
- Penalize missing or weak sections
`;

  return `
You are a senior venture capital analyst.

Analyze the startup pitch deck and produce a structured investment thesis.

------------------------
OUTPUT FORMAT (STRICT JSON)
------------------------
{
  "recommendation": "Strong Buy" | "Hold" | "Pass",
  "confidenceScore": number (0–100),
  "confidenceSummary": string (50–120 words),
  "executiveSummary": string (80–140 words),
  "strengths": string[] (3–5 items),
  "weaknesses": string[] (3–5 items),
  "recommendations": string (100–200 words),
  "categories": [
    {
      "key": string,
      "title": string,
      "weight": number,
      "score": number (0–10),
      "feedback": string (50–80 words)
    }
  ]
}

------------------------
STRICT RULES
------------------------
- Use ONLY provided content
- DO NOT repeat phrases across sections
- Each category must have UNIQUE reasoning
- Avoid generic statements
- Infer reasonably if data is missing
- Follow ALL word limits strictly
- strengths must contain 3-5 items, and each item must be 12-32 words
- weaknesses must contain 3-5 items, and each item must be 12-32 words
- Scores MUST reflect evaluation criteria
- Return exactly 9 category objects. Missing even one category makes the response invalid.

------------------------
EVALUATION FRAMEWORK
------------------------
${evaluationCriteria}

------------------------
CATEGORY CONFIG
------------------------
${JSON.stringify(categoryConfig)}

Return categories in this exact order and do not omit any:
${JSON.stringify(categoryConfig.map(({ key, title, weight }) => ({ key, title, weight })))}

------------------------
SLIDE COVERAGE (PRE-PROCESSED)
------------------------
${JSON.stringify(slideSummary)}

Use this to guide analysis:
- Missing key sections → penalize score
- Strong coverage → increase confidence

------------------------
STARTUP DETAILS
------------------------
Startup: ${startupName || "Unknown"}
Slides: ${safeExtraction.slideCount || 0}
${retryInstruction}

------------------------
PITCH DECK CONTENT
------------------------
${trimmedText}

------------------------
FINAL INSTRUCTION
------------------------
Return ONLY valid JSON. No explanation.
`;
}
function buildGroqPayload(env, prompt, retryCount = 1) {
  const temperatures = [0.2, 0.15, 0.1];
  return {
    model: env.groqModel,
    temperature: temperatures[retryCount - 1] ?? 0.1,
    max_completion_tokens: MAX_COMPLETION_TOKENS,
    messages: [
      {
        role: "system",
        content: "You are a disciplined venture capital analyst. Produce a concrete investment thesis that follows the requested JSON schema exactly, returns exactly 9 category objects, and stays grounded in the extracted pitch-deck text."
      },
      {
        role: "user",
        content: `${prompt}\n\nRespond in JSON format only.`
      }
    ],
    response_format: { type: "json_object" }
  };
}

function normalizeCategoryResults(rawCategories) {
  if (!Array.isArray(rawCategories) || rawCategories.length !== categories.length) {
    throw new Error("LLM analysis must return exactly 9 category objects.");
  }

  const categoryList = rawCategories;

  return categories.map((definition) => {
    const match = categoryList.find((item) =>
      normalizeCategoryIdentifier(item?.key) === definition.key ||
      normalizeCategoryIdentifier(item?.title) === normalizeCategoryIdentifier(definition.title)
    );

    if (!match) {
      throw new Error(`LLM analysis is missing the ${definition.title} category.`);
    }

    return {
      key: definition.key,
      title: definition.title,
      weight: definition.weight,
      score: normalizeInteger(match.score, 0, 10, `${definition.title} score`),
      feedback: validateWordCount(match.feedback, 0, 90, `${definition.title} feedback`)
    };
  });
}

function normalizeRecommendation(value) {
  const normalized = typeof value === "string" ? value.trim() : "";

  if (!validRecommendations.has(normalized)) {
    throw new Error("LLM recommendation must be one of Strong Buy, Hold, or Pass.");
  }

  return normalized;
}

function normalizeBulletList(value, label) {
  if (!Array.isArray(value)) {
    throw new Error(`LLM analysis is missing ${label}.`);
  }

  const normalized = value
    .map((item) => (typeof item === "string" ? item.replace(/\s+/g, " ").trim() : ""))
    .filter(Boolean);

  if (normalized.length < 3 || normalized.length > 5) {
    throw new Error(`LLM ${label} must contain between 3 and 5 items.`);
  }

  normalized.forEach((item, index) => {
    validateWordCount(item, 0, 32, `${label} item ${index + 1}`);
  });

  return normalized;
}

function normalizeInteger(value, min, max, label) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    throw new Error(`${label} must be numeric.`);
  }

  return clampRange(Math.round(numeric), min, max);
}

function clampRange(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function calculateOverallScore(categoryResults) {
  const weightedTotal = categoryResults.reduce((sum, item) => (
    sum + (item.score * item.weight) / 10
  ), 0);

  return clampRange(Math.round(weightedTotal), 0, 100);
}

function inferStartupName(originalName, slides) {
  const firstTitle = slides.find((slide) => slide.title)?.title;

  if (firstTitle && firstTitle.length < 50) {
    return firstTitle.replace(/[^\w\s-]/g, "").trim() || stripExtension(originalName);
  }

  return stripExtension(originalName);
}

function stripExtension(fileName) {
  return fileName.replace(/\.[^/.]+$/, "");
}

function formatUtcDate(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${pad(date.getUTCDate())}-${pad(date.getUTCMonth() + 1)}-${date.getUTCFullYear()} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} UTC`;
}

function validateWordCount(text, minWords, maxWords, label) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  const wordCount = normalized ? normalized.split(" ").length : 0;

  if (wordCount < minWords || wordCount > maxWords) {
    throw new Error(`${label} must be between ${minWords} and ${maxWords} words. Received ${wordCount}.`);
  }

  return normalized;
}

function truncate(text, maxLength) {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 3).trim()}...`;
}

function compactText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function normalizeCategoryIdentifier(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function shouldRetryAnalysisValidation(error) {
  const message = String(error?.message || "");
  return [
    "LLM analysis must return exactly 9 category objects.",
    "LLM analysis is missing the",
    "must be between",
    "must contain between",
    "must be numeric",
    "LLM recommendation must be one of Strong Buy, Hold, or Pass."
  ].some((pattern) => message.includes(pattern));
}

function parseJsonResponse(content) {
  try {
    return JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error("No JSON object found in LLM response.");
    }
    return JSON.parse(match[0]);
  }
}

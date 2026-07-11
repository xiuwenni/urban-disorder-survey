import http from "node:http";
import fs from "node:fs/promises";
import { createReadStream, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const surveyDir = __dirname;
const questionnaireDir = path.resolve(surveyDir, "..");
const bundledImageDir = path.join(surveyDir, "public", "images");
const imageDir = existsSync(bundledImageDir) ? bundledImageDir : path.join(questionnaireDir, "SVs_analysis");
const dataDir = process.env.DATA_DIR || path.join(surveyDir, "data");
const publicDir = path.join(surveyDir, "public");
const responsesJsonl = path.join(dataDir, "responses.jsonl");
const responsesCsv = path.join(dataDir, "responses.csv");
const assignmentsJsonl = path.join(dataDir, "assignments.jsonl");
const countsJson = path.join(dataDir, "image_counts.json");
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || (process.env.RENDER || process.env.RAILWAY_ENVIRONMENT ? "0.0.0.0" : "127.0.0.1");
const SAMPLE_SIZE = Number(process.env.SAMPLE_SIZE || 30);
const TARGET_RATINGS = Number(process.env.TARGET_RATINGS || 3);
const IMAGE_EXT_RE = /\.(jpg|jpeg|png|gif|bmp|tif|tiff|webp)$/i;

const csvHeader = [
  "submitted_at",
  "assignment_id",
  "participant_id",
  "image_id",
  "image_file",
  "score",
  "sample_order",
].join(",");

await fs.mkdir(dataDir, { recursive: true });
if (!existsSync(responsesCsv)) {
  await fs.writeFile(responsesCsv, `\uFEFF${csvHeader}\n`, "utf8");
}

function jsonResponse(res, statusCode, body) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
  });
  res.end(payload);
}

function textResponse(res, statusCode, body, contentType = "text/plain; charset=utf-8") {
  res.writeHead(statusCode, {
    "Content-Type": contentType,
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsvRow(values) {
  return values.map(csvEscape).join(",");
}

async function readJsonl(filePath) {
  if (!existsSync(filePath)) return [];
  const text = await fs.readFile(filePath, "utf8");
  return text
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function listImages() {
  const files = await fs.readdir(imageDir, { withFileTypes: true });
  return files
    .filter((entry) => entry.isFile() && IMAGE_EXT_RE.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, "zh-Hans-CN", { numeric: true }));
}

async function loadCounts(images) {
  const counts = Object.fromEntries(images.map((image) => [image, 0]));
  if (existsSync(countsJson)) {
    try {
      const saved = JSON.parse(await fs.readFile(countsJson, "utf8"));
      for (const image of images) {
        counts[image] = Number(saved[image] || 0);
      }
      return counts;
    } catch {
      // Fall back to rebuilding from responses if the count cache is damaged.
    }
  }
  const responses = await readJsonl(responsesJsonl);
  for (const response of responses) {
    if (Object.hasOwn(counts, response.image_file)) {
      counts[response.image_file] += 1;
    }
  }
  await saveCounts(counts);
  return counts;
}

async function saveCounts(counts) {
  await fs.writeFile(countsJson, `${JSON.stringify(counts, null, 2)}\n`, "utf8");
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function pickImages(images, counts) {
  const randomized = shuffle(images).map((file) => ({ file, count: counts[file] || 0 }));
  randomized.sort((a, b) => a.count - b.count);
  return randomized.slice(0, Math.min(SAMPLE_SIZE, randomized.length)).map((item, index) => ({
    imageId: path.parse(item.file).name,
    file: item.file,
    order: index + 1,
    existingRatings: item.count,
    url: `/images/${encodeURIComponent(item.file)}`,
  }));
}

async function createAssignment(req, res) {
  const images = await listImages();
  if (images.length === 0) {
    jsonResponse(res, 500, { error: "未找到图片。请确认 SVs_analysis 文件夹中有图片文件。" });
    return;
  }
  const counts = await loadCounts(images);
  const assignmentId = crypto.randomUUID();
  const selected = pickImages(images, counts);
  const record = {
    assigned_at: new Date().toISOString(),
    assignment_id: assignmentId,
    sample_size: selected.length,
    images: selected.map((item) => item.file),
  };
  await fs.appendFile(assignmentsJsonl, `${JSON.stringify(record)}\n`, "utf8");
  jsonResponse(res, 200, {
    assignmentId,
    sampleSize: selected.length,
    targetRatings: TARGET_RATINGS,
    totalImages: images.length,
    images: selected,
  });
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function submitResponses(req, res) {
  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch {
    jsonResponse(res, 400, { error: "提交内容不是有效 JSON。" });
    return;
  }

  const assignmentId = String(body.assignmentId || "").trim();
  const participantId = String(body.participantId || "").trim() || "anonymous";
  const answers = Array.isArray(body.answers) ? body.answers : [];
  if (!assignmentId || answers.length !== SAMPLE_SIZE) {
    jsonResponse(res, 400, { error: `请完成全部 ${SAMPLE_SIZE} 张图片评分后再提交。` });
    return;
  }

  const images = await listImages();
  const imageSet = new Set(images);
  const existingResponses = await readJsonl(responsesJsonl);
  if (existingResponses.some((item) => item.assignment_id === assignmentId)) {
    jsonResponse(res, 409, { error: "这份问卷已经提交过，请勿重复提交。" });
    return;
  }

  const rows = [];
  const submittedAt = new Date().toISOString();
  for (const [index, answer] of answers.entries()) {
    const imageFile = String(answer.imageFile || "").trim();
    const score = Number(answer.score);
    if (!imageSet.has(imageFile)) {
      jsonResponse(res, 400, { error: `图片不存在：${imageFile}` });
      return;
    }
    if (!Number.isInteger(score) || score < 0 || score > 5) {
      jsonResponse(res, 400, { error: "评分必须是 0-5 的整数。" });
      return;
    }
    rows.push({
      submitted_at: submittedAt,
      assignment_id: assignmentId,
      participant_id: participantId,
      image_id: path.parse(imageFile).name,
      image_file: imageFile,
      score,
      sample_order: Number(answer.order || index + 1),
    });
  }

  await fs.appendFile(responsesJsonl, rows.map((row) => JSON.stringify(row)).join("\n") + "\n", "utf8");
  await fs.appendFile(
    responsesCsv,
    rows
      .map((row) =>
        toCsvRow([
          row.submitted_at,
          row.assignment_id,
          row.participant_id,
          row.image_id,
          row.image_file,
          row.score,
          row.sample_order,
        ]),
      )
      .join("\n") + "\n",
    "utf8",
  );

  const counts = await loadCounts(images);
  for (const row of rows) {
    counts[row.image_file] = (counts[row.image_file] || 0) + 1;
  }
  await saveCounts(counts);

  jsonResponse(res, 200, { ok: true, saved: rows.length, assignmentId });
}

async function buildStats() {
  const images = await listImages();
  const responses = await readJsonl(responsesJsonl);
  const stats = Object.fromEntries(
    images.map((file) => [
      file,
      {
        image_id: path.parse(file).name,
        image_file: file,
        n: 0,
        sum: 0,
        mean: "",
        min: "",
        max: "",
        target_met: false,
      },
    ]),
  );

  for (const response of responses) {
    const item = stats[response.image_file];
    if (!item) continue;
    const score = Number(response.score);
    item.n += 1;
    item.sum += score;
    item.min = item.min === "" ? score : Math.min(item.min, score);
    item.max = item.max === "" ? score : Math.max(item.max, score);
  }

  for (const item of Object.values(stats)) {
    item.mean = item.n ? Number((item.sum / item.n).toFixed(3)) : "";
    item.target_met = item.n >= TARGET_RATINGS;
  }

  const rows = Object.values(stats);
  const completedImages = rows.filter((item) => item.target_met).length;
  const totalResponses = responses.length;
  return {
    totalImages: images.length,
    totalResponses,
    completedImages,
    targetRatings: TARGET_RATINGS,
    remainingImages: images.length - completedImages,
    rows,
  };
}

async function statsResponse(res) {
  jsonResponse(res, 200, await buildStats());
}

async function exportSummary(res) {
  const stats = await buildStats();
  const header = ["image_id", "image_file", "n", "mean_score", "min_score", "max_score", "target_met"].join(",");
  const rows = stats.rows.map((row) =>
    toCsvRow([row.image_id, row.image_file, row.n, row.mean, row.min, row.max, row.target_met ? "YES" : "NO"]),
  );
  textResponse(res, 200, `\uFEFF${header}\n${rows.join("\n")}\n`, "text/csv; charset=utf-8");
}

function serveFile(res, filePath, contentType) {
  if (!existsSync(filePath)) {
    textResponse(res, 404, "Not found");
    return;
  }
  res.writeHead(200, {
    "Content-Type": contentType,
    "Cache-Control": "public, max-age=3600",
  });
  createReadStream(filePath).pipe(res);
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return (
    {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".gif": "image/gif",
      ".webp": "image/webp",
      ".bmp": "image/bmp",
      ".tif": "image/tiff",
      ".tiff": "image/tiff",
      ".csv": "text/csv; charset=utf-8",
    }[ext] || "application/octet-stream"
  );
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    if (req.method === "GET" && url.pathname === "/api/assignment") {
      await createAssignment(req, res);
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/submit") {
      await submitResponses(req, res);
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/stats") {
      await statsResponse(res);
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/health") {
      jsonResponse(res, 200, {
        ok: true,
        images: (await listImages()).length,
        dataDir,
        now: new Date().toISOString(),
      });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/export/responses.csv") {
      serveFile(res, responsesCsv, "text/csv; charset=utf-8");
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/export/image_summary.csv") {
      await exportSummary(res);
      return;
    }
    if (req.method === "GET" && url.pathname.startsWith("/images/")) {
      const fileName = decodeURIComponent(url.pathname.replace(/^\/images\//, ""));
      const safeName = path.basename(fileName);
      serveFile(res, path.join(imageDir, safeName), contentTypeFor(safeName));
      return;
    }

    const filePath =
      url.pathname === "/"
        ? path.join(publicDir, "index.html")
        : path.join(publicDir, path.normalize(url.pathname).replace(/^(\.\.[/\\])+/, ""));
    serveFile(res, filePath, contentTypeFor(filePath));
  } catch (error) {
    console.error(error);
    jsonResponse(res, 500, { error: "服务器内部错误。", detail: String(error.message || error) });
  }
});

server.listen(PORT, HOST, () => {
  const displayHost = HOST === "0.0.0.0" ? "127.0.0.1" : HOST;
  console.log(`SV survey app is running: http://${displayHost}:${PORT}`);
  console.log(`Images: ${imageDir}`);
  console.log(`Data: ${dataDir}`);
});

const SHEET_RESPONSES = "responses";
const SHEET_ASSIGNMENTS = "assignments";
const SHEET_SUMMARY = "image_summary";
const TOTAL_IMAGES = 1048;
const TARGET_RATINGS = 3;

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const responses = getOrCreateSheet_(ss, SHEET_RESPONSES, [
        "submitted_at",
        "assignment_id",
        "participant_id",
        "image_id",
        "image_file",
        "score",
        "sample_order",
      ]);
      const assignments = getOrCreateSheet_(ss, SHEET_ASSIGNMENTS, [
        "assigned_at",
        "assignment_id",
        "participant_id",
        "sample_size",
        "image_files",
      ]);

      const assignmentId = String(payload.assignmentId || "");
      if (!assignmentId) {
        throw new Error("Missing assignmentId");
      }
      if (assignmentAlreadySubmitted_(responses, assignmentId)) {
        return json_({ ok: false, error: "duplicate_assignment" });
      }

      const participantId = String(payload.participantId || "anonymous");
      const submittedAt = payload.submittedAt || new Date().toISOString();
      const answers = Array.isArray(payload.answers) ? payload.answers : [];
      if (answers.length === 0) {
        throw new Error("No answers");
      }

      const rows = answers.map((answer, index) => {
        const score = Number(answer.score);
        if (!Number.isInteger(score) || score < 0 || score > 5) {
          throw new Error("Invalid score");
        }
        const imageFile = String(answer.imageFile || "");
        const imageId = String(answer.imageId || imageFile.replace(/\.[^.]+$/, ""));
        return [
          submittedAt,
          assignmentId,
          participantId,
          imageId,
          imageFile,
          score,
          Number(answer.order || index + 1),
        ];
      });

      responses.getRange(responses.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
      assignments.appendRow([
        submittedAt,
        assignmentId,
        participantId,
        answers.length,
        answers.map((answer) => answer.imageFile).join(","),
      ]);
      rebuildSummary_(ss);
      return json_({ ok: true, saved: rows.length });
    } finally {
      lock.releaseLock();
    }
  } catch (error) {
    return json_({ ok: false, error: String(error && error.message ? error.message : error) });
  }
}

function doGet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  rebuildSummary_(ss);
  return json_({ ok: true, updated: new Date().toISOString() });
}

function getOrCreateSheet_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function assignmentAlreadySubmitted_(sheet, assignmentId) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;
  const values = sheet.getRange(2, 2, lastRow - 1, 1).getValues();
  return values.some((row) => String(row[0]) === assignmentId);
}

function rebuildSummary_(ss) {
  const responses = getOrCreateSheet_(ss, SHEET_RESPONSES, [
    "submitted_at",
    "assignment_id",
    "participant_id",
    "image_id",
    "image_file",
    "score",
    "sample_order",
  ]);
  const summary = getOrCreateSheet_(ss, SHEET_SUMMARY, [
    "image_id",
    "image_file",
    "n",
    "mean_score",
    "min_score",
    "max_score",
    "target_met",
  ]);

  const stats = {};
  for (let i = 1; i <= TOTAL_IMAGES; i += 1) {
    const imageId = String(i).padStart(4, "0");
    const imageFile = `${imageId}.jpg`;
    stats[imageFile] = {
      imageId,
      imageFile,
      n: 0,
      sum: 0,
      min: "",
      max: "",
    };
  }

  const lastRow = responses.getLastRow();
  if (lastRow >= 2) {
    const values = responses.getRange(2, 1, lastRow - 1, 7).getValues();
    values.forEach((row) => {
      const imageFile = String(row[4]);
      const score = Number(row[5]);
      if (!stats[imageFile] || !Number.isFinite(score)) return;
      const item = stats[imageFile];
      item.n += 1;
      item.sum += score;
      item.min = item.min === "" ? score : Math.min(item.min, score);
      item.max = item.max === "" ? score : Math.max(item.max, score);
    });
  }

  summary.clearContents();
  summary.appendRow(["image_id", "image_file", "n", "mean_score", "min_score", "max_score", "target_met"]);
  const rows = Object.values(stats).map((item) => [
    item.imageId,
    item.imageFile,
    item.n,
    item.n ? item.sum / item.n : "",
    item.min,
    item.max,
    item.n >= TARGET_RATINGS ? "YES" : "NO",
  ]);
  summary.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  summary.setFrozenRows(1);
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

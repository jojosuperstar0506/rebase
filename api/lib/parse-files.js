import Busboy from "busboy";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import * as XLSX from "xlsx";

const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4MB per file
const MAX_FILE_COUNT = 5;
const MAX_TEXT_CHARS = 8000;

const IMAGE_MIMETYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

/**
 * Truncate text to MAX_TEXT_CHARS, cutting at the last newline before the limit.
 */
function truncateText(text, filename) {
  if (text.length <= MAX_TEXT_CHARS) return text;

  const totalChars = text.length;
  let truncated = text.slice(0, MAX_TEXT_CHARS);

  const lastNewline = truncated.lastIndexOf("\n");
  if (lastNewline > MAX_TEXT_CHARS * 0.5) {
    truncated = truncated.slice(0, lastNewline);
  }

  return `${truncated}\n\n[... 文档内容已截断，共 ${totalChars} 字符]`;
}

/**
 * Parse a multipart form request into { description, industry, files[] }.
 * Uses busboy for streaming parse (no temp files).
 *
 * @param {import('http').IncomingMessage} req
 * @returns {Promise<{ description: string, industry: string, files: Array<{ filename: string, mimetype: string, buffer: Buffer }> }>}
 */
export async function parseMultipartRequest(req) {
  return new Promise((resolve, reject) => {
    const fields = {};
    const files = [];
    let fileCount = 0;

    const busboy = Busboy({
      headers: req.headers,
      limits: {
        fileSize: MAX_FILE_SIZE,
        files: MAX_FILE_COUNT,
      },
    });

    busboy.on("field", (name, value) => {
      fields[name] = value;
    });

    busboy.on("file", (name, stream, info) => {
      const { filename, mimeType } = info;
      fileCount++;

      if (fileCount > MAX_FILE_COUNT) {
        stream.resume(); // drain the stream
        return;
      }

      const chunks = [];
      let totalSize = 0;
      let truncated = false;

      stream.on("data", (chunk) => {
        totalSize += chunk.length;
        if (totalSize <= MAX_FILE_SIZE) {
          chunks.push(chunk);
        } else {
          truncated = true;
        }
      });

      stream.on("limit", () => {
        truncated = true;
      });

      stream.on("end", () => {
        if (!truncated || chunks.length > 0) {
          files.push({
            filename: filename || "unknown",
            mimetype: mimeType || "application/octet-stream",
            buffer: Buffer.concat(chunks),
          });
        }
      });
    });

    busboy.on("finish", () => {
      if (!fields.description || !fields.description.trim()) {
        reject(new Error("description is required and must be a non-empty string"));
        return;
      }

      resolve({
        description: fields.description,
        industry: fields.industry || "retail_ecommerce",
        files,
      });
    });

    busboy.on("error", (err) => {
      reject(err);
    });

    req.pipe(busboy);
  });
}

/**
 * Extract text from a file buffer based on its mimetype/extension.
 *
 * @param {{ filename: string, mimetype: string, buffer: Buffer }} file
 * @returns {Promise<{ text: string|null, imageBase64: { base64: string, media_type: string }|null }>}
 */
export async function extractFileContent(file) {
  const { filename, mimetype, buffer } = file;
  const ext = filename.split(".").pop()?.toLowerCase();

  try {
    // PDF
    if (mimetype === "application/pdf" || ext === "pdf") {
      const result = await pdfParse(buffer);
      return { text: truncateText(result.text, filename), imageBase64: null };
    }

    // DOCX
    if (
      mimetype ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      ext === "docx"
    ) {
      const result = await mammoth.extractRawText({ buffer });
      return { text: truncateText(result.value, filename), imageBase64: null };
    }

    // XLSX
    if (
      mimetype ===
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      ext === "xlsx"
    ) {
      const workbook = XLSX.read(buffer);
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const csv = XLSX.utils.sheet_to_csv(firstSheet);
      return { text: truncateText(csv, filename), imageBase64: null };
    }

    // CSV
    if (mimetype === "text/csv" || ext === "csv") {
      const text = buffer.toString("utf-8");
      return { text: truncateText(text, filename), imageBase64: null };
    }

    // Images
    if (IMAGE_MIMETYPES.has(mimetype)) {
      return {
        text: null,
        imageBase64: {
          base64: buffer.toString("base64"),
          media_type: mimetype,
        },
      };
    }

    // Unknown type — skip
    return { text: null, imageBase64: null };
  } catch (err) {
    console.error(`Failed to parse file ${filename}:`, err.message);
    return { text: `[文件解析失败: ${filename}]`, imageBase64: null };
  }
}

import express from "express";
import multer from "multer";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { zipBufferToSrt } from "./convert.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 },
});

app.use(express.static(path.join(__dirname, "..", "public")));

app.post("/convert", upload.single("file"), async (req, res) => {
  if (!req.file) {
    res.status(400).type("text/plain").send("No file uploaded");
    return;
  }
  try {
    const { srt, cueCount } = await zipBufferToSrt(req.file.buffer);
    const base = req.file.originalname.replace(/\.zip$/i, "");
    const filename = `${base || "subtitles"}.srt`;
    res.setHeader("Content-Type", "application/x-subrip; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`
    );
    res.setHeader("X-Cue-Count", String(cueCount));
    res.send(srt);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Conversion failed";
    res.status(400).type("text/plain").send(msg);
  }
});

app.get("/healthz", (_req, res) => {
  res.type("text/plain").send("ok");
});

const port = Number(process.env.PORT ?? 8080);
app.listen(port, () => {
  console.log(`listening on :${port}`);
});

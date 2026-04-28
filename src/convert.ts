import JSZip from "jszip";

interface DraftMaterial {
  id: string;
  content?: unknown;
}

interface Segment {
  material_id?: string;
  target_timerange?: { start?: number; duration?: number };
}

interface Track {
  type?: string;
  segments?: Segment[];
}

interface DraftContent {
  materials?: { texts?: DraftMaterial[] };
  tracks?: Track[];
}

function extractText(material: DraftMaterial): string {
  const raw = material.content;
  if (!raw) return "";
  if (typeof raw === "string") {
    try {
      const inner = JSON.parse(raw) as unknown;
      if (inner && typeof inner === "object" && "text" in inner) {
        const txt = (inner as { text?: unknown }).text;
        if (typeof txt === "string") return txt;
      }
      return "";
    } catch {
      return raw.trim();
    }
  }
  if (typeof raw === "object" && raw !== null && "text" in raw) {
    const txt = (raw as { text?: unknown }).text;
    return typeof txt === "string" ? txt : "";
  }
  return "";
}

function usToSrtTime(us: number): string {
  if (us < 0) us = 0;
  const totalMs = Math.floor(us / 1000);
  const ms = totalMs % 1000;
  const totalS = Math.floor(totalMs / 1000);
  const s = totalS % 60;
  const totalM = Math.floor(totalS / 60);
  const m = totalM % 60;
  const h = Math.floor(totalM / 60);
  const pad = (n: number, w = 2) => n.toString().padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

export function draftContentToSrt(data: DraftContent): { srt: string; cueCount: number } {
  const texts = data.materials?.texts ?? [];
  const textsById = new Map<string, DraftMaterial>();
  for (const m of texts) textsById.set(m.id, m);

  const cues: Array<[number, number, string]> = [];
  for (const track of data.tracks ?? []) {
    if (track.type !== "text") continue;
    for (const seg of track.segments ?? []) {
      const tr = seg.target_timerange ?? {};
      const start = tr.start ?? 0;
      const duration = tr.duration ?? 0;
      if (duration <= 0) continue;
      const mat = seg.material_id ? textsById.get(seg.material_id) : undefined;
      if (!mat) continue;
      const text = extractText(mat).trim();
      if (!text) continue;
      cues.push([start, start + duration, text]);
    }
  }

  cues.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  const lines: string[] = [];
  cues.forEach(([s, e, t], i) => {
    lines.push(String(i + 1));
    lines.push(`${usToSrtTime(s)} --> ${usToSrtTime(e)}`);
    lines.push(t);
    lines.push("");
  });

  return { srt: lines.join("\n"), cueCount: cues.length };
}

export async function zipBufferToSrt(zipBuffer: Buffer): Promise<{ srt: string; cueCount: number }> {
  const zip = await JSZip.loadAsync(zipBuffer);
  let entry: JSZip.JSZipObject | undefined;
  zip.forEach((_path, file) => {
    if (file.dir) return;
    if (file.name.endsWith("draft_content.json") && !file.name.endsWith(".bak")) {
      if (!entry || file.name.length < entry.name.length) entry = file;
    }
  });
  if (!entry) throw new Error("draft_content.json not found in zip");

  const json = await entry.async("string");
  const data = JSON.parse(json) as DraftContent;
  return draftContentToSrt(data);
}

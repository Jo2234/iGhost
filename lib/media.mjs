import path from "node:path";

export function generatedMediaPath(generatedDir, publicUrl) {
  const match = String(publicUrl).match(/^\/generated\/(audio|video)\/([a-zA-Z0-9_-]+\.(?:mp3|mp4))$/);
  if (!match) throw new Error("Invalid generated media URL.");
  return path.join(generatedDir, match[1], match[2]);
}

export function audioDurationFromFfmpeg(diagnostics) {
  const match = String(diagnostics).match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  const duration = match ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) : NaN;
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("Unable to determine narration duration.");
  return duration;
}

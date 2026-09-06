import path from "node:path";

export function generatedMediaPath(generatedDir, publicUrl) {
  const match = String(publicUrl).match(/^\/generated\/(audio|video)\/([a-zA-Z0-9_-]+\.(?:mp3|mp4))$/);
  if (!match) throw new Error("Invalid generated media URL.");
  return path.join(generatedDir, match[1], match[2]);
}

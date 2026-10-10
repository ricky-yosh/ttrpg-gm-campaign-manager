import { readdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, basename } from "node:path";

const directory = dirname(fileURLToPath(import.meta.url));
const artwork = {};
for (const filename of (await readdir(directory)).filter((file) => file.endsWith(".jpg")).sort()) {
  const bytes = await readFile(join(directory, filename));
  artwork[basename(filename, ".jpg")] = `data:image/jpeg;base64,${bytes.toString("base64")}`;
}
await writeFile(join(directory, "artwork.json"), `${JSON.stringify(artwork, null, 2)}\n`);

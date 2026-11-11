/**
 * Pré-constrói o índice de filmes e séries em disco (o mesmo que o servidor
 * faz sozinho no primeiro acesso). Uso: npm run vod:index
 */
import path from "node:path";
import { refreshParts, readPartMeta, VOD_FILES } from "../src/lib/vod/ingest";

const root = process.env.VOD_DATA_DIR ?? path.join(process.cwd(), ".data", "vod");
const started = Date.now();
let lastFile = "";

await refreshParts(root, (p) => {
  if (p.file !== lastFile) {
    lastFile = p.file;
    process.stdout.write(`\n[${p.fileIndex + 1}/${p.fileCount}] ${p.file} `);
  }
  const mb = (p.bytes / 1048576).toFixed(0);
  const total = p.totalBytes ? `/${(p.totalBytes / 1048576).toFixed(0)}` : "";
  process.stdout.write(`\r[${p.fileIndex + 1}/${p.fileCount}] ${p.file} ${mb}${total} MB   `);
});

console.log("\n");
for (const file of VOD_FILES) {
  const m = await readPartMeta(root, file);
  if (m) console.log(`${file}: ${m.movies} filmes, ${m.series} séries, ${m.episodes} episódios (${m.skipped} ignorados)`);
}
console.log(`\nConcluído em ${((Date.now() - started) / 1000).toFixed(0)}s → ${root}`);

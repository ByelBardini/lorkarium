import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { brotliCompress, constants, gzip } from 'node:zlib';

// Images and fonts are already compressed: a .br of them only weighs the build.
const COMPRESSED_EXTENSIONS: ReadonlySet<string> = new Set([
  '.js',
  '.css',
  '.html',
  '.svg',
  '.json',
]);
// Below it the headers of the encoding cost about what they save.
const MIN_BYTES = 1024;

const brotli = promisify(brotliCompress);
const gzipped = promisify(gzip);

/** Writes a `.br` (quality 11) and a `.gz` next to every text file above 1 KB of the build in
 *  `dir`, for `@fastify/static`'s `preCompressed` to serve without spending CPU per request.
 *  Answers the files compressed, relative to `dir`.
 *
 *  Example: `await precompressBuild('client/dist') // ['index.html', 'assets/index-3f2a.js', …]` */
export async function precompressBuild(dir: string): Promise<readonly string[]> {
  const files = await compressibleFilesOf(dir);
  const written = await Promise.all(
    files.map((file) => writeCompressedCopies(path.join(dir, file))),
  );
  return files.filter((_, at) => written[at]);
}

async function compressibleFilesOf(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && COMPRESSED_EXTENSIONS.has(path.extname(entry.name)))
    .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)))
    .map((file) => file.split(path.sep).join('/'));
}

// false = left alone for its size.
async function writeCompressedCopies(file: string): Promise<boolean> {
  const bytes = await readFile(file);
  if (bytes.byteLength <= MIN_BYTES) return false;
  const params = { [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY };
  await writeFile(`${file}.br`, await brotli(bytes, { params }));
  await writeFile(`${file}.gz`, await gzipped(bytes, { level: constants.Z_BEST_COMPRESSION }));
  return true;
}

// `node scripts/precompress.ts`, the last step of the client build.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
  const files = await precompressBuild(dist);
  process.stdout.write(`pré-comprimidos (.br e .gz): ${files.length} arquivos de texto\n`);
}

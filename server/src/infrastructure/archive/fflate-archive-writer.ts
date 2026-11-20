import { PassThrough, type Readable } from 'node:stream';
import { Zip, ZipDeflate, ZipPassThrough } from 'fflate';
import type {
  ArchiveEntries,
  ArchiveWriterPort,
} from '../../modules/data-export/archive-writer.port';

const DEFLATE_LEVEL = 6;

/** `ArchiveWriterPort` over the streaming `Zip` of fflate: every chunk goes to the reader as soon
 *  as it is made, and each file waits for the reader to drain, so memory holds about one chunk.
 *
 *  Example: `new FflateArchiveWriter().stream(async (zip) => zip.addFile('a.txt', bytes))` */
export class FflateArchiveWriter implements ArchiveWriterPort {
  stream(fill: (entries: ArchiveEntries) => Promise<void>): Readable {
    const output = new PassThrough();
    const zip = new Zip((error, chunk, final) => {
      if (output.destroyed) return;
      if (error !== null) return void output.destroy(error);
      output.write(chunk);
      if (final) output.end();
    });
    fill(new FflateEntries(zip, output)).then(
      () => zip.end(),
      (error: unknown) => {
        zip.terminate();
        output.destroy(error instanceof Error ? error : new Error(String(error)));
      },
    );
    return output;
  }
}

class FflateEntries implements ArchiveEntries {
  constructor(
    private readonly zip: Zip,
    private readonly output: PassThrough,
  ) {}

  async addFile(path: string, bytes: Uint8Array): Promise<void> {
    this.requireReader(path);
    const file = new ZipDeflate(path, { level: DEFLATE_LEVEL });
    this.zip.add(file);
    file.push(bytes, true);
    await this.drained(path);
  }

  async addStream(path: string, body: Readable): Promise<void> {
    this.requireReader(path);
    const file = new ZipPassThrough(path);
    this.zip.add(file);
    for await (const chunk of body) {
      file.push(new Uint8Array(chunk as Buffer));
      await this.drained(path);
    }
    file.push(new Uint8Array(0), true);
    await this.drained(path);
  }

  private async drained(path: string): Promise<void> {
    if (this.output.writableNeedDrain && !this.output.destroyed) {
      await new Promise<void>((resolve) => {
        this.output.once('drain', resolve);
        this.output.once('close', resolve);
      });
    }
    this.requireReader(path);
  }

  private requireReader(path: string): void {
    if (!this.output.destroyed) return;
    throw new Error(`archive reader closed while adding ${path}: expected a reader until the end`);
  }
}

import { createRequire } from "node:module";
import path from "node:path";
import { createWorker, OEM, type Worker } from "tesseract.js";
import type { OcrEngine } from "./errors";

/**
 * Tesseract.js OCR engine. English data ships with the package
 * (@tesseract.js-data/eng), so nothing is fetched from a CDN at runtime.
 *
 * Starting a Tesseract worker takes a second or two, so the worker
 * process creates one engine and reuses it; call `terminate()` on
 * shutdown.
 */
export interface TesseractOcr extends OcrEngine {
  terminate(): Promise<void>;
}

/** English traineddata bundled by @tesseract.js-data/eng (gzipped, LSTM model). */
const ENG_LANG_PATH = path.join(
  path.dirname(createRequire(import.meta.url).resolve("@tesseract.js-data/eng/package.json")),
  "4.0.0",
);

export async function createTesseractOcr(): Promise<TesseractOcr> {
  const worker: Worker = await createWorker("eng", OEM.LSTM_ONLY, {
    langPath: ENG_LANG_PATH,
    gzip: true,
    cacheMethod: "none",
  });

  return {
    async recognize(image) {
      const { data } = await worker.recognize(Buffer.from(image), {}, { text: true, blocks: true });
      const wordConfidences: number[] = [];
      for (const block of data.blocks ?? []) {
        for (const paragraph of block.paragraphs) {
          for (const line of paragraph.lines) {
            for (const word of line.words) {
              // Skip stray punctuation/noise so it doesn't drag the average.
              if (word.text.replace(/[^\p{L}\p{N}]/gu, "").length > 0)
                wordConfidences.push(word.confidence);
            }
          }
        }
      }
      return { text: data.text, wordConfidences };
    },
    terminate: () => worker.terminate().then(() => undefined),
  };
}

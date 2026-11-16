import { crc32, deflateSync } from "node:zlib";

/**
 * Builds small, valid files in memory for tests — no binary fixtures in
 * the repo. Test-only; not exported from the package index.
 */

/** A real PDF with `pages` blank pages and a correct xref table. */
export function makePdf(pages: number): Uint8Array {
  const kids = Array.from({ length: pages }, (_, i) => `${3 + i} 0 R`).join(" ");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${kids}] /Count ${pages} >>`,
    ...Array.from(
      { length: pages },
      () => "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] >>",
    ),
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xrefAt = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) body += `${String(off).padStart(10, "0")} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([len, typeAndData, crc]);
}

/** A valid 1×1 PNG. `seed` changes the pixel so different images hash differently. */
export function makePng(seed = 0): Uint8Array {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const raw = Buffer.from([0, seed & 255, 0, 0]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

/** JPEG/JFIF header — enough for magic-byte detection. */
export function makeJpg(): Uint8Array {
  return Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
    0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
  ]);
}

/** Minimal store-only ZIP with the given entries. */
export function makeZip(entries: Record<string, string>): Uint8Array {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(entries)) {
    const nameBuf = Buffer.from(name, "utf8");
    const data = Buffer.from(content, "utf8");
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const centralSize = centrals.reduce((s, b) => s + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(entries).length, 8);
  end.writeUInt16LE(Object.keys(entries).length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

/** A minimal .docx (Word) package. */
export function makeDocx(text = "Jane Doe — Software Engineer"): Uint8Array {
  return makeZip({
    "[Content_Types].xml":
      '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    "word/document.xml": `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`,
  });
}

/** Start of a Windows executable (MZ header + PE signature). */
export function makeExe(): Uint8Array {
  const buf = Buffer.alloc(256);
  buf.write("MZ", 0, "latin1");
  buf.writeUInt32LE(0x80, 0x3c);
  buf.write("PE\0\0", 0x80, "latin1");
  return buf;
}

export const SAMPLE_TEX = String.raw`\documentclass{article}
\begin{document}
\section{Experience}
Software Engineer at Acme
\end{document}
`;

// --- Realistic resume samples (for extraction tests) -------------------

/** The content every sample format carries, so tests can check the same facts survive. */
export const SAMPLE_RESUME_LINES = [
  "Priya Raman",
  "Bengaluru | priya.raman@example.com | +91 98450 12345",
  "EXPERIENCE",
  "Senior Software Engineer, Flipkart",
  "Jan 2021 - Present",
  "Led migration of checkout service to Kubernetes, cutting p95 latency by 38%",
  "Mentored 6 engineers and ran the payments on-call rotation",
  "Software Engineer, Zoho",
  "Jul 2017 - Dec 2020",
  "Built invoicing APIs in Java and PostgreSQL used by 40,000 businesses",
  "EDUCATION",
  "B.Tech Computer Science, NIT Trichy, 2017",
  "SKILLS",
  "Java, TypeScript, Go, PostgreSQL, Kafka, Kubernetes, AWS",
];

/** Facts that must come out of every format intact. */
export const SAMPLE_RESUME_FACTS = [
  "Priya Raman",
  "Flipkart",
  "Zoho",
  "Senior Software Engineer",
  "38%",
  "40,000",
  "NIT Trichy",
  "Kubernetes",
  "PostgreSQL",
];

function pdfFromObjects(objects: (string | Buffer)[]): Uint8Array {
  const parts: Buffer[] = [Buffer.from("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n", "latin1")];
  let length = parts[0]!.length;
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(length);
    const chunk = Buffer.concat([
      Buffer.from(`${i + 1} 0 obj\n`, "latin1"),
      typeof obj === "string" ? Buffer.from(obj, "latin1") : obj,
      Buffer.from("\nendobj\n", "latin1"),
    ]);
    parts.push(chunk);
    length += chunk.length;
  });
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) xref += `${String(off).padStart(10, "0")} 00000 n \n`;
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${length}\n%%EOF\n`;
  parts.push(Buffer.from(xref, "latin1"));
  return Buffer.concat(parts);
}

const pdfEscape = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`);

/** A one-page PDF with a real text layer (Helvetica), like an export from Word or Docs. */
export function makeTextPdf(lines = SAMPLE_RESUME_LINES): Uint8Array {
  let y = 800;
  const stream = lines
    .map((line) => {
      const heading = line === line.toUpperCase() && /[A-Z]{4}/.test(line);
      const cmd = `BT /F1 ${heading ? 13 : 10} Tf 50 ${y} Td (${pdfEscape(line)}) Tj ET`;
      y -= heading ? 26 : 16;
      return cmd;
    })
    .join("\n");
  return pdfFromObjects([
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`,
  ]);
}

/** Renders resume lines onto a white page image (what a phone photo or scan looks like). */
export async function renderResumeImage(
  opts: { lines?: string[]; width?: number; degrade?: boolean; format?: "png" | "jpeg" } = {},
): Promise<{ data: Uint8Array; width: number; height: number }> {
  const { createCanvas } = await import("@napi-rs/canvas");
  const lines = opts.lines ?? SAMPLE_RESUME_LINES;
  const width = opts.width ?? 1240;
  const height = Math.round(width * 1.414);
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#111111";
  let y = 110;
  for (const line of lines) {
    const heading = line === line.toUpperCase() && /[A-Z]{4}/.test(line);
    ctx.font = `${heading ? "bold 34px" : "28px"} sans-serif`;
    ctx.fillText(line, 80, y);
    y += heading ? 64 : 46;
  }

  if (opts.degrade) {
    // Simulate an unusable photo: shrink hard, blow back up, and bury it in noise.
    const tiny = createCanvas(Math.round(width / 9), Math.round(height / 9));
    tiny.getContext("2d").drawImage(canvas, 0, 0, tiny.width, tiny.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(tiny, 0, 0, width, height);
    const img = ctx.getImageData(0, 0, width, height);
    let seed = 42;
    for (let i = 0; i < img.data.length; i += 4) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const noise = (seed % 160) - 80;
      for (let c = 0; c < 3; c++)
        img.data[i + c] = Math.max(0, Math.min(255, img.data[i + c]! + noise));
    }
    ctx.putImageData(img, 0, 0);
  }

  const data =
    opts.format === "jpeg" ? canvas.toBuffer("image/jpeg", 90) : canvas.toBuffer("image/png");
  return { data, width, height };
}

/** A scanned resume: one page that is just a JPEG image, no text layer. */
export async function makeScannedPdf(): Promise<Uint8Array> {
  const { data: jpeg, width, height } = await renderResumeImage({ format: "jpeg" });
  const draw = `q 595 0 0 842 0 0 cm /Im1 Do Q`;
  return pdfFromObjects([
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im1 4 0 R >> >> /Contents 5 0 R >>",
    Buffer.concat([
      Buffer.from(
        `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
        "latin1",
      ),
      Buffer.from(jpeg),
      Buffer.from("\nendstream", "latin1"),
    ]),
    `<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`,
  ]);
}

const xmlEscape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** A Word resume: one paragraph per line, plus docProps/app.xml with a page count. */
export function makeResumeDocx(lines = SAMPLE_RESUME_LINES, pages = 1): Uint8Array {
  const paragraphs = lines
    .map((l) => `<w:p><w:r><w:t xml:space="preserve">${xmlEscape(l)}</w:t></w:r></w:p>`)
    .join("");
  return makeZip({
    "[Content_Types].xml":
      '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    "_rels/.rels":
      '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    "word/document.xml": `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}</w:body></w:document>`,
    "docProps/app.xml": `<?xml version="1.0"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Pages>${pages}</Pages></Properties>`,
  });
}

/** A LaTeX resume in the widely used "Jake's resume" style, with custom macros. */
export const SAMPLE_RESUME_TEX = String.raw`\documentclass[letterpaper,11pt]{article}
\usepackage[hidelinks]{hyperref}
\usepackage{titlesec}
\newcommand{\resumeSubheading}[4]{\item \textbf{#1} \hfill #2 \\ \textit{#3} \hfill #4}
\newcommand{\resumeItem}[1]{\item\small{#1}}
\begin{document}
\begin{center}
  \textbf{\Huge Priya Raman} \\
  Bengaluru $|$ \href{mailto:priya.raman@example.com}{priya.raman@example.com} $|$ +91 98450 12345
\end{center}
% Experience section
\section{Experience}
\begin{itemize}
  \resumeSubheading{Flipkart}{Jan 2021 -- Present}{Senior Software Engineer}{Bengaluru}
  \begin{itemize}
    \resumeItem{Led migration of checkout service to Kubernetes, cutting p95 latency by 38\%}
    \resumeItem{Mentored 6 engineers and ran the payments on-call rotation}
  \end{itemize}
  \resumeSubheading{Zoho}{Jul 2017 -- Dec 2020}{Software Engineer}{Chennai}
  \begin{itemize}
    \resumeItem{Built invoicing APIs in Java and PostgreSQL used by 40,000 businesses}
  \end{itemize}
\end{itemize}
\section{Education}
B.Tech Computer Science, NIT Trichy, 2017
\section{Skills}
Java, TypeScript, Go, PostgreSQL, Kafka, Kubernetes, AWS. Portfolio: \url{https://priya.dev}
\end{document}
`;

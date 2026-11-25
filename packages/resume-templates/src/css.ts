/**
 * Print CSS shared by the web preview and the PDF (prd.md §10.3).
 * A4, fixed margins, single column, real text only. Screen and print use
 * the same content width (210mm − 2×18mm), so lines wrap identically.
 */

export const PAGE = { widthMm: 210, heightMm: 297, marginXMm: 18, marginYMm: 16 } as const;

const SERIF = "'Source Serif 4', Georgia, serif";
const SANS = "Inter, Arial, sans-serif";
const GROTESK = "'Space Grotesk', Inter, Arial, sans-serif";
const MONO = "'JetBrains Mono', 'Courier New', monospace";

export const RESUME_CSS = `
.rp-resume{box-sizing:border-box;width:${PAGE.widthMm}mm;min-height:${PAGE.heightMm}mm;padding:${PAGE.marginYMm}mm ${PAGE.marginXMm}mm;background:#fff;color:#1a1a1a;font-family:${SANS};font-size:10pt;line-height:1.4;text-align:left;-webkit-print-color-adjust:exact;print-color-adjust:exact;font-kerning:normal}
.rp-resume *{box-sizing:border-box;margin:0;padding:0}
.rp-resume ul{list-style:none}
.rp-head{display:flex;flex-direction:column;gap:1.2mm;margin-bottom:5mm}
.rp-name{font-size:22pt;line-height:1.1;font-weight:700}
.rp-headline{font-size:11pt;font-weight:600;color:#333}
.rp-contact{display:flex;flex-wrap:wrap;column-gap:2mm;row-gap:0.5mm;font-size:9pt;color:#444}
.rp-contact li+li::before{content:"·";margin-right:2mm;color:#888}
.rp-section{margin-top:4.2mm}
.rp-h{font-size:10.5pt;font-weight:700;text-transform:uppercase;letter-spacing:.08em;padding-bottom:1mm;margin-bottom:2mm;break-after:avoid}
.rp-item{break-inside:avoid;margin-top:2.4mm}
.rp-item:first-of-type{margin-top:0}
.rp-row{display:flex;justify-content:space-between;align-items:baseline;gap:4mm}
.rp-title{font-weight:700}
.rp-date{flex:none;color:#555;font-size:9.5pt;white-space:nowrap}
.rp-sub{color:#444}
.rp-resume a{color:inherit;text-decoration:none}
.rp-link{font-size:9pt}
.rp-link a{color:#1f4e8c;text-decoration:underline;text-underline-offset:0.4mm;word-break:break-all}
.rp-lines{margin-top:0.8mm;display:flex;flex-direction:column;gap:0.6mm}
.rp-bullet{position:relative;padding-left:4mm}
.rp-bullet::before{content:"•";position:absolute;left:0.6mm}
.rp-tags{line-height:1.3}
.rp-tag-label{font-weight:700;margin-right:1mm}

.rp-t-classic{font-family:${SERIF};font-size:10.5pt}
.rp-t-classic .rp-head{align-items:center;text-align:center}
.rp-t-classic .rp-contact{justify-content:center}
.rp-t-classic .rp-h{border-bottom:1px solid #111;color:#111}

.rp-t-modern .rp-name{font-family:${GROTESK};letter-spacing:-.01em;color:#0f1b2a;font-size:24pt}
.rp-t-modern .rp-headline{color:#0a5bad}
.rp-t-modern .rp-h{font-family:${GROTESK};color:#0a5bad;border-bottom:2px solid #0a5bad;letter-spacing:.06em}

.rp-t-minimal{line-height:1.5}
.rp-t-minimal .rp-name{font-weight:600;font-size:20pt}
.rp-t-minimal .rp-h{color:#555;font-size:9.5pt;font-weight:600;letter-spacing:.14em;padding-bottom:0}
.rp-t-minimal .rp-section{margin-top:6mm}

.rp-t-professional .rp-name,.rp-t-professional .rp-h{font-family:${SERIF};color:#0f1b2a}
.rp-t-professional .rp-head{border-bottom:1px solid #9aa8b8;padding-bottom:3mm}
.rp-t-professional .rp-h{text-transform:none;letter-spacing:0;font-size:12.5pt;border-bottom:1px solid #9aa8b8}

.rp-t-technical{font-size:9.6pt}
.rp-t-technical .rp-name{font-family:${MONO};font-size:20pt;letter-spacing:-.02em}
.rp-t-technical .rp-h{font-family:${MONO};font-size:10pt;letter-spacing:.04em;border-bottom:1px dashed #9aa8b8;color:#0f1b2a}
.rp-t-technical .rp-tags{display:flex;flex-wrap:wrap;gap:1mm 1.5mm}
.rp-t-technical .rp-sep{display:none}
.rp-t-technical .rp-tag{border:1px solid #c5ced8;border-radius:1mm;padding:0 1.2mm;font-family:${MONO};font-size:8.6pt}
.rp-t-technical .rp-date{font-family:${MONO};font-size:8.6pt}

@page{size:A4;margin:${PAGE.marginYMm}mm ${PAGE.marginXMm}mm}
@media print{
  html,body{margin:0;padding:0;background:#fff}
  .rp-resume{width:auto;min-height:0;padding:0}
}
`;

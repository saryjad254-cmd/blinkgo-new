import { readFile } from 'node:fs/promises';
import path from 'node:path';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, PDFPage, PDFFont, rgb } from 'pdf-lib';
import type { IssuedFinancialDocument } from '@/lib/financial-documents';

const PAGE = { width: 595.28, height: 841.89, margin: 46 };
const colors = { ink: rgb(0.055, 0.055, 0.06), muted: rgb(0.36, 0.36, 0.4), red: rgb(0.88, 0.025, 0.02), yellow: rgb(1, 0.78, 0.03), line: rgb(0.86, 0.86, 0.88), white: rgb(1, 1, 1) };

function eur(value: unknown) { return `${Number(value ?? 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR`; }
function clean(value: unknown) { return String(value ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim(); }
function split(text: string, font: PDFFont, size: number, maxWidth: number) {
  const words = clean(text).split(' '); const lines: string[] = []; let current = '';
  for (const word of words) { const next = current ? `${current} ${word}` : word; if (font.widthOfTextAtSize(next, size) <= maxWidth) current = next; else { if (current) lines.push(current); current = word; } }
  if (current) lines.push(current); return lines.length ? lines : [''];
}

export async function renderFinancialDocumentPdf(document: IssuedFinancialDocument): Promise<Uint8Array> {
  const pdf = await PDFDocument.create(); pdf.registerFontkit(fontkit);
  const fontRoot = path.join(process.cwd(), 'node_modules', '@fontsource', 'noto-sans', 'files');
  const [regularBytes, boldBytes] = await Promise.all([
    readFile(path.join(fontRoot, 'noto-sans-latin-400-normal.woff')),
    readFile(path.join(fontRoot, 'noto-sans-latin-700-normal.woff')),
  ]);
  const regular = await pdf.embedFont(regularBytes, { subset: true });
  const bold = await pdf.embedFont(boldBytes, { subset: true });
  let page = pdf.addPage([PAGE.width, PAGE.height]); let y = PAGE.height - PAGE.margin;
  const draw = (text: string, x: number, size = 9, font: PDFFont = regular, color = colors.ink, maxWidth?: number) => {
    const lines = maxWidth ? split(text, font, size, maxWidth) : [clean(text)];
    for (const line of lines) { page.drawText(line, { x, y, size, font, color }); y -= size * 1.45; }
  };
  const nextPage = () => { page = pdf.addPage([PAGE.width, PAGE.height]); y = PAGE.height - PAGE.margin; };
  const ensure = (height: number) => { if (y - height < PAGE.margin + 28) nextPage(); };
  const row = (label: string, value: string, strong = false) => { ensure(18); const font = strong ? bold : regular; page.drawText(label, { x: PAGE.margin, y, size: strong ? 10 : 9, font, color: strong ? colors.ink : colors.muted }); const valueWidth = font.widthOfTextAtSize(value, strong ? 10 : 9); page.drawText(value, { x: PAGE.width - PAGE.margin - valueWidth, y, size: strong ? 10 : 9, font, color: colors.ink }); y -= strong ? 21 : 17; };

  page.drawRectangle({ x: 0, y: PAGE.height - 92, width: PAGE.width, height: 92, color: colors.ink });
  page.drawRectangle({ x: 0, y: PAGE.height - 7, width: PAGE.width, height: 7, color: colors.red });
  page.drawText('Blink', { x: PAGE.margin, y: PAGE.height - 58, size: 28, font: bold, color: colors.white });
  page.drawText('Go', { x: PAGE.margin + bold.widthOfTextAtSize('Blink', 28), y: PAGE.height - 58, size: 28, font: bold, color: colors.red });
  page.drawText('SCHNELL. ZUVERLAESSIG. FUER DICH.', { x: PAGE.margin, y: PAGE.height - 76, size: 7, font: bold, color: colors.yellow });
  y = PAGE.height - 128;
  const isReceipt = document.document_type === 'customer_receipt';
  draw(isReceipt ? 'BESTELLBELEG' : 'TRANSAKTIONSUEBERSICHT', PAGE.margin, 18, bold);
  draw(isReceipt ? 'Keine Steuerrechnung' : 'Keine Auszahlungsbestaetigung / keine Steuerrechnung', PAGE.margin, 9, bold, colors.red);
  y -= 5;
  row('Dokumentnummer', document.document_number, true);
  row('Ausgestellt am', new Date(document.issued_at).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' }));
  row('Bestellnummer', clean(document.snapshot.order.order_number), true);
  row('Bestelldatum', new Date(String(document.snapshot.order.created_at)).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' }));
  row('Zahlung', `${clean(document.snapshot.order.payment_method)} / ${clean(document.snapshot.order.payment_status)}`);
  y -= 9;
  draw('VERTRAGSPARTNER / HAENDLER', PAGE.margin, 9, bold, colors.red);
  draw(document.snapshot.merchant.legal_name || document.snapshot.merchant.name, PAGE.margin, 11, bold);
  draw(document.snapshot.merchant.address || 'Anschrift noch nicht hinterlegt', PAGE.margin, 9, regular, colors.muted, 310);
  if (document.snapshot.merchant.vat_id) draw(`USt-IdNr.: ${document.snapshot.merchant.vat_id}`, PAGE.margin, 9, regular, colors.muted);
  y -= 5;
  draw('KUNDE', PAGE.margin, 9, bold, colors.red);
  draw(document.snapshot.customer.name, PAGE.margin, 10, bold, colors.ink, 300);
  if (document.snapshot.customer.email) draw(document.snapshot.customer.email, PAGE.margin, 8, regular, colors.muted, 300);
  y -= 12;
  page.drawLine({ start: { x: PAGE.margin, y }, end: { x: PAGE.width - PAGE.margin, y }, thickness: 1, color: colors.line }); y -= 22;
  draw('POSITIONEN', PAGE.margin, 10, bold);
  for (const item of document.snapshot.items) {
    ensure(38); const qty = Number(item.quantity ?? 0); const name = `${qty} x ${clean(item.name)}`; const amount = eur(item.line_total);
    page.drawText(name.slice(0, 64), { x: PAGE.margin, y, size: 9, font: regular, color: colors.ink });
    page.drawText(amount, { x: PAGE.width - PAGE.margin - regular.widthOfTextAtSize(amount, 9), y, size: 9, font: regular, color: colors.ink }); y -= 18;
  }
  y -= 4; page.drawLine({ start: { x: PAGE.margin, y }, end: { x: PAGE.width - PAGE.margin, y }, thickness: 1, color: colors.line }); y -= 19;
  row('Zwischensumme', eur(document.snapshot.totals.subtotal));
  if (document.snapshot.totals.discount) row('Rabatt', `- ${eur(document.snapshot.totals.discount)}`);
  row('Liefergebuehr', eur(document.snapshot.totals.delivery_fee));
  row('Servicegebuehr', eur(document.snapshot.totals.service_fee));
  if (document.snapshot.totals.tip) row('Trinkgeld', eur(document.snapshot.totals.tip));
  row('GESAMT', eur(document.snapshot.totals.total), true);
  if (document.snapshot.merchant_settlement) {
    y -= 10; draw('VORLAEUFIGE HAENDLERABRECHNUNG', PAGE.margin, 10, bold, colors.red);
    row(`Plattformprovision (${Math.round(document.snapshot.merchant_settlement.commission_rate * 100)}%)`, `- ${eur(document.snapshot.merchant_settlement.commission_amount)}`);
    row('Haendler-Netto vor Korrekturen', eur(document.snapshot.merchant_settlement.merchant_net_before_adjustments), true);
  }
  y -= 14; ensure(75);
  page.drawRectangle({ x: PAGE.margin, y: y - 48, width: PAGE.width - PAGE.margin * 2, height: 58, color: rgb(1, 0.97, 0.82), borderColor: colors.yellow, borderWidth: 1 });
  y -= 8; draw(document.snapshot.legal.notice, PAGE.margin + 12, 8.5, bold, colors.ink, PAGE.width - PAGE.margin * 2 - 24);
  draw('BlinkGo vermittelt die Bestellung. Steuerliche Angaben muessen vor Aktivierung echter Rechnungen durch Steuerberatung und Plattformbetreiber freigegeben werden.', PAGE.margin + 12, 7.5, regular, colors.muted, PAGE.width - PAGE.margin * 2 - 24);
  const pages = pdf.getPages(); pages.forEach((p, index) => { p.drawText(`blinkgo.de  |  Seite ${index + 1}/${pages.length}  |  Snapshot ${document.snapshot_sha256.slice(0, 12)}`, { x: PAGE.margin, y: 24, size: 7, font: regular, color: colors.muted }); });
  pdf.setTitle(`${isReceipt ? 'Bestellbeleg' : 'Transaktionsuebersicht'} ${document.document_number}`); pdf.setAuthor('BlinkGo'); pdf.setCreationDate(new Date(document.issued_at));
  return pdf.save({ useObjectStreams: false });
}

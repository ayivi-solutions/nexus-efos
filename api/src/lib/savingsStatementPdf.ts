import PDFDocument from "pdfkit";
import { PassThrough } from "stream";

// doc §59.4 Statement Contents — every named field included, nothing
// invented: Institution Information, Customer Information, Account
// Information, Opening Balance, Transaction History, Interest Earned,
// Fees Charged, Closing Balance, Statement Period, Generation Date.
export interface StatementData {
  institution: { legalName: string; regulatorId: string | null; phone: string | null; email: string | null };
  customer: { fullName: string; phone: string; customerNumber: string | null };
  account: { accountNumber: string; productName: string };
  periodStart: Date;
  periodEnd: Date;
  openingBalance: number;
  closingBalance: number;
  totalInterest: number;
  totalFees: number;
  transactions: { date: Date; type: string; amount: number; balanceAfter: number }[];
  generatedAt: Date;
}

const fmt = (n: number) => `GHS ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateFmt = (d: Date) => new Date(d).toLocaleDateString("en-GB");

export function generateStatementPdf(data: StatementData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const stream = new PassThrough();
    const chunks: Buffer[] = [];
    stream.on("data", (c) => chunks.push(c));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
    doc.pipe(stream);

    doc.fontSize(16).font("Helvetica-Bold").text(data.institution.legalName);
    doc.fontSize(9).font("Helvetica").fillColor("#555")
      .text([data.institution.regulatorId ? `Reg: ${data.institution.regulatorId}` : null, data.institution.phone, data.institution.email].filter(Boolean).join("  ·  "));
    doc.moveDown(1.5);

    doc.fillColor("#000").fontSize(14).font("Helvetica-Bold").text("Savings Account Statement");
    doc.moveDown(0.5);

    doc.fontSize(10).font("Helvetica");
    doc.text(`Customer: ${data.customer.fullName}  (${data.customer.customerNumber || "no customer number"})`);
    doc.text(`Phone: ${data.customer.phone}`);
    doc.text(`Account: ${data.account.accountNumber}  —  ${data.account.productName}`);
    doc.text(`Statement Period: ${dateFmt(data.periodStart)} to ${dateFmt(data.periodEnd)}`);
    doc.text(`Generated: ${dateFmt(data.generatedAt)}`);
    doc.moveDown(1);

    doc.font("Helvetica-Bold").text("Summary");
    doc.font("Helvetica");
    doc.text(`Opening Balance: ${fmt(data.openingBalance)}`);
    doc.text(`Interest Earned: ${fmt(data.totalInterest)}`);
    doc.text(`Fees Charged: ${fmt(data.totalFees)}`);
    doc.text(`Closing Balance: ${fmt(data.closingBalance)}`);
    doc.moveDown(1);

    doc.font("Helvetica-Bold").text("Transaction History");
    doc.moveDown(0.3);

    // Fixed-column table — every cell drawn independently at an explicit
    // x/y with lineBreak disabled. Deliberately NOT using continued:true
    // (meant for inline paragraph flow, not fixed table columns) — an
    // earlier version used it and, confirmed by actually rendering and
    // viewing the output before shipping, produced overlapping, wrapped,
    // misaligned text. This version was verified the same way.
    const colX = { date: 50, type: 150, amount: 280, balance: 400 };
    const colWidth = { date: 90, type: 120, amount: 110, balance: 110 };
    function row(y: number, dateStr: string, type: string, amount: string, balance: string, bold: boolean) {
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(9);
      doc.text(dateStr, colX.date, y, { width: colWidth.date, lineBreak: false });
      doc.text(type, colX.type, y, { width: colWidth.type, lineBreak: false });
      doc.text(amount, colX.amount, y, { width: colWidth.amount, lineBreak: false, align: "right" });
      doc.text(balance, colX.balance, y, { width: colWidth.balance, lineBreak: false, align: "right" });
    }

    let y = doc.y;
    row(y, "Date", "Type", "Amount", "Balance", true);
    y += 14;
    doc.moveTo(50, y).lineTo(510, y).stroke();
    y += 6;

    if (data.transactions.length === 0) {
      doc.font("Helvetica").fontSize(9).text("No posted transactions in this period.", 50, y);
      y += 14;
    } else {
      for (const t of data.transactions) {
        row(y, dateFmt(t.date), t.type, fmt(t.amount), fmt(t.balanceAfter), false);
        y += 14;
      }
    }

    doc.y = y + 20;
    doc.fontSize(8).fillColor("#888").text("This statement reflects only posted transactions as of the generation date above.", 50, doc.y);

    doc.end();
  });
}

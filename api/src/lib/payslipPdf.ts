import PDFDocument from "pdfkit";
import { PassThrough } from "stream";

// doc §213.2 "Electronic Payslips" — every real figure a payslip needs:
// earnings breakdown, statutory deductions, other deductions, net pay.
// Uses the same fixed-column table technique confirmed correct (by
// actually rendering and viewing the output) for Savings Statements —
// PDFKit's continued:true text chaining was proven broken there and is
// deliberately not used here either.
export interface PayslipData {
  institution: { legalName: string; regulatorId: string | null };
  employee: { fullName: string; employeeNumber: string | null };
  periodName: string;
  payDate: Date;
  basicSalary: number;
  allowances: { name: string; amount: number }[];
  grossPay: number;
  paye: number;
  ssnitEmployee: number;
  otherDeductions: { name: string; amount: number }[];
  netPay: number;
  generatedAt: Date;
}

const fmt = (n: number) => `GHS ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateFmt = (d: Date) => new Date(d).toLocaleDateString("en-GB");

export function generatePayslipPdf(data: PayslipData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const stream = new PassThrough();
    const chunks: Buffer[] = [];
    stream.on("data", (c) => chunks.push(c));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
    doc.pipe(stream);

    doc.fontSize(16).font("Helvetica-Bold").text(data.institution.legalName);
    doc.fontSize(9).font("Helvetica").fillColor("#555").text(data.institution.regulatorId ? `Reg: ${data.institution.regulatorId}` : "");
    doc.moveDown(1.5);

    doc.fillColor("#000").fontSize(14).font("Helvetica-Bold").text("Payslip");
    doc.moveDown(0.5);

    doc.fontSize(10).font("Helvetica");
    doc.text(`Employee: ${data.employee.fullName}  (${data.employee.employeeNumber || "no employee number"})`);
    doc.text(`Pay Period: ${data.periodName}`);
    doc.text(`Pay Date: ${dateFmt(data.payDate)}`);
    doc.text(`Generated: ${dateFmt(data.generatedAt)}`);
    doc.moveDown(1);

    // Fixed-column table for earnings/deductions — same technique
    // confirmed correct for Savings Statements, not continued:true.
    const colLabel = 50, colAmount = 400;
    const colWidthLabel = 340, colWidthAmount = 110;
    function row(y: number, label: string, amount: string, bold: boolean) {
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(9.5);
      doc.text(label, colLabel, y, { width: colWidthLabel, lineBreak: false });
      doc.text(amount, colAmount, y, { width: colWidthAmount, lineBreak: false, align: "right" });
    }

    let y = doc.y;
    doc.font("Helvetica-Bold").fontSize(11).text("Earnings", colLabel, y);
    y += 18;
    row(y, "Basic Salary", fmt(data.basicSalary), false); y += 14;
    for (const a of data.allowances) { row(y, a.name, fmt(a.amount), false); y += 14; }
    doc.moveTo(colLabel, y).lineTo(colAmount + colWidthAmount, y).stroke(); y += 6;
    row(y, "Gross Pay", fmt(data.grossPay), true); y += 24;

    doc.font("Helvetica-Bold").fontSize(11).text("Deductions", colLabel, y);
    y += 18;
    row(y, "PAYE (Income Tax)", fmt(data.paye), false); y += 14;
    row(y, "SSNIT Employee Contribution", fmt(data.ssnitEmployee), false); y += 14;
    for (const d of data.otherDeductions) { row(y, d.name, fmt(d.amount), false); y += 14; }
    const totalDeductions = data.paye + data.ssnitEmployee + data.otherDeductions.reduce((s, d) => s + d.amount, 0);
    doc.moveTo(colLabel, y).lineTo(colAmount + colWidthAmount, y).stroke(); y += 6;
    row(y, "Total Deductions", fmt(totalDeductions), true); y += 24;

    doc.moveTo(colLabel, y).lineTo(colAmount + colWidthAmount, y).lineWidth(1.5).stroke();
    y += 6;
    doc.font("Helvetica-Bold").fontSize(12);
    doc.text("Net Pay", colLabel, y, { width: colWidthLabel, lineBreak: false });
    doc.text(fmt(data.netPay), colAmount, y, { width: colWidthAmount, lineBreak: false, align: "right" });

    doc.y = y + 40;
    doc.fontSize(8).font("Helvetica").fillColor("#888").text("This payslip reflects the figures processed and approved for this pay period.", 50, doc.y);

    doc.end();
  });
}

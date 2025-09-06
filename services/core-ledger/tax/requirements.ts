export type Scope = "ITR14" | "VAT" | "PAYE" | "PROVISIONAL";

export type Requirement = {
  key: string;               // unique id
  label: string;             // human label
  patterns: RegExp[];        // filename patterns to match
  minCount?: number;         // default 1
  optional?: boolean;
};

type Matrix = Record<Scope, Requirement[]>;

// NOTE: keep patterns conservative; we can refine as we see real files
export const REQUIREMENTS: Matrix = {
  ITR14: [
    { key: "ita34", label: "ITA34 Assessment", patterns: [/^ita?34.*\.pdf$/i] },
    { key: "irp5", label: "IRP5/IT3(a)", patterns: [/^irp5.*\.pdf$/i, /^it3a.*\.pdf$/i], minCount: 1 },
    { key: "bank", label: "Bank Statements", patterns: [/bank.*statement.*\.(pdf|csv)$/i], minCount: 1 },
    { key: "rais", label: "RA / Retirement Annuity Cert", patterns: [/retirement.*annuity.*(cert|certificate).*\.pdf$/i], optional: true },
    { key: "med", label: "Medical Aid Tax Cert", patterns: [/medical.*(aid)?.*(tax)?.*cert.*\.pdf$/i], optional: true },
    { key: "it3b", label: "Investment IT3(b)", patterns: [/it3b.*\.pdf$/i], optional: true },
  ],
  VAT: [
    { key: "vat201", label: "VAT201 Returns", patterns: [/^vat201.*\.pdf$/i], minCount: 1 },
    { key: "pop", label: "Proof of Payment", patterns: [/(proof|pop).*payment.*(vat)?.*\.pdf$/i], minCount: 1, optional: true },
    { key: "sales", label: "Sales Invoices", patterns: [/sales.*invoice.*\.pdf$/i], optional: true },
    { key: "purchases", label: "Purchase Invoices", patterns: [/(purchase|supplier).*invoice.*\.pdf$/i], optional: true },
    { key: "bank", label: "Bank Statements", patterns: [/bank.*statement.*\.(pdf|csv)$/i], minCount: 1 },
  ],
  PAYE: [
    { key: "emp201", label: "EMP201 Declarations", patterns: [/^emp201.*\.pdf$/i], minCount: 1 },
    { key: "emp501", label: "EMP501 Reconciliations", patterns: [/^emp501.*\.pdf$/i], optional: true },
    { key: "payslips", label: "Payslips", patterns: [/payslip.*\.pdf$/i], optional: true },
    { key: "uir", label: "UIF/SDL Proofs", patterns: [/(uif|sdl).*\.pdf$/i], optional: true },
  ],
  PROVISIONAL: [
    { key: "irp6", label: "IRP6 Returns", patterns: [/^irp6.*\.pdf$/i], minCount: 1 },
    { key: "calc", label: "Tax Calc / Working", patterns: [/(tax)?.*(calc|calculation|working).*\.pdf$/i], optional: true },
    { key: "bank", label: "Bank Proof of Payment", patterns: [/(proof|pop).*payment.*(irp6|prov|tax).*\.pdf$/i], optional: true },
  ],
};

export function keysFor(scope: Scope) {
  return REQUIREMENTS[scope].map(r => r.key);
}

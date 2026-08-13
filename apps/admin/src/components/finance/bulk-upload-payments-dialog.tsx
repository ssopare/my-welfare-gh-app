"use client";

import { useState, useTransition, useRef } from "react";
import { Loader2, Upload, AlertCircle, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { Member, Fund } from "@welfare/shared-types";
import { bulkRecordPaymentsAction, type BulkPaymentRow, type BulkPaymentResult } from "@/app/(app)/ledger/actions";

interface BulkUploadPaymentsDialogProps {
  members: Member[];
  funds: Fund[];
}

interface ParsedRow {
  phoneNumber: string;
  fundName: string;
  amount: string;
  reference: string;
  isValid: boolean;
  error?: string;
  resolvedMember?: Member;
  resolvedFund?: Fund;
}

export function BulkUploadPaymentsDialog({ members, funds }: BulkUploadPaymentsDialogProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [result, setResult] = useState<BulkPaymentResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function resetForm() {
    setParsedRows([]);
    setResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function downloadTemplate() {
    const csvContent = "phoneNumber,fundName,amount,reference\n0244123456,General Welfare Fund,20.00,July Dues\n0200123456,Bereavement Fund,50.00,Special Appeal\n";
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "payments_upload_template.csv");
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const rows = parseAndValidateCSV(text);
        setParsedRows(rows);
        setResult(null);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to parse CSV file");
        resetForm();
      }
    };
    reader.readAsText(file);
  }

  function parseAndValidateCSV(text: string): ParsedRow[] {
    const lines = text.split(/\r?\n/);
    if (lines.length < 2) {
      throw new Error("CSV file is empty or missing data rows");
    }

    const headers = lines[0]
      .toLowerCase()
      .split(",")
      .map((h) => h.trim().replace(/^["']|["']$/g, ""));

    const phoneIdx = headers.indexOf("phonenumber");
    const fundIdx = headers.indexOf("fundname");
    const amountIdx = headers.indexOf("amount");
    const refIdx = headers.indexOf("reference");

    if (phoneIdx === -1 || fundIdx === -1 || amountIdx === -1) {
      throw new Error("CSV must contain 'phoneNumber', 'fundName', and 'amount' columns.");
    }

    const resultRows: ParsedRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const cells = line.split(",").map((c) => c.trim().replace(/^["']|["']$/g, ""));
      const rawPhone = cells[phoneIdx] || "";
      const rawFund = cells[fundIdx] || "";
      const rawAmount = cells[amountIdx] || "";
      const rawRef = refIdx !== -1 ? cells[refIdx] || "" : "";

      const cleanPhone = rawPhone.replace(/[-\s()]/g, "");
      const cleanAmount = parseFloat(rawAmount);

      let isValid = true;
      let error = "";
      let resolvedMember: Member | undefined;
      let resolvedFund: Fund | undefined;

      // 1. Resolve Member
      if (!cleanPhone) {
        isValid = false;
        error = "Missing phone number";
      } else {
        resolvedMember = members.find(
          (m) => m.account.phoneNumber.replace(/[-\s()]/g, "") === cleanPhone
        );
        if (!resolvedMember) {
          isValid = false;
          error = "Phone number not registered to a member";
        }
      }

      // 2. Resolve Fund
      if (isValid) {
        if (!rawFund) {
          isValid = false;
          error = "Missing fund name";
        } else {
          resolvedFund = funds.find(
            (f) => f.name.toLowerCase() === rawFund.toLowerCase()
          );
          if (!resolvedFund) {
            isValid = false;
            error = "Fund name not found";
          } else {
            const isRestricted = resolvedFund.name.toLowerCase().includes("executive") || 
                                 resolvedFund.name.toLowerCase().includes("officer") ||
                                 resolvedFund.name.toLowerCase().includes("leadership");
            if (isRestricted) {
              const isOfficer = resolvedMember?.category?.toLowerCase().includes("officer") || 
                                resolvedMember?.category?.toLowerCase().includes("executive");
              if (!isOfficer) {
                isValid = false;
                error = `Restricted Fund: Member category (${resolvedMember?.category || "regular"}) is not eligible.`;
              }
            }
          }
        }
      }

      // 3. Resolve Amount
      if (isValid) {
        if (isNaN(cleanAmount) || cleanAmount <= 0) {
          isValid = false;
          error = "Amount must be a positive number";
        }
      }

      resultRows.push({
        phoneNumber: rawPhone,
        fundName: rawFund,
        amount: rawAmount,
        reference: rawRef,
        isValid,
        error: error || undefined,
        resolvedMember,
        resolvedFund,
      });
    }

    if (resultRows.length === 0) {
      throw new Error("No data rows found in CSV.");
    }

    return resultRows;
  }

  function handleUpload() {
    const validRows = parsedRows.filter((r) => r.isValid);
    if (validRows.length === 0) {
      toast.error("No valid rows to upload.");
      return;
    }

    const payload: BulkPaymentRow[] = validRows.map((r) => ({
      memberId: r.resolvedMember!.id,
      fundId: r.resolvedFund!.id,
      amountValue: parseFloat(r.amount).toFixed(2),
      reference: r.reference || undefined,
      namePreview: r.resolvedMember!.account.name || r.phoneNumber,
    }));

    startTransition(async () => {
      try {
        const res = await bulkRecordPaymentsAction(payload);
        setResult(res);
        if (res.successCount > 0) {
          toast.success(`Successfully uploaded ${res.successCount} payments.`);
        }
        if (res.errorCount > 0) {
          toast.error(`Failed to process ${res.errorCount} payments.`);
        }
      } catch (err) {
        toast.error("Failed to complete bulk upload.");
      }
    });
  }

  const validCount = parsedRows.filter((r) => r.isValid).length;
  const invalidCount = parsedRows.length - validCount;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) resetForm();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Upload className="size-4" />
          Bulk upload payments
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Bulk Upload Dues & Contributions</DialogTitle>
          <DialogDescription>
            Upload a CSV file containing payment allocations. Dues records will be updated and double-entry ledger lines written dynamically.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {/* File Selector */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                Required headers: <code className="bg-muted px-1.5 py-0.5 rounded font-mono">phoneNumber, fundName, amount, reference</code>
              </span>
              <Button type="button" variant="link" size="sm" onClick={downloadTemplate} className="h-auto p-0 text-xs text-primary font-medium hover:underline">
                Download Template
              </Button>
            </div>
            <input
              type="file"
              ref={fileInputRef}
              accept=".csv"
              onChange={handleFileChange}
              className="file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20 text-sm text-muted-foreground w-full cursor-pointer"
            />
          </div>

          {/* Validation Metrics */}
          {parsedRows.length > 0 && !result && (
            <div className="flex gap-4 text-xs font-semibold">
              <span className="text-status-good">Valid Rows: {validCount}</span>
              {invalidCount > 0 && <span className="text-status-bad">Errors/Warnings: {invalidCount}</span>}
            </div>
          )}

          {/* Preview rows */}
          {parsedRows.length > 0 && !result && (
            <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto rounded-lg border border-border bg-muted/30 p-2">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Payment Sheet Preview
              </span>
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="border-b border-border/60 text-muted-foreground">
                    <th className="py-1 font-medium">Member (Phone)</th>
                    <th className="py-1 font-medium">Fund</th>
                    <th className="py-1 font-medium text-right">Amount</th>
                    <th className="py-1 font-medium pl-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {parsedRows.map((row, idx) => (
                    <tr key={idx} className="py-1">
                      <td className="py-1 font-medium">
                        {row.resolvedMember?.account.name || (
                          <span className="text-muted-foreground font-mono">{row.phoneNumber}</span>
                        )}
                      </td>
                      <td className="py-1 text-muted-foreground">{row.fundName}</td>
                      <td className="py-1 text-right font-mono font-medium">GHS {row.amount}</td>
                      <td className="py-1 pl-4">
                        {row.isValid ? (
                          <span className="text-status-good font-semibold">Ready</span>
                        ) : (
                          <span className="text-status-bad text-[10px] italic leading-tight block max-w-[150px]">
                            {row.error}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Upload Complete Status */}
          {result && (
            <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/40 p-4">
              <span className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                Upload Performance Summary
              </span>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 text-sm text-status-good">
                  <CheckCircle className="size-4 shrink-0" />
                  <span>Payments recorded: <strong>{result.successCount}</strong></span>
                </div>
                {result.errorCount > 0 && (
                  <div className="flex items-center gap-2 text-sm text-status-bad">
                    <AlertCircle className="size-4 shrink-0" />
                    <span>Failed transactions: <strong>{result.errorCount}</strong></span>
                  </div>
                )}
              </div>

              {result.errors.length > 0 && (
                <div className="flex flex-col gap-1 mt-2 max-h-36 overflow-y-auto rounded bg-status-bad-bg border border-status-bad-border/40 p-2">
                  <span className="text-xs font-bold text-status-bad">Failed Transactions Log:</span>
                  {result.errors.map((err, idx) => (
                    <p key={idx} className="text-[10px] font-mono text-status-bad leading-normal">
                      {err}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setOpen(false)}
            disabled={isPending}
          >
            Close
          </Button>
          {!result && validCount > 0 && (
            <Button type="button" onClick={handleUpload} disabled={isPending}>
              {isPending ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden />
                  Uploading…
                </>
              ) : (
                `Record ${validCount} payments`
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

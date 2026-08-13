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
import { bulkCreateMembersAction, type BulkImportResult } from "@/app/(app)/members/actions";

export function BulkImportMembersDialog() {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [parsedRows, setParsedRows] = useState<{ name: string; phoneNumber: string }[]>([]);
  const [result, setResult] = useState<BulkImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function resetForm() {
    setParsedRows([]);
    setResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function downloadTemplate() {
    const csvContent = "name,phoneNumber\nKwame Mensah,0244123456\nAma Osei,0200123456\n";
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "members_upload_template.csv");
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
        const rows = parseCSV(text);
        setParsedRows(rows);
        setResult(null);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to parse CSV file");
        resetForm();
      }
    };
    reader.readAsText(file);
  }

  function parseCSV(text: string): { name: string; phoneNumber: string }[] {
    const lines = text.split(/\r?\n/);
    if (lines.length < 2) {
      throw new Error("CSV file is empty or missing data rows");
    }

    const headers = lines[0]
      .toLowerCase()
      .split(",")
      .map((h) => h.trim().replace(/^["']|["']$/g, ""));

    const nameIdx = headers.indexOf("name");
    const phoneIdx = headers.indexOf("phonenumber");

    if (nameIdx === -1 || phoneIdx === -1) {
      throw new Error("CSV must contain 'name' and 'phoneNumber' headers in the first row.");
    }

    const result: { name: string; phoneNumber: string }[] = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const cells = line.split(",").map((c) => c.trim().replace(/^["']|["']$/g, ""));
      const name = cells[nameIdx];
      const phoneNumber = cells[phoneIdx];

      if (name && phoneNumber) {
        result.push({ name, phoneNumber });
      }
    }

    if (result.length === 0) {
      throw new Error("No valid data rows found in CSV.");
    }

    return result;
  }

  function handleUpload() {
    if (parsedRows.length === 0) return;

    startTransition(async () => {
      try {
        const res = await bulkCreateMembersAction(parsedRows);
        setResult(res);
        if (res.successCount > 0) {
          toast.success(`Successfully imported ${res.successCount} member(s).`);
        }
        if (res.errorCount > 0) {
          toast.error(`Failed to import ${res.errorCount} row(s).`);
        }
      } catch (err) {
        toast.error("Failed to complete bulk import.");
      }
    });
  }

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
          Bulk import
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Bulk Import Member Records</DialogTitle>
          <DialogDescription>
            Upload a CSV file containing your members directory. New member accounts will be created and associated with this organisation.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {/* File Selector */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                Required headers: <code className="bg-muted px-1.5 py-0.5 rounded font-mono">name, phoneNumber</code>
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

          {/* Preview rows */}
          {parsedRows.length > 0 && !result && (
            <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto rounded-lg border border-border bg-muted/30 p-2">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                CSV Preview ({parsedRows.length} rows found)
              </span>
              <div className="flex flex-col divide-y divide-border/60">
                {parsedRows.slice(0, 10).map((row, idx) => (
                  <div key={idx} className="flex items-center justify-between text-xs py-1">
                    <span className="font-medium text-foreground">{row.name}</span>
                    <span className="font-mono text-muted-foreground">{row.phoneNumber}</span>
                  </div>
                ))}
                {parsedRows.length > 10 && (
                  <div className="text-center text-[10px] text-muted-foreground pt-1.5 italic">
                    Showing first 10 rows...
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Completion summary */}
          {result && (
            <div className="flex flex-col gap-3 rounded-lg border border-border/80 bg-muted/40 p-4">
              <span className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                Import Status Summary
              </span>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 text-sm text-status-good">
                  <CheckCircle className="size-4 shrink-0" />
                  <span>Successful registrations: <strong>{result.successCount}</strong></span>
                </div>
                {result.errorCount > 0 && (
                  <div className="flex items-center gap-2 text-sm text-status-bad">
                    <AlertCircle className="size-4 shrink-0" />
                    <span>Failed rows: <strong>{result.errorCount}</strong></span>
                  </div>
                )}
              </div>

              {result.errors.length > 0 && (
                <div className="flex flex-col gap-1 mt-2 max-h-36 overflow-y-auto rounded bg-status-bad-bg border border-status-bad-border/40 p-2">
                  <span className="text-xs font-bold text-status-bad">Error Details:</span>
                  {result.errors.map((err, idx) => (
                    <p key={idx} className="text-[10px] font-mono text-status-bad leading-normal">
                      {err}
                    </p>
                  ))}
                </div>
              )}

              {result.successCount > 0 && (
                <div className="flex flex-col gap-2 mt-2 rounded border border-primary/20 bg-primary/5 p-3 text-xs">
                  <span className="font-bold text-primary">Onboarding & Next Steps:</span>
                  <p className="text-muted-foreground leading-relaxed">
                    Imported members can log in to the mobile app immediately using their phone number and this temporary password:
                  </p>
                  <div className="flex items-center justify-between bg-muted border border-border p-1.5 rounded font-mono font-bold select-all text-center text-sm">
                    <span>tempPassword123!</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-normal mt-1">
                    Please share this temporary password with your newly registered members. They will be able to update it to a personal password once logged in.
                  </p>
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
          {!result && parsedRows.length > 0 && (
            <Button type="button" onClick={handleUpload} disabled={isPending}>
              {isPending ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden />
                  Uploading…
                </>
              ) : (
                "Import members"
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

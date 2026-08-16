"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { Building2, Upload, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface OrgLogoUploaderProps {
  /** Current logo URL stored on the Organisation record (may be null). */
  currentLogoUrl?: string | null;
  /** API base URL so we can build the full URL for locally-stored uploads. */
  apiBaseUrl: string;
  /** Called with the new absolute logo URL after a successful upload + save. */
  onSave: (logoUrl: string | null) => Promise<void>;
}

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB

export function OrgLogoUploader({ currentLogoUrl, apiBaseUrl, onSave }: OrgLogoUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Resolve the display URL: if it starts with /uploads, prefix with the API base.
  const displayUrl =
    preview ??
    (currentLogoUrl?.startsWith("/uploads")
      ? `${apiBaseUrl}${currentLogoUrl}`
      : currentLogoUrl) ??
    null;

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Only JPEG, PNG, or WebP images are accepted.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Image must be smaller than 2 MB.");
      return;
    }
    setSelectedFile(file);
    setPreview(URL.createObjectURL(file));
  }

  function handleSave() {
    if (!selectedFile) return;
    startTransition(async () => {
      setError(null);
      const formData = new FormData();
      formData.append("file", selectedFile);

      const resp = await fetch(`${apiBaseUrl}/upload/avatar`, {
        method: "POST",
        body: formData,
        // Note: don't set Content-Type — browser must set the multipart boundary.
        credentials: "include",
      });

      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        setError(body.message ?? "Upload failed. Please try again.");
        return;
      }
      const { url } = await resp.json() as { url: string };
      await onSave(url);
      setSelectedFile(null);
      setPreview(null);
    });
  }

  function handleRemove() {
    startTransition(async () => {
      await onSave(null);
      setPreview(null);
      setSelectedFile(null);
    });
  }

  function handleDiscard() {
    setPreview(null);
    setSelectedFile(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Logo preview area */}
      <div className="flex items-center gap-4">
        <div
          className={cn(
            "relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border-2",
            displayUrl ? "border-glass-border" : "border-dashed border-border bg-muted"
          )}
        >
          {displayUrl ? (
            <Image src={displayUrl} alt="Organisation logo" fill className="object-cover" unoptimized />
          ) : (
            <Building2 className="size-8 text-muted-foreground" />
          )}
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => inputRef.current?.click()}
              disabled={isPending}
              className="gap-1.5"
            >
              <Upload className="size-3.5" />
              {displayUrl ? "Change Logo" : "Upload Logo"}
            </Button>
            {displayUrl && !selectedFile && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={handleRemove}
                disabled={isPending}
                className="gap-1.5 text-destructive hover:text-destructive"
              >
                <X className="size-3.5" />
                Remove
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            JPEG, PNG or WebP · Max 2 MB · Recommended: 256 × 256 px
          </p>
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFileSelected}
      />

      {/* Staged file actions */}
      {selectedFile && (
        <div className="flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50/50 px-3 py-2 dark:border-indigo-800/40 dark:bg-indigo-950/20">
          <span className="flex-1 text-sm text-foreground truncate">{selectedFile.name}</span>
          <Button size="sm" onClick={handleSave} disabled={isPending} className="gap-1.5">
            {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
            Save Logo
          </Button>
          <Button size="sm" variant="ghost" onClick={handleDiscard} disabled={isPending}>
            Discard
          </Button>
        </div>
      )}

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}
    </div>
  );
}

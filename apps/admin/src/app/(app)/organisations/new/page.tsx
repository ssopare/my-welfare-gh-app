import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CreateOrganisationForm } from "./create-organisation-form";

export const metadata: Metadata = {
  title: "New organisation — Welfare Platform",
};

export default function NewOrganisationPage() {
  return (
    <div className="flex flex-col gap-6">
      <Link href="/" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden />
        Back to dashboard
      </Link>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Create a new organisation</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          You&apos;ll become the founding administrator of a brand-new welfare group — your account
          keeps every membership it already has elsewhere.
        </p>
      </div>

      <Card className="max-w-lg border-glass-border bg-glass-card/65 shadow-lg backdrop-blur-md dark:bg-glass-card/45">
        <CardHeader>
          <CardTitle className="text-base">Organisation details</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateOrganisationForm />
        </CardContent>
      </Card>
    </div>
  );
}

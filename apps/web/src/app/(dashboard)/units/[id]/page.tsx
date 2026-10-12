"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Building, FileText, Receipt } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { unitApi } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

type ReceiptRecord = {
  id: string;
  receiptNumber: string;
  amount: number;
  status: string;
  receiptDate: string;
};

type QuotationRecord = {
  id: string;
  number: string;
  status: string;
  totalAmount: number;
  receivedAmount: number;
  balanceAmount: number;
  paymentProgress: number;
  createdAt: string;
  lead?: { id: string; firstName: string | null; lastName: string | null } | null;
  bookings: Array<{ id: string; number: string; status: string }>;
  receipts: ReceiptRecord[];
};

type UnitRecord = {
  id: string;
  number: string;
  type?: string | null;
  floor?: number | null;
  area?: number | null;
  price?: number | null;
  status: string;
  project?: { id: string; name: string } | null;
  financialSummary?: { quotations: QuotationRecord[] };
};

const currency = (amount: number) => new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(amount);

export default function UnitDetailPage() {
  const params = useParams();
  const { toast } = useToast();
  const [unit, setUnit] = React.useState<UnitRecord | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    unitApi.get(params.id as string).then((response) => {
      if (!response.data?.success || !response.data.data) {
        throw new Error(response.data?.error || "Unit not found");
      }
      if (!cancelled) setUnit(response.data.data);
    }).catch((error: any) => {
      if (!cancelled) toast({
        title: "Unable to load unit",
        description: error?.response?.data?.error || error?.message || "Please try again.",
        variant: "destructive",
      });
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [params.id, toast]);

  if (loading) return <div className="space-y-4 p-4"><Skeleton className="h-16 w-full" /><Skeleton className="h-48 w-full" /></div>;
  if (!unit) return <p className="p-6 text-sm text-muted-foreground">Unit not found or unavailable.</p>;

  const quotations = unit.financialSummary?.quotations || [];
  const activeQuotation = quotations.find((quotation) => quotation.bookings.some((booking) => booking.status !== "CANCELLED"))
    || [...quotations].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())[0];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild><Link href="/units" aria-label="Back to units"><ArrowLeft className="h-4 w-4" /></Link></Button>
          <span className="flex h-11 w-11 items-center justify-center rounded-md bg-primary text-primary-foreground"><Building className="h-5 w-5" /></span>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Unit</p>
            <h1 className="text-lg font-semibold">{unit.number}</h1>
            <p className="text-sm text-muted-foreground">{unit.project?.name || "Project"}{unit.type ? ` · ${unit.type}` : ""}</p>
          </div>
        </div>
        <Badge>{unit.status.replace(/_/g, " ")}</Badge>
      </header>

      <Card>
        <CardHeader><CardTitle>Unit Details</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div><p className="text-sm text-muted-foreground">Project</p><p className="font-medium">{unit.project?.name || "—"}</p></div>
          <div><p className="text-sm text-muted-foreground">Unit Type</p><p className="font-medium">{unit.type || "—"}</p></div>
          <div><p className="text-sm text-muted-foreground">Floor</p><p className="font-medium">{unit.floor ?? "—"}</p></div>
          <div><p className="text-sm text-muted-foreground">Area</p><p className="font-medium">{unit.area == null ? "—" : `${unit.area} sq.ft`}</p></div>
        </CardContent>
      </Card>

      {!quotations.length ? (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No quotations are linked to this unit yet.</CardContent></Card>
      ) : (
        <>
          {activeQuotation && <section className="space-y-3">
            <h2 className="text-base font-semibold">Financial Summary · {activeQuotation.number}</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                ["Quotation Amount", activeQuotation.totalAmount],
                ["Received Amount", activeQuotation.receivedAmount],
                ["Balance Amount", activeQuotation.balanceAmount],
              ].map(([label, value]) => (
                <Card key={String(label)}><CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <p className="mt-1 text-lg font-semibold">{currency(Number(value))}</p>
                </CardContent></Card>
              ))}
            </div>
            <Card><CardContent className="space-y-2 p-4">
              <div className="flex justify-between text-sm"><span>Payment Progress</span><span>{activeQuotation.paymentProgress.toFixed(1)}%</span></div>
              <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${activeQuotation.paymentProgress}%` }} /></div>
            </CardContent></Card>
          </section>}

          <section className="space-y-3">
            <h2 className="text-base font-semibold">Quotation and Receipt History</h2>
            {quotations.map((quotation) => (
              <Card key={quotation.id}>
                <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
                  <div className="space-y-1">
                    <CardTitle className="flex items-center gap-2 text-base"><FileText className="h-4 w-4" />{quotation.number}</CardTitle>
                    <p className="text-sm text-muted-foreground">{quotation.lead ? `${quotation.lead.firstName || ""} ${quotation.lead.lastName || ""}`.trim() : "Customer not linked"} · {quotation.status}</p>
                  </div>
                  <Button variant="outline" size="sm" asChild><Link href={`/quotations/${quotation.id}`}>View Quotation</Link></Button>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div><p className="text-xs text-muted-foreground">Quotation Amount</p><p className="font-medium">{currency(quotation.totalAmount)}</p></div>
                    <div><p className="text-xs text-muted-foreground">Received</p><p className="font-medium">{currency(quotation.receivedAmount)}</p></div>
                    <div><p className="text-xs text-muted-foreground">Balance</p><p className="font-medium">{currency(quotation.balanceAmount)}</p></div>
                  </div>
                  <div className="space-y-2 border-t pt-3">
                    <h3 className="flex items-center gap-2 text-sm font-medium"><Receipt className="h-4 w-4" />Receipts</h3>
                    {!quotation.receipts.length ? <p className="text-sm text-muted-foreground">No receipts linked to this quotation.</p> : quotation.receipts.map((receipt) => (
                      <div key={receipt.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <Link className="text-primary hover:underline" href={`/receipts/${receipt.id}`}>{receipt.receiptNumber}</Link>
                        <span>{currency(receipt.amount)}</span>
                        <Badge variant={receipt.status === "ISSUED" ? "success" : "destructive"}>{receipt.status}</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </section>
        </>
      )}
    </div>
  );
}

"use client";

import * as React from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { opportunityApi, paymentApi, receiptApi } from "@/lib/api";
import { formatDate, formatDateTime } from "@/lib/date-format";

interface BookingOption {
  id: string;
  number: string;
  totalAmount: number;
  status: string;
}

interface Installment {
  id: string;
  bookingId: string;
  sequenceNumber: number;
  name: string;
  dueDate: string;
  scheduledAmount: number;
  receivedAmount: number;
  outstandingAmount: number;
  status: string;
}

interface PaymentRecord {
  id: string;
  bookingId: string;
  bookingNumber: string;
  amount: number;
  status: string;
  paymentDate: string;
  reference: string | null;
  allocatedAmount: number;
  unallocatedAmount: number;
  receipt: { id: string; receiptNumber: string; status: string } | null;
}

interface FinancialSummary {
  approvedQuotation: { id: string; number: string; totalAmount: number } | null;
  bookingAmount: number;
  scheduledAmount: number;
  verifiedPaymentAmount: number;
  allocatedAmount: number;
  unallocatedPaymentAmount: number;
  outstandingAmount: number;
  installmentOutstandingAmount: number;
  overdueAmount: number;
  upcomingAmount: number;
  installments: Installment[];
  payments: PaymentRecord[];
}

interface OpportunityFinancialWorkspaceProps {
  opportunityId: string;
  customerName: string;
  bookings: BookingOption[];
}

const currency = (amount: number) => new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(amount);

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export default function OpportunityFinancialWorkspace({
  opportunityId,
  customerName,
  bookings,
}: OpportunityFinancialWorkspaceProps) {
  const { toast } = useToast();
  const { hasEffectivePermission } = useAuth();
  const activeBookings = React.useMemo(
    () => bookings.filter((booking) => booking.status !== "CANCELLED"),
    [bookings],
  );
  const [summary, setSummary] = React.useState<FinancialSummary | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [bookingId, setBookingId] = React.useState(activeBookings[0]?.id || "");
  const [amount, setAmount] = React.useState("");
  const [payer, setPayer] = React.useState(customerName);
  const [paymentMode, setPaymentMode] = React.useState("");
  const [reference, setReference] = React.useState("");
  const [paymentDate, setPaymentDate] = React.useState(() => {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  });
  const [isRecording, setIsRecording] = React.useState(false);
  const [allocatingPaymentId, setAllocatingPaymentId] = React.useState("");
  const [allocationTargets, setAllocationTargets] = React.useState<Record<string, string>>({});
  const [allocationAmounts, setAllocationAmounts] = React.useState<Record<string, string>>({});
  const [rejectingPayment, setRejectingPayment] = React.useState<PaymentRecord | null>(null);
  const [rejectionReason, setRejectionReason] = React.useState("");
  const [isRejecting, setIsRejecting] = React.useState(false);
  const [busyAction, setBusyAction] = React.useState("");

  React.useEffect(() => {
    setPayer(customerName);
  }, [customerName]);

  const loadSummary = React.useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const response = await opportunityApi.financialSummary(opportunityId);
      if (!response.data?.success || !response.data.data) {
        throw new Error(response.data?.error || "Could not load the opportunity financial summary.");
      }
      setSummary(response.data.data);
    } catch (error) {
      setLoadError(errorMessage(error, "Could not load the opportunity financial summary."));
    } finally {
      setIsLoading(false);
    }
  }, [opportunityId]);

  React.useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const recordPayment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const numericAmount = Number(amount);
    if (!bookingId || !payer.trim() || !Number.isFinite(numericAmount) || numericAmount <= 0) {
      toast({ title: "Payment details required", description: "Select a booking, enter the payer, and provide a valid amount.", variant: "destructive" });
      return;
    }
    setIsRecording(true);
    try {
      const response = await paymentApi.create({
        bookingId,
        amount: numericAmount,
        paymentDate: paymentDate ? new Date(`${paymentDate}T00:00:00`).toISOString() : undefined,
        reference: reference.trim() || undefined,
        notes: [`Payer: ${payer.trim()}`, paymentMode ? `Payment mode: ${paymentMode}` : ""].filter(Boolean).join("\n"),
      });
      if (!response.data?.success || !response.data.data?.id) {
        throw new Error(response.data?.error || "Payment was not recorded.");
      }
      setAmount("");
      setReference("");
      toast({ title: "Payment recorded", description: "It is pending Finance verification; no receipt has been issued." });
      await loadSummary();
    } catch (error) {
      toast({ title: "Payment recording failed", description: errorMessage(error, "Could not record payment."), variant: "destructive" });
    } finally {
      setIsRecording(false);
    }
  };

  const verifyPayment = async (payment: PaymentRecord) => {
    setBusyAction(payment.id);
    try {
      const response = await paymentApi.verify(payment.id);
      if (!response.data?.success) throw new Error(response.data?.error || "Payment verification failed.");
      toast({ title: "Payment verified", description: "Issue its receipt when ready." });
      await loadSummary();
    } catch (error) {
      toast({ title: "Verification failed", description: errorMessage(error, "Could not verify payment."), variant: "destructive" });
    } finally {
      setBusyAction("");
    }
  };

  const rejectPayment = async () => {
    if (!rejectingPayment || !rejectionReason.trim()) return;
    setIsRejecting(true);
    try {
      const response = await paymentApi.reject(rejectingPayment.id, rejectionReason.trim());
      if (!response.data?.success) throw new Error(response.data?.error || "Payment rejection failed.");
      toast({ title: "Payment rejected", description: "The rejection reason was recorded." });
      setRejectingPayment(null);
      setRejectionReason("");
      await loadSummary();
    } catch (error) {
      toast({ title: "Rejection failed", description: errorMessage(error, "Could not reject payment."), variant: "destructive" });
    } finally {
      setIsRejecting(false);
    }
  };

  const issueReceipt = async (payment: PaymentRecord) => {
    setBusyAction(payment.id);
    try {
      const response = await receiptApi.issueForPayment(payment.id);
      if (!response.data?.success || !response.data.data?.id) {
        throw new Error(response.data?.error || "Receipt issuance failed.");
      }
      toast({ title: "Receipt issued", description: response.data.data.receiptNumber || "The receipt is now in the receipt register." });
      await loadSummary();
    } catch (error) {
      toast({ title: "Receipt issuance failed", description: errorMessage(error, "Could not issue receipt."), variant: "destructive" });
    } finally {
      setBusyAction("");
    }
  };

  const allocatePayment = async (payment: PaymentRecord) => {
    const targetInstallmentId = allocationTargets[payment.id];
    const allocationAmount = Number(allocationAmounts[payment.id]);
    if (!targetInstallmentId || !Number.isFinite(allocationAmount) || allocationAmount <= 0) {
      toast({ title: "Allocation details required", description: "Choose an outstanding installment and enter an amount.", variant: "destructive" });
      return;
    }
    setAllocatingPaymentId(payment.id);
    try {
      const response = await paymentApi.allocate(payment.id, targetInstallmentId, allocationAmount);
      if (!response.data?.success) throw new Error(response.data?.error || "Allocation failed.");
      toast({ title: "Payment allocated", description: "The installment balance has been updated." });
      setAllocationAmounts((current) => ({ ...current, [payment.id]: "" }));
      await loadSummary();
    } catch (error) {
      toast({ title: "Allocation failed", description: errorMessage(error, "Could not allocate payment."), variant: "destructive" });
    } finally {
      setAllocatingPaymentId("");
    }
  };

  if (isLoading) {
    return <div className="space-y-4"><Skeleton className="h-28 w-full" /><Skeleton className="h-56 w-full" /><Skeleton className="h-48 w-full" /></div>;
  }

  if (loadError || !summary) {
    return (
      <Card role="alert" className="border-destructive">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-5">
          <p className="text-sm text-destructive">{loadError || "Financial summary is unavailable."}</p>
          <Button variant="outline" onClick={() => void loadSummary()}>Retry</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="Opportunity financial summary">
        {[
          ["Approved quotation", summary.approvedQuotation ? currency(summary.approvedQuotation.totalAmount) : "—"],
          ["Verified payments", currency(summary.verifiedPaymentAmount)],
          ["Outstanding booking balance", currency(summary.outstandingAmount)],
          ["Installment outstanding", currency(summary.installmentOutstandingAmount)],
          ["Overdue / upcoming", `${currency(summary.overdueAmount)} / ${currency(summary.upcomingAmount)}`],
        ].map(([label, value]) => (
          <Card key={label}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-semibold">{value}</p></CardContent></Card>
        ))}
      </section>

      <Card>
        <CardHeader><CardTitle className="text-base">Record a payment</CardTitle></CardHeader>
        <CardContent>
          {!hasEffectivePermission("PAYMENT_CREATE") ? (
            <p className="text-sm text-muted-foreground">You do not have permission to record payments.</p>
          ) : activeBookings.length === 0 ? (
            <p className="text-sm text-muted-foreground">Confirm a booking before recording a payment.</p>
          ) : (
            <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" onSubmit={(event) => void recordPayment(event)}>
              <div className="space-y-2">
                <Label htmlFor="payment-booking">Booking *</Label>
                <select id="payment-booking" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={bookingId} onChange={(event) => setBookingId(event.target.value)}>
                  {activeBookings.map((booking) => <option key={booking.id} value={booking.id}>{booking.number} · {currency(booking.totalAmount)}</option>)}
                </select>
              </div>
              <div className="space-y-2"><Label htmlFor="payment-payer">Payer *</Label><Input id="payment-payer" value={payer} onChange={(event) => setPayer(event.target.value)} maxLength={200} required /></div>
              <div className="space-y-2"><Label htmlFor="payment-amount">Amount (INR) *</Label><Input id="payment-amount" type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required /></div>
              <div className="space-y-2"><Label htmlFor="payment-date">Payment date</Label><Input id="payment-date" type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} /></div>
              <div className="space-y-2">
                <Label htmlFor="payment-mode">Payment mode</Label>
                <select id="payment-mode" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={paymentMode} onChange={(event) => setPaymentMode(event.target.value)}>
                  <option value="">Select mode</option>
                  {["Cash", "Cheque", "Bank Transfer", "UPI", "Online"].map((mode) => <option key={mode} value={mode}>{mode}</option>)}
                </select>
              </div>
              <div className="space-y-2"><Label htmlFor="payment-reference">Transaction reference</Label><Input id="payment-reference" value={reference} onChange={(event) => setReference(event.target.value)} maxLength={200} /></div>
              <div className="sm:col-span-2 lg:col-span-3"><Button type="submit" disabled={isRecording}>{isRecording ? "Recording..." : "Record pending payment"}</Button></div>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Quotation installments</CardTitle></CardHeader>
        <CardContent>
          {summary.installments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No installment schedule exists yet. Installments are created from the approved quotation when its booking is confirmed.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead><tr className="border-b text-xs text-muted-foreground"><th className="p-2">Installment</th><th className="p-2">Due date</th><th className="p-2 text-right">Amount due</th><th className="p-2 text-right">Received</th><th className="p-2 text-right">Outstanding</th><th className="p-2">Status</th></tr></thead>
                <tbody>{summary.installments.map((installment) => (
                  <tr key={installment.id} className="border-b last:border-0">
                    <td className="p-2"><Link className="hover:underline" href={`/bookings/${installment.bookingId}`}>{installment.name}</Link><span className="block text-xs text-muted-foreground">#{installment.sequenceNumber}</span></td>
                    <td className="p-2">{formatDate(installment.dueDate)}</td>
                    <td className="p-2 text-right">{currency(installment.scheduledAmount)}</td>
                    <td className="p-2 text-right">{currency(installment.receivedAmount)}</td>
                    <td className="p-2 text-right">{currency(installment.outstandingAmount)}</td>
                    <td className="p-2"><Badge variant={installment.status === "PAID" ? "success" : installment.status === "OVERDUE" ? "destructive" : "secondary"}>{installment.status}</Badge></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Payments and receipts</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {summary.payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payments recorded for this opportunity.</p>
          ) : summary.payments.map((payment) => {
            const eligibleInstallments = summary.installments.filter((installment) =>
              installment.bookingId === payment.bookingId && installment.outstandingAmount > 0,
            );
            const canAllocate = hasEffectivePermission("PAYMENT_ALLOCATE")
              && ["VERIFIED", "COMPLETED"].includes(payment.status)
              && payment.unallocatedAmount > 0
              && eligibleInstallments.length > 0;
            return (
              <div key={payment.id} className="space-y-3 rounded-md border p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1 text-sm">
                    <p className="font-semibold">{currency(payment.amount)} · <Badge variant={payment.status === "VERIFIED" || payment.status === "COMPLETED" ? "success" : payment.status === "REJECTED" ? "destructive" : "secondary"}>{payment.status}</Badge></p>
                    <p className="text-muted-foreground">{payment.bookingNumber} · {formatDateTime(payment.paymentDate)}{payment.reference ? ` · Ref ${payment.reference}` : ""}</p>
                    <p className="text-xs text-muted-foreground">Allocated {currency(payment.allocatedAmount)} · Unallocated {currency(payment.unallocatedAmount)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {payment.status === "PENDING" && hasEffectivePermission("PAYMENT_VERIFY") && (
                      <>
                        <Button size="sm" disabled={busyAction === payment.id} onClick={() => void verifyPayment(payment)}>Verify</Button>
                        <Button size="sm" variant="outline" disabled={busyAction === payment.id} onClick={() => { setRejectingPayment(payment); setRejectionReason(""); }}>Reject</Button>
                      </>
                    )}
                    {["VERIFIED", "COMPLETED"].includes(payment.status) && (
                      payment.receipt ? (
                        <Button size="sm" variant="outline" asChild><Link href={`/receipts/${payment.receipt.id}`}>Receipt {payment.receipt.receiptNumber}</Link></Button>
                      ) : hasEffectivePermission("RECEIPT_CREATE") ? (
                        <Button size="sm" disabled={busyAction === payment.id} onClick={() => void issueReceipt(payment)}>Issue receipt</Button>
                      ) : <span className="self-center text-xs text-muted-foreground">Receipt not issued</span>
                    )}
                  </div>
                </div>
                {canAllocate && (
                  <div className="grid gap-2 border-t pt-3 sm:grid-cols-[minmax(0,1fr)_160px_auto]">
                    <div className="space-y-1"><Label htmlFor={`allocation-target-${payment.id}`}>Allocate to installment</Label>
                      <select id={`allocation-target-${payment.id}`} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={allocationTargets[payment.id] || ""} onChange={(event) => setAllocationTargets((current) => ({ ...current, [payment.id]: event.target.value }))}>
                        <option value="">Select installment</option>
                        {eligibleInstallments.map((installment) => <option key={installment.id} value={installment.id}>{installment.name} · outstanding {currency(installment.outstandingAmount)}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1"><Label htmlFor={`allocation-amount-${payment.id}`}>Amount</Label><Input id={`allocation-amount-${payment.id}`} type="number" min="0.01" step="0.01" max={payment.unallocatedAmount} value={allocationAmounts[payment.id] || ""} onChange={(event) => setAllocationAmounts((current) => ({ ...current, [payment.id]: event.target.value }))} /></div>
                    <Button className="self-end" disabled={allocatingPaymentId === payment.id} onClick={() => void allocatePayment(payment)}>{allocatingPaymentId === payment.id ? "Allocating..." : "Allocate"}</Button>
                  </div>
                )}
              </div>
            );
          })}
          <div className="flex justify-end"><Button variant="outline" asChild><Link href="/receipts">Open receipt register</Link></Button></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Related records</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {summary.approvedQuotation && <Button size="sm" variant="outline" asChild><Link href={`/quotations/${summary.approvedQuotation.id}`}>Quotation {summary.approvedQuotation.number}</Link></Button>}
          {activeBookings.map((booking) => <Button key={booking.id} size="sm" variant="outline" asChild><Link href={`/bookings/${booking.id}`}>Booking {booking.number}</Link></Button>)}
        </CardContent>
      </Card>

      <Dialog open={Boolean(rejectingPayment)} onOpenChange={(open) => { if (!open && !isRejecting) setRejectingPayment(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject payment?</DialogTitle>
            <DialogDescription>The payment will remain in the ledger with its rejection reason and audit details.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2"><Label htmlFor="payment-rejection-reason">Reason *</Label><Input id="payment-rejection-reason" value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} maxLength={500} /></div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectingPayment(null)} disabled={isRejecting}>Keep pending</Button>
            <Button variant="destructive" onClick={() => void rejectPayment()} disabled={isRejecting || !rejectionReason.trim()}>{isRejecting ? "Rejecting..." : "Reject payment"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

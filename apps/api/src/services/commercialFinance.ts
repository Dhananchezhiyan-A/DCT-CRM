import { Prisma } from '@prisma/client';

export const QUOTE_PDF_DATA_PREFIX = 'QUOTE_PDF_DATA:';
export const installmentStatuses = ['UPCOMING', 'DUE', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED'] as const;
export type InstallmentStatus = (typeof installmentStatuses)[number];

export type PaymentPlan = '10-90' | '10-40-50';
export const verifiedPaymentStatuses = ['VERIFIED', 'COMPLETED'] as const;

export function isVerifiedPaymentStatus(status: string): boolean {
  return verifiedPaymentStatuses.includes(status as (typeof verifiedPaymentStatuses)[number]);
}

export interface InstallmentDraft {
  sequenceNumber: number;
  name: string;
  description: string;
  percentage: Prisma.Decimal;
  scheduledAmount: Prisma.Decimal;
  dueDate: Date;
}

export function money(value: Prisma.Decimal.Value): Prisma.Decimal {
  return new Prisma.Decimal(value).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

export function numberAmount(value: Prisma.Decimal.Value): number {
  return money(value).toNumber();
}

export function quotationPaymentPlan(
  paymentPlan: string | null | undefined,
  notes: string | null | undefined,
): PaymentPlan | null {
  if (paymentPlan === '10-90' || paymentPlan === '10-40-50') return paymentPlan;
  if (!notes?.startsWith(QUOTE_PDF_DATA_PREFIX)) return null;

  try {
    const metadata: unknown = JSON.parse(notes.slice(QUOTE_PDF_DATA_PREFIX.length));
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
    const plan = (metadata as Record<string, unknown>).paymentPlan;
    return plan === '10-90' || plan === '10-40-50' ? plan : null;
  } catch {
    return null;
  }
}

export function buildInstallmentDrafts(
  paymentPlan: PaymentPlan,
  amount: Prisma.Decimal.Value,
  startDate: Date,
): InstallmentDraft[] {
  const total = money(amount);
  if (!total.isFinite() || total.lte(0)) throw new Error('Installment schedule amount must be greater than zero');

  const plan = paymentPlan === '10-40-50'
    ? [
        { name: 'Booking Payment', description: 'At booking', percentage: 10, dueDays: 0 },
        { name: 'Installment 1', description: 'Within 10 days of booking', percentage: 40, dueDays: 10 },
        { name: 'Installment 2', description: 'Within 30 days of booking', percentage: 50, dueDays: 30 },
      ]
    : [
        { name: 'Installment 1', description: 'Within 10 days of booking', percentage: 10, dueDays: 10 },
        { name: 'Installment 2', description: 'Within 30 days of booking', percentage: 90, dueDays: 30 },
      ];

  let assigned = new Prisma.Decimal(0);
  return plan.map((row, index) => {
    const scheduledAmount = index === plan.length - 1
      ? money(total.minus(assigned))
      : money(total.mul(row.percentage).div(100));
    assigned = assigned.plus(scheduledAmount);
    const dueDate = new Date(startDate);
    dueDate.setUTCDate(dueDate.getUTCDate() + row.dueDays);

    return {
      sequenceNumber: index + 1,
      name: row.name,
      description: row.description,
      percentage: new Prisma.Decimal(row.percentage),
      scheduledAmount,
      dueDate,
    };
  });
}

export function calculateQuotationTotals(
  items: Array<{ quantity: number; unitPrice: number }>,
  taxAmount: number | undefined,
  discount: number | undefined,
) {
  const normalizedItems = items.map((item) => {
    const unitPrice = money(item.unitPrice);
    const totalPrice = money(unitPrice.mul(item.quantity));
    return { unitPrice, totalPrice };
  });
  const subtotal = normalizedItems.reduce(
    (sum, item) => sum.plus(item.totalPrice),
    new Prisma.Decimal(0),
  );
  const tax = money(taxAmount ?? 0);
  const discountAmount = money(discount ?? 0);
  const total = money(subtotal.plus(tax).minus(discountAmount));
  if (tax.lt(0) || discountAmount.lt(0) || total.lt(0)) {
    throw new Error('Quotation tax and discount must not make the total negative');
  }

  return {
    items: normalizedItems,
    subtotal,
    tax,
    discount: discountAmount,
    total,
  };
}

export function installmentStatus(
  scheduledAmount: Prisma.Decimal.Value,
  allocatedAmount: Prisma.Decimal.Value,
  dueDate: Date,
  bookingCancelled = false,
  now = new Date(),
): { status: InstallmentStatus; outstandingAmount: Prisma.Decimal } {
  const outstandingAmount = money(new Prisma.Decimal(scheduledAmount).minus(allocatedAmount));
  if (bookingCancelled) return { status: 'CANCELLED', outstandingAmount };
  if (outstandingAmount.lte(0)) return { status: 'PAID', outstandingAmount: new Prisma.Decimal(0) };
  if (money(allocatedAmount).gt(0)) return { status: 'PARTIALLY_PAID', outstandingAmount };

  const dueDay = Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth(), dueDate.getUTCDate());
  const currentDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return {
    status: dueDay < currentDay ? 'OVERDUE' : dueDay <= currentDay ? 'DUE' : 'UPCOMING',
    outstandingAmount,
  };
}

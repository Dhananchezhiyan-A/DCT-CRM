import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  buildInstallmentDrafts,
  calculateQuotationTotals,
  installmentStatus,
  isVerifiedPaymentStatus,
  quotationPaymentPlan,
} from './commercialFinance';

describe('commercial financial calculations', () => {
  it('reconciles percentage plans to the exact payable amount after rounding', () => {
    const plan = buildInstallmentDrafts('10-40-50', '100000.01', new Date('2026-10-11T00:00:00.000Z'));
    expect(plan.map((row) => row.scheduledAmount.toFixed(2))).toEqual(['10000.00', '40000.00', '50000.01']);
    expect(plan.reduce((sum, row) => sum.plus(row.scheduledAmount), new Prisma.Decimal(0)).toFixed(2)).toBe('100000.01');
  });

  it('calculates quotation totals in cents and rejects negative totals', () => {
    const totals = calculateQuotationTotals(
      [{ quantity: 3, unitPrice: 0.335 }, { quantity: 1, unitPrice: 10.1 }],
      0.5,
      0.25,
    );
    expect(totals.items.map((item) => item.totalPrice.toFixed(2))).toEqual(['1.02', '10.10']);
    expect(totals.total.toFixed(2)).toBe('11.37');
    expect(() => calculateQuotationTotals([{ quantity: 1, unitPrice: 10 }], 0, 11)).toThrow();
  });

  it('reads stored plan values and legacy quotation PDF metadata', () => {
    expect(quotationPaymentPlan('10-90', null)).toBe('10-90');
    expect(quotationPaymentPlan(null, 'QUOTE_PDF_DATA:{"paymentPlan":"10-40-50"}')).toBe('10-40-50');
    expect(quotationPaymentPlan(null, 'QUOTE_PDF_DATA:bad')).toBeNull();
  });

  it('derives partial, paid, and overdue statuses from current balances', () => {
    const dueDate = new Date('2026-10-10T00:00:00.000Z');
    expect(installmentStatus('100', '25', dueDate).status).toBe('PARTIALLY_PAID');
    expect(installmentStatus('100', '100', dueDate).status).toBe('PAID');
    expect(installmentStatus('100', '0', dueDate, false, new Date('2026-10-11T00:00:00.000Z')).status).toBe('OVERDUE');
  });

  it('counts only verified and legacy-completed payments as received', () => {
    expect(isVerifiedPaymentStatus('VERIFIED')).toBe(true);
    expect(isVerifiedPaymentStatus('COMPLETED')).toBe(true);
    expect(isVerifiedPaymentStatus('PENDING')).toBe(false);
    expect(isVerifiedPaymentStatus('REJECTED')).toBe(false);
  });
});

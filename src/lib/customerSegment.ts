import type { Transaction, SegmentBreakdown, AcquisitionBreakdown } from '../types';

export function countCustomersByTransaction(tx: Transaction): SegmentBreakdown {
  const initial: SegmentBreakdown = { new: 0, repeat: 0, regular: 0 };
  const result = tx.line_items.reduce<SegmentBreakdown>((acc, item) => {
    const name = item.name;
    const quantity = Math.round(parseFloat(item.quantity) || 0);
    if (name.includes('新規')) {
      acc.new += quantity;
    }
    if (name.includes('リピート')) {
      acc.repeat += quantity;
    }
    if (name.includes('常連')) {
      acc.regular += quantity;
    }
    return acc;
  }, initial);

  const total = result.new + result.repeat + result.regular;
  if (total === 0) {
    return { new: 0, repeat: 0, regular: 1 };
  }
  return result;
}

export function allocateSalesByTransaction(tx: Transaction): SegmentBreakdown {
  const counts = countCustomersByTransaction(tx);
  const total = counts.new + counts.repeat + counts.regular;

  if (total === 0) {
    return { new: 0, repeat: 0, regular: tx.amount };
  }

  if (counts.new === 0 && counts.repeat === 0 && counts.regular === 1) {
    return { new: 0, repeat: 0, regular: tx.amount };
  }

  const newSales = Math.floor((tx.amount * counts.new) / total);
  const repeatSales = Math.floor((tx.amount * counts.repeat) / total);
  const regularSales = tx.amount - newSales - repeatSales;

  return { new: newSales, repeat: repeatSales, regular: regularSales };
}

export function detectAcquisitionChannels(tx: Transaction): AcquisitionBreakdown {
  const hasNew = tx.line_items.some(item => item.name.includes('新規'));

  if (!hasNew) {
    return { google: 0, review: 0, signboard: 0, sns: 0, unknown: 0 };
  }

  const result: AcquisitionBreakdown = { google: 0, review: 0, signboard: 0, sns: 0, unknown: 0 };

  for (const item of tx.line_items) {
    const name = item.name;
    if (name.includes('Google')) result.google += 1;
    if (name.includes('クチコミ')) result.review += 1;
    if (name.includes('看板')) result.signboard += 1;
    if (name.includes('SNS')) result.sns += 1;
  }

  const channelTotal = result.google + result.review + result.signboard + result.sns;
  if (channelTotal === 0) {
    result.unknown = 1;
  }

  return result;
}

export function aggregateSegments(transactions: Transaction[]): {
  customers: SegmentBreakdown;
  sales: SegmentBreakdown;
  acquisition: AcquisitionBreakdown;
} {
  const customers: SegmentBreakdown = { new: 0, repeat: 0, regular: 0 };
  const sales: SegmentBreakdown = { new: 0, repeat: 0, regular: 0 };
  const acquisition: AcquisitionBreakdown = { google: 0, review: 0, signboard: 0, sns: 0, unknown: 0 };

  for (const tx of transactions) {
    const txCustomers = countCustomersByTransaction(tx);
    customers.new += txCustomers.new;
    customers.repeat += txCustomers.repeat;
    customers.regular += txCustomers.regular;

    const txSales = allocateSalesByTransaction(tx);
    sales.new += txSales.new;
    sales.repeat += txSales.repeat;
    sales.regular += txSales.regular;

    const txAcquisition = detectAcquisitionChannels(tx);
    acquisition.google += txAcquisition.google;
    acquisition.review += txAcquisition.review;
    acquisition.signboard += txAcquisition.signboard;
    acquisition.sns += txAcquisition.sns;
    acquisition.unknown += txAcquisition.unknown;
  }

  return { customers, sales, acquisition };
}

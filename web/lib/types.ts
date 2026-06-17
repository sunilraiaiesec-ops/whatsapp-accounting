import { formatFcfa, formatNumber } from "./format";

export { formatFcfa, formatNumber };

export type CashSummary = {
  total_receipts: number;
  total_expenses: number;
  total_payments: number;
  total_returns: number;
  pending_transactions: number;
  net_balance: number;
};

export type ReviewCounts = {
  pending_transactions: number;
  pending_deliveries: number;
  total: number;
};

export type SummaryResponse = {
  cash: CashSummary;
  review: ReviewCounts;
};

export type Party = {
  id: number;
  name: string;
  party_type: string;
  total_received: number;
  total_paid: number;
  total_goods_value: number;
  amount_owed: number;
  net_cash: number;
  transaction_count: number;
  delivery_count: number;
};

export type Transaction = {
  id: number;
  transaction_type: string;
  party: string | null;
  amount: number | null;
  currency: string | null;
  category: string | null;
  status: string;
  original_message: string | null;
  employee_name: string | null;
  created_at: string;
};

export type Delivery = {
  id: number;
  document_number: string | null;
  client_name: string | null;
  delivery_date: string | null;
  description: string | null;
  quantity: number | null;
  quantity_unit: string | null;
  status: string;
  line_total_fcfa: number | null;
  product_name: string | null;
  employee_name: string | null;
  created_at: string;
};

export type MonthlyReport = {
  year: number;
  month: number;
  period_label: string;
  cash: {
    total_receipts: number;
    total_expenses: number;
    total_payments: number;
    net_cash: number;
    pending_transactions: number;
  };
  deliveries: {
    delivery_count: number;
    total_quantity: number;
    total_goods_value: number;
    pending_count: number;
  };
  review_queue: ReviewCounts;
  top_parties_owed: Array<{
    id: number;
    name: string;
    amount_owed: number;
  }>;
};

export type Product = {
  id: number;
  name: string;
  default_unit: string | null;
  default_unit_price_fcfa: number | null;
  delivery_count?: number;
  total_quantity_delivered?: number;
};

export type InvoiceLine = {
  id: number;
  description: string;
  quantity: number;
  unit: string | null;
  unit_price_fcfa: number;
  line_total_fcfa: number;
  product_id: number | null;
};

export type InvoiceSummary = {
  id: number;
  invoice_number: string;
  party_id: number | null;
  party_name: string;
  invoice_date: string;
  due_date: string | null;
  currency: string;
  status: string;
  notes: string | null;
  linked_receipt_id: string | null;
  total_fcfa: number;
  created_at: string;
};

export type InvoiceDetail = InvoiceSummary & {
  lines: InvoiceLine[];
};

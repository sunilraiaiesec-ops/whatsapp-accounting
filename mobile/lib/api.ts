import { API_URL } from "@/lib/config";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit & { token?: string | null } = {},
): Promise<T> {
  const { token, headers, ...rest } = options;
  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(headers ?? {}),
    },
  });

  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new ApiError(
      (data as { error?: string }).error ?? `Request failed (${res.status})`,
      res.status,
    );
  }
  return data;
}

export type AuthResponse = {
  token: string;
  user: { id: string; name: string; email: string };
  org: { id: string; name: string; baseCurrency: string };
};

export type DashboardResponse = {
  currency: string;
  stats: {
    totalAssets: string;
    totalLiabilities: string;
    totalEquity: string;
    netProfitThisMonth: string;
    balanced: boolean;
  };
  counts: {
    customers: number;
    suppliers: number;
    receipts: number;
    payments: number;
    salesInvoices: number;
    purchaseInvoices: number;
  };
};

export type Customer = {
  id: string;
  name: string;
  phone: string | null;
  type: string;
};

export type ReceiptRow = {
  id: string;
  number: string;
  date: string;
  total: string;
  reference: string | null;
  description: string | null;
  bankAccount: string;
  party: string | null;
};

export type PaymentRow = {
  id: string;
  number: string;
  date: string;
  total: string;
  reference: string | null;
  description: string | null;
  bankAccount: string;
  party: string | null;
};

export type AccountOption = {
  id: string;
  code: string;
  name: string;
  subtype: string | null;
};

export type Supplier = {
  id: string;
  name: string;
  phone: string | null;
  type: string;
};

export function login(email: string, password: string) {
  return apiRequest<AuthResponse>("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function signup(input: {
  name: string;
  orgName: string;
  email: string;
  password: string;
  baseCurrency?: string;
}) {
  return apiRequest<AuthResponse>("/api/v1/auth/signup", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function fetchDashboard(token: string) {
  return apiRequest<DashboardResponse>("/api/v1/dashboard", { token });
}

export function fetchCustomers(token: string) {
  return apiRequest<{ customers: Customer[] }>("/api/v1/customers", { token });
}

export function createCustomer(
  token: string,
  input: { name: string; phone?: string },
) {
  return apiRequest<{ customer: Customer }>("/api/v1/customers", {
    method: "POST",
    token,
    body: JSON.stringify(input),
  });
}

export function fetchReceipts(token: string) {
  return apiRequest<{ receipts: ReceiptRow[] }>("/api/v1/receipts", { token });
}

export function fetchPayments(token: string) {
  return apiRequest<{ payments: PaymentRow[] }>("/api/v1/payments", { token });
}

export function fetchAccounts(token: string) {
  return apiRequest<{ bankAndCash: AccountOption[]; accounts: AccountOption[] }>(
    "/api/v1/accounts",
    { token },
  );
}

export function fetchSuppliers(token: string) {
  return apiRequest<{ suppliers: Supplier[] }>("/api/v1/suppliers", { token });
}

export function createReceipt(
  token: string,
  input: {
    date?: string;
    bankAccountId: string;
    partyId?: string | null;
    description?: string | null;
    lines: { accountId: string; amount: string; memo?: string | null }[];
  },
) {
  return apiRequest<{ receipt: { id: string; number: string; total: string } }>(
    "/api/v1/receipts",
    {
      method: "POST",
      token,
      body: JSON.stringify(input),
    },
  );
}

export function createPayment(
  token: string,
  input: {
    date?: string;
    bankAccountId: string;
    partyId?: string | null;
    description?: string | null;
    lines: { accountId: string; amount: string; memo?: string | null }[];
  },
) {
  return apiRequest<{ payment: { id: string; number: string; total: string } }>(
    "/api/v1/payments",
    {
      method: "POST",
      token,
      body: JSON.stringify(input),
    },
  );
}

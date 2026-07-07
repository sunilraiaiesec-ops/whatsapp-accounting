import type { CreateCustomerAction, ExtractedAction } from "@/lib/ai/actions";
import { LOW_CONFIDENCE_THRESHOLD } from "@/lib/ai/actions";
import { humanizeDescription, parseBantooCommandText } from "@/lib/command-parse";

// Rule-based fallback used when no AI provider is configured (missing API key)
// and the input is plain text. Reuses the existing regex parser so the classic
// text flow keeps working without any AI, mapping its result into the same
// ExtractedAction shape the AI path produces. Photos/voice still require AI.
export function ruleBasedExtract(text: string): ExtractedAction {
  const parsed = parseBantooCommandText(text);
  const currency = "XAF";
  const amount = parsed.amountText ? Number(parsed.amountText) : null;
  const confidence = 0.75;

  if (parsed.intent === "create_goods_receipt") {
    return {
      action: "receive_stock",
      product_name: parsed.itemDescription ? humanizeDescription(parsed.itemDescription) : null,
      barcode: null,
      sku: null,
      unit: parsed.quantityUnit,
      quantity: parsed.quantityText ? Number(parsed.quantityText) : null,
      cost_price: null,
      supplier_name: parsed.partyName,
      date: null,
      currency,
      confidence,
      summary: null,
    };
  }

  if (parsed.intent === "create_payment") {
    if (parsed.paymentCategory === "supplier" && parsed.partyName) {
      return {
        action: "expense",
        amount,
        description: parsed.expenseDescription,
        category: null,
        supplier_name: parsed.partyName,
        payment_method: null,
        date: null,
        currency,
        confidence,
        summary: null,
      };
    }
    return {
      action: "expense",
      amount,
      description: parsed.expenseDescription,
      category: null,
      supplier_name: parsed.partyName,
      payment_method: null,
      date: null,
      currency,
      confidence,
      summary: null,
    };
  }

  if (parsed.intent === "create_receipt") {
    if (parsed.receiptCategory === "sales") {
      return {
        action: "sales_receipt",
        amount,
        customer_name: null,
        description: parsed.expenseDescription,
        payment_method: null,
        date: null,
        currency,
        confidence,
        summary: null,
      };
    }
    return {
      action: "customer_payment",
      customer_name: parsed.partyName,
      amount,
      payment_method: null,
      description: null,
      date: null,
      currency,
      confidence,
      summary: null,
    };
  }

  if (parsed.intent === "create_customer") {
    return {
      action: "create_customer",
      customer_name: parsed.partyName,
      city: parsed.city,
      phone: parsed.phone,
      whatsapp: parsed.whatsapp,
      country: null,
      note: null,
      post_action: parsed.postAction,
      unsupported_requests: null,
      currency,
      confidence,
      summary: null,
    };
  }

  if (parsed.intent === "customer_action" && parsed.customerAction) {
    const ca = parsed.customerAction;
    switch (ca.kind) {
      case "edit":
        return {
          action: "edit_customer",
          customer_name: ca.customerName,
          new_name: null,
          city: ca.city,
          phone: ca.phone,
          whatsapp: ca.whatsapp,
          email: ca.email,
          note: null,
          post_action: null,
          unsupported_requests: null,
          currency,
          confidence,
          summary: null,
        };
      case "view_profile":
        return {
          action: "view_customer",
          customer_name: ca.customerName,
          view: "profile",
          period_text: null,
          currency,
          confidence,
          summary: null,
        };
      case "view_ledger":
        return {
          action: "view_customer",
          customer_name: ca.customerName,
          view: "ledger",
          period_text: null,
          currency,
          confidence,
          summary: null,
        };
      case "view_statement":
        return {
          action: "view_customer",
          customer_name: ca.customerName,
          view: "statement",
          period_text: ca.periodText,
          currency,
          confidence,
          summary: null,
        };
      case "view_documents":
        return {
          action: "view_customer",
          customer_name: ca.customerName,
          view: "documents",
          period_text: null,
          currency,
          confidence,
          summary: null,
        };
      case "view_list":
        return {
          action: "view_customer",
          customer_name: null,
          view: "list",
          period_text: null,
          currency,
          confidence,
          summary: null,
        };
      case "balance":
        return {
          action: "customer_balance",
          customer_name: ca.customerName,
          currency,
          confidence,
          summary: null,
        };
      case "add_note":
        return {
          action: "add_customer_note",
          customer_name: ca.customerName,
          note: ca.note,
          currency,
          confidence,
          summary: null,
        };
      case "contact_call":
        return {
          action: "contact_customer",
          customer_name: ca.customerName,
          method: "call",
          currency,
          confidence,
          summary: null,
        };
      case "contact_whatsapp":
        return {
          action: "contact_customer",
          customer_name: ca.customerName,
          method: "whatsapp",
          currency,
          confidence,
          summary: null,
        };
      case "contact_email":
        return {
          action: "contact_customer",
          customer_name: ca.customerName,
          method: "email",
          currency,
          confidence,
          summary: null,
        };
      case "query":
        return {
          action: "customer_query",
          customer_name: ca.customerName,
          question: ca.question,
          period_text: ca.periodText,
          currency,
          confidence,
          summary: null,
        };
      case "unsupported_archive":
        return {
          action: "unsupported_customer_action",
          customer_name: ca.customerName,
          requested: "archive",
          currency,
          confidence,
          summary: null,
        };
      case "unsupported_reactivate":
        return {
          action: "unsupported_customer_action",
          customer_name: ca.customerName,
          requested: "reactivate",
          currency,
          confidence,
          summary: null,
        };
      case "unsupported_merge":
        return {
          action: "unsupported_customer_action",
          customer_name: ca.customerName,
          requested: "merge",
          currency,
          confidence,
          summary: null,
        };
      case "unsupported_upload_document":
        return {
          action: "unsupported_customer_action",
          customer_name: ca.customerName,
          requested: "upload_document",
          currency,
          confidence,
          summary: null,
        };
    }
  }

  if (parsed.intent === "supplier_action" && parsed.supplierAction) {
    const sa = parsed.supplierAction;
    switch (sa.kind) {
      case "edit":
        return {
          action: "edit_supplier",
          supplier_name: sa.supplierName,
          new_name: null,
          city: sa.city,
          phone: sa.phone,
          whatsapp: sa.whatsapp,
          email: sa.email,
          currency,
          confidence,
          summary: null,
        };
      case "view_profile":
        return {
          action: "view_supplier",
          supplier_name: sa.supplierName,
          view: "profile",
          currency,
          confidence,
          summary: null,
        };
      case "view_ledger":
        return {
          action: "view_supplier",
          supplier_name: sa.supplierName,
          view: "ledger",
          currency,
          confidence,
          summary: null,
        };
      case "view_documents":
        return {
          action: "view_supplier",
          supplier_name: sa.supplierName,
          view: "documents",
          currency,
          confidence,
          summary: null,
        };
      case "view_list":
        return {
          action: "view_supplier",
          supplier_name: null,
          view: "list",
          currency,
          confidence,
          summary: null,
        };
      case "balance":
        return {
          action: "supplier_balance",
          supplier_name: sa.supplierName,
          currency,
          confidence,
          summary: null,
        };
      case "add_note":
        return {
          action: "add_supplier_note",
          supplier_name: sa.supplierName,
          note: sa.note,
          currency,
          confidence,
          summary: null,
        };
      case "contact_call":
        return {
          action: "contact_supplier",
          supplier_name: sa.supplierName,
          method: "call",
          currency,
          confidence,
          summary: null,
        };
      case "contact_whatsapp":
        return {
          action: "contact_supplier",
          supplier_name: sa.supplierName,
          method: "whatsapp",
          currency,
          confidence,
          summary: null,
        };
      case "contact_email":
        return {
          action: "contact_supplier",
          supplier_name: sa.supplierName,
          method: "email",
          currency,
          confidence,
          summary: null,
        };
      case "query":
        return {
          action: "supplier_query",
          supplier_name: sa.supplierName,
          question: sa.question,
          period_text: sa.periodText,
          currency,
          confidence,
          summary: null,
        };
      case "unsupported_archive":
        return {
          action: "unsupported_supplier_action",
          supplier_name: sa.supplierName,
          requested: "archive",
          currency,
          confidence,
          summary: null,
        };
      case "unsupported_reactivate":
        return {
          action: "unsupported_supplier_action",
          supplier_name: sa.supplierName,
          requested: "reactivate",
          currency,
          confidence,
          summary: null,
        };
      case "unsupported_merge":
        return {
          action: "unsupported_supplier_action",
          supplier_name: sa.supplierName,
          requested: "merge",
          currency,
          confidence,
          summary: null,
        };
      case "unsupported_upload_document":
        return {
          action: "unsupported_supplier_action",
          supplier_name: sa.supplierName,
          requested: "upload_document",
          currency,
          confidence,
          summary: null,
        };
    }
  }

  return { action: "unknown", currency, confidence: 0, summary: null };
}

function mergeCreateCustomer(
  action: CreateCustomerAction,
  source: ExtractedAction,
): CreateCustomerAction {
  if (source.action !== "create_customer") {
    return action;
  }
  return {
    ...action,
    customer_name: action.customer_name?.trim() || source.customer_name,
    city: action.city?.trim() || source.city,
    phone: action.phone?.trim() || source.phone,
    whatsapp: action.whatsapp?.trim() || source.whatsapp,
    note: action.note?.trim() || source.note,
    post_action: action.post_action ?? source.post_action,
    unsupported_requests: action.unsupported_requests?.length
      ? action.unsupported_requests
      : source.unsupported_requests,
    confidence: Math.max(action.confidence, source.confidence),
  };
}

// Every other customer-action shape (edit/view/balance/note/contact/query/
// unsupported) carries a `customer_name` field with the same meaning — fill
// it in from the rule parser when the AI got the action type right but
// missed (or omitted) the name. Generic by design so adding a new customer
// action shape never requires touching this blend logic again.
function mergeCustomerName(action: ExtractedAction, rule: ExtractedAction): ExtractedAction {
  if (action.action !== rule.action) return action;
  if (!("customer_name" in action) || !("customer_name" in rule)) return action;
  if (action.customer_name?.trim()) return action;
  return { ...action, customer_name: rule.customer_name };
}

// Supplier-intelligence counterpart to mergeCustomerName, scoped to the new
// supplier action shapes only (leaves pre-existing transactional actions like
// receive_stock/supplier_purchase/expense untouched since those already have
// their own supplier_name handling elsewhere).
const SUPPLIER_INTELLIGENCE_ACTIONS = new Set<ExtractedAction["action"]>([
  "edit_supplier",
  "view_supplier",
  "supplier_balance",
  "add_supplier_note",
  "contact_supplier",
  "supplier_query",
  "unsupported_supplier_action",
]);

function mergeSupplierName(action: ExtractedAction, rule: ExtractedAction): ExtractedAction {
  if (action.action !== rule.action) return action;
  if (!SUPPLIER_INTELLIGENCE_ACTIONS.has(action.action)) return action;
  if (!("supplier_name" in action) || !("supplier_name" in rule)) return action;
  if (action.supplier_name?.trim()) return action;
  return { ...action, supplier_name: rule.supplier_name };
}

// When the AI returns unknown or low-confidence, prefer a confident rule-parser
// hit so obvious structured commands (e.g. "Add Golu as a customer") still
// promote to the right workflow. Also re-parse the AI summary when the model
// understood intent but returned action:"unknown".
export function blendExtraction(text: string, action: ExtractedAction): ExtractedAction {
  const rule = ruleBasedExtract(text);
  if (action.action === "unknown" && rule.action !== "unknown") {
    return { ...rule, summary: action.summary ?? rule.summary };
  }

  if (action.action === "unknown" && action.summary?.trim()) {
    const fromSummary = ruleBasedExtract(action.summary);
    if (fromSummary.action !== "unknown") {
      return { ...fromSummary, summary: action.summary };
    }
  }

  if (action.action === "create_customer") {
    let merged = action;
    if (rule.action === "create_customer") {
      merged = mergeCreateCustomer(merged, rule);
    }
    if (!merged.customer_name?.trim() && action.summary?.trim()) {
      const fromSummary = ruleBasedExtract(action.summary);
      if (fromSummary.action === "create_customer") {
        merged = mergeCreateCustomer(merged, fromSummary);
      }
    }
    if (
      merged.confidence < LOW_CONFIDENCE_THRESHOLD &&
      rule.action === merged.action &&
      rule.confidence >= LOW_CONFIDENCE_THRESHOLD
    ) {
      return { ...merged, confidence: rule.confidence };
    }
    return merged;
  }

  if (action.action !== "unknown" && rule.action === action.action) {
    let merged = mergeCustomerName(action, rule);
    merged = mergeSupplierName(merged, rule);
    if (
      merged.confidence < LOW_CONFIDENCE_THRESHOLD &&
      rule.confidence >= LOW_CONFIDENCE_THRESHOLD
    ) {
      merged = { ...merged, confidence: rule.confidence };
    }
    return merged;
  }
  return action;
}

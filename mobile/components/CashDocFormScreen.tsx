import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { ApiError, fetchAccounts, type AccountOption } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type PartyOption = { id: string; name: string };

type Props = {
  mode: "receipt" | "payment";
  title: string;
  submitLabel: string;
  parties: PartyOption[];
  onSubmit: (input: {
    date: string;
    bankAccountId: string;
    partyId?: string;
    description?: string;
    lines: { accountId: string; amount: string }[];
  }) => Promise<void>;
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function FieldLabel({ children }: { children: string }) {
  return <Text style={styles.label}>{children}</Text>;
}

function SelectRow({
  label,
  selected,
  options,
  onSelect,
}: {
  label: string;
  selected: string;
  options: { id: string; label: string }[];
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.id === selected);

  return (
    <View style={styles.field}>
      <FieldLabel>{label}</FieldLabel>
      <Pressable style={styles.select} onPress={() => setOpen((v) => !v)}>
        <Text style={styles.selectText} numberOfLines={2}>
          {current?.label ?? "Choose…"}
        </Text>
      </Pressable>
      {open ? (
        <ScrollView style={styles.options} nestedScrollEnabled>
          {options.map((o) => (
            <Pressable
              key={o.id || "__none__"}
              style={[styles.option, selected === o.id && styles.optionActive]}
              onPress={() => {
                onSelect(o.id);
                setOpen(false);
              }}
            >
              <Text style={styles.optionText}>{o.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

export function CashDocFormScreen({
  mode,
  title,
  submitLabel,
  parties,
  onSubmit,
}: Props) {
  const { org, token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [bankAccounts, setBankAccounts] = useState<AccountOption[]>([]);
  const [lineAccounts, setLineAccounts] = useState<AccountOption[]>([]);

  const [date, setDate] = useState(todayIso());
  const [bankAccountId, setBankAccountId] = useState("");
  const [lineAccountId, setLineAccountId] = useState("");
  const [partyId, setPartyId] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (!token) return;
    fetchAccounts(token)
      .then((res) => {
        setBankAccounts(res.bankAndCash);
        setLineAccounts(
          res.accounts.filter((a) => !res.bankAndCash.some((b) => b.id === a.id)),
        );
        if (res.bankAndCash[0]) setBankAccountId(res.bankAndCash[0].id);
        const firstLine = res.accounts.find(
          (a) => !res.bankAndCash.some((b) => b.id === a.id),
        );
        if (firstLine) setLineAccountId(firstLine.id);
      })
      .catch(() => setError("Could not load accounts"))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleSubmit() {
    if (!bankAccountId) {
      setError("Choose a bank or cash account");
      return;
    }
    if (!lineAccountId) {
      setError("Choose an account for the line");
      return;
    }
    if (!amount.trim()) {
      setError("Enter an amount");
      return;
    }

    setPending(true);
    setError(null);
    try {
      await onSubmit({
        date,
        bankAccountId,
        partyId: partyId || undefined,
        description: description.trim() || undefined,
        lines: [{ accountId: lineAccountId, amount: amount.trim() }],
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save");
    } finally {
      setPending(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0f172a" />
      </View>
    );
  }

  const bankOptions = bankAccounts.map((a) => ({
    id: a.id,
    label: `${a.code} · ${a.name}`,
  }));
  const lineOptions = lineAccounts.map((a) => ({
    id: a.id,
    label: `${a.code} · ${a.name}`,
  }));
  const partyOptions = [
    { id: "", label: "None" },
    ...parties.map((p) => ({ id: p.id, label: p.name })),
  ];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>
        {mode === "receipt"
          ? "Money received into a bank or cash account."
          : "Money paid out of a bank or cash account."}
      </Text>

      <View style={styles.field}>
        <FieldLabel>Date (YYYY-MM-DD)</FieldLabel>
        <TextInput
          style={styles.input}
          value={date}
          onChangeText={setDate}
          placeholder="2026-06-19"
          autoCapitalize="none"
        />
      </View>

      <SelectRow
        label={mode === "receipt" ? "Received into" : "Paid from"}
        selected={bankAccountId}
        options={bankOptions}
        onSelect={setBankAccountId}
      />

      <SelectRow
        label={mode === "receipt" ? "Credit account" : "Debit account"}
        selected={lineAccountId}
        options={lineOptions}
        onSelect={setLineAccountId}
      />

      <View style={styles.field}>
        <FieldLabel>{`Amount (${org?.baseCurrency ?? "XAF"})`}</FieldLabel>
        <TextInput
          style={styles.input}
          value={amount}
          onChangeText={setAmount}
          placeholder="50000"
          keyboardType="numeric"
        />
      </View>

      <SelectRow
        label={mode === "receipt" ? "Customer (optional)" : "Supplier (optional)"}
        selected={partyId}
        options={partyOptions}
        onSelect={setPartyId}
      />

      <View style={styles.field}>
        <FieldLabel>Description (optional)</FieldLabel>
        <TextInput
          style={styles.input}
          value={description}
          onChangeText={setDescription}
          placeholder="What was this for?"
        />
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        style={[styles.button, pending && styles.buttonDisabled]}
        onPress={handleSubmit}
        disabled={pending}
      >
        {pending ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>{submitLabel}</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f8fafc" },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 22, fontWeight: "700", color: "#0f172a" },
  subtitle: { marginTop: 4, marginBottom: 20, fontSize: 14, color: "#64748b" },
  field: { marginBottom: 16 },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#475569",
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: "#fff",
  },
  select: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 14,
    backgroundColor: "#fff",
  },
  selectText: { fontSize: 15, color: "#0f172a" },
  options: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    backgroundColor: "#fff",
    maxHeight: 200,
  },
  option: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  optionActive: { backgroundColor: "#f1f5f9" },
  optionText: { fontSize: 14, color: "#334155" },
  error: { color: "#dc2626", marginBottom: 12, fontSize: 14 },
  button: {
    marginTop: 8,
    backgroundColor: "#0f172a",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
});

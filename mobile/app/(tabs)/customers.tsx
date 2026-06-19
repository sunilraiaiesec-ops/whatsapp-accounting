import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";

import { ApiError, createCustomer, fetchCustomers, type Customer } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function CustomersScreen() {
  const { token } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    const res = await fetchCustomers(token);
    setCustomers(res.customers);
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load()
        .catch(() => setError("Could not load customers"))
        .finally(() => setLoading(false));
    }, [load]),
  );

  async function onRefresh() {
    setRefreshing(true);
    await load().catch(() => setError("Could not load customers"));
    setRefreshing(false);
  }

  async function onAdd() {
    if (!token || !name.trim()) {
      setError("Customer name is required");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await createCustomer(token, {
        name: name.trim(),
        phone: phone.trim() || undefined,
      });
      setName("");
      setPhone("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add customer");
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

  return (
    <View style={styles.screen}>
      <View style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder="Customer name"
          value={name}
          onChangeText={setName}
        />
        <TextInput
          style={styles.input}
          placeholder="Phone (optional)"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable
          style={[styles.button, pending && styles.buttonDisabled]}
          onPress={onAdd}
          disabled={pending}
        >
          <Text style={styles.buttonText}>{pending ? "Adding…" : "Add customer"}</Text>
        </Pressable>
      </View>

      <FlatList
        data={customers}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <Text style={styles.empty}>No customers yet. Add your first one above.</Text>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.rowName}>{item.name}</Text>
            <Text style={styles.rowPhone}>{item.phone ?? "—"}</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f8fafc" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  form: {
    margin: 16,
    padding: 16,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  input: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 10,
    fontSize: 16,
    backgroundColor: "#fff",
  },
  button: {
    backgroundColor: "#0f172a",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontWeight: "600" },
  error: { color: "#dc2626", marginBottom: 8, fontSize: 14 },
  empty: { textAlign: "center", color: "#64748b", marginTop: 24, paddingHorizontal: 16 },
  row: {
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 14,
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  rowName: { fontSize: 16, fontWeight: "600", color: "#0f172a" },
  rowPhone: { marginTop: 4, fontSize: 14, color: "#64748b" },
});

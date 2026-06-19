import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";

import { fetchReceipts, type ReceiptRow } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function ReceiptsScreen() {
  const { token, org } = useAuth();
  const [receipts, setReceipts] = useState<ReceiptRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    const res = await fetchReceipts(token);
    setReceipts(res.receipts);
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load()
        .catch(() => setError("Could not load receipts"))
        .finally(() => setLoading(false));
    }, [load]),
  );

  async function onRefresh() {
    setRefreshing(true);
    await load().catch(() => setError("Could not load receipts"));
    setRefreshing(false);
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
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <FlatList
        data={receipts}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <Text style={styles.empty}>
            No receipts yet. Tap + New to record money received.
          </Text>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.rowTop}>
              <Text style={styles.number}>{item.number}</Text>
              <Text style={styles.amount}>
                {item.total} {org?.baseCurrency}
              </Text>
            </View>
            <Text style={styles.meta}>
              {item.date} · {item.bankAccount}
              {item.party ? ` · ${item.party}` : ""}
            </Text>
            {item.description ? (
              <Text style={styles.description}>{item.description}</Text>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f8fafc" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  error: { color: "#dc2626", padding: 16 },
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
  rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  number: { fontSize: 16, fontWeight: "600", color: "#0f172a" },
  amount: { fontSize: 15, fontWeight: "600", color: "#059669" },
  meta: { marginTop: 6, fontSize: 13, color: "#64748b" },
  description: { marginTop: 4, fontSize: 14, color: "#334155" },
});

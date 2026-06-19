import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";

import { fetchDashboard } from "@/lib/api";
import { useAuth } from "@/lib/auth";

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

export default function DashboardScreen() {
  const { token, org } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchDashboard>> | null>(
    null,
  );

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setError(null);
      const res = await fetchDashboard(token);
      setData(res);
    } catch {
      setError("Could not load dashboard");
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load().finally(() => setLoading(false));
    }, [load]),
  );

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  if (loading && !data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0f172a" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text style={styles.brand}>Bantoo Books</Text>
      <Text style={styles.org}>{org?.name}</Text>
      <Text style={styles.subtitle}>Financial summary from your ledger.</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {data ? (
        <>
          <View style={styles.grid}>
            <StatCard label="Total assets" value={`${data.stats.totalAssets} ${data.currency}`} />
            <StatCard
              label="Net profit (month)"
              value={`${data.stats.netProfitThisMonth} ${data.currency}`}
            />
            <StatCard label="Customers" value={String(data.counts.customers)} />
            <StatCard label="Receipts" value={String(data.counts.receipts)} />
          </View>

          <View style={styles.balanceCard}>
            <Text style={styles.balanceTitle}>Balance check</Text>
            <Text style={styles.balanceText}>
              {data.stats.balanced ? "Books are balanced ✓" : "Out of balance ✗"}
            </Text>
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f8fafc", padding: 16 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  brand: {
    fontSize: 12,
    fontWeight: "600",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  org: { marginTop: 4, fontSize: 22, fontWeight: "700", color: "#0f172a" },
  subtitle: { marginTop: 4, marginBottom: 16, color: "#64748b", fontSize: 14 },
  error: { color: "#dc2626", marginBottom: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  statCard: {
    width: "47%",
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 14,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#94a3b8",
    textTransform: "uppercase",
  },
  statValue: { marginTop: 8, fontSize: 16, fontWeight: "700", color: "#0f172a" },
  balanceCard: {
    marginTop: 16,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 16,
  },
  balanceTitle: { fontSize: 16, fontWeight: "600", color: "#0f172a" },
  balanceText: { marginTop: 8, fontSize: 14, color: "#64748b" },
});

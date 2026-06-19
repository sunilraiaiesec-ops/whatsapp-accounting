import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";

import { useAuth } from "@/lib/auth";

export default function Index() {
  const { token, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color="#0f172a" />
      </View>
    );
  }

  if (!token) return <Redirect href="/login" />;
  return <Redirect href="/(tabs)" />;
}

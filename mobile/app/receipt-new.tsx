import { router, Stack } from "expo-router";
import { useEffect, useState } from "react";
import { Alert } from "react-native";

import { CashDocFormScreen } from "@/components/CashDocFormScreen";
import { createReceipt, fetchCustomers } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function NewReceiptScreen() {
  const { token } = useAuth();
  const [parties, setParties] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (!token) return;
    fetchCustomers(token)
      .then((res) => setParties(res.customers.map((c) => ({ id: c.id, name: c.name }))))
      .catch(() => setParties([]));
  }, [token]);

  return (
    <>
      <Stack.Screen options={{ title: "New receipt", headerBackTitle: "Back" }} />
      <CashDocFormScreen
        mode="receipt"
        title="New receipt"
        submitLabel="Save receipt"
        parties={parties}
        onSubmit={async (input) => {
          if (!token) return;
          const res = await createReceipt(token, {
            ...input,
            description: input.description ?? null,
            partyId: input.partyId ?? null,
          });
          Alert.alert("Saved", `Receipt ${res.receipt.number} recorded.`, [
            { text: "OK", onPress: () => router.back() },
          ]);
        }}
      />
    </>
  );
}

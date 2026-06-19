import { router, Stack } from "expo-router";
import { useEffect, useState } from "react";
import { Alert } from "react-native";

import { CashDocFormScreen } from "@/components/CashDocFormScreen";
import { createPayment, fetchSuppliers } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function NewPaymentScreen() {
  const { token } = useAuth();
  const [parties, setParties] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (!token) return;
    fetchSuppliers(token)
      .then((res) => setParties(res.suppliers.map((s) => ({ id: s.id, name: s.name }))))
      .catch(() => setParties([]));
  }, [token]);

  return (
    <>
      <Stack.Screen options={{ title: "New payment", headerBackTitle: "Back" }} />
      <CashDocFormScreen
        mode="payment"
        title="New payment"
        submitLabel="Save payment"
        parties={parties}
        onSubmit={async (input) => {
          if (!token) return;
          const res = await createPayment(token, {
            ...input,
            description: input.description ?? null,
            partyId: input.partyId ?? null,
          });
          Alert.alert("Saved", `Payment ${res.payment.number} recorded.`, [
            { text: "OK", onPress: () => router.back() },
          ]);
        }}
      />
    </>
  );
}

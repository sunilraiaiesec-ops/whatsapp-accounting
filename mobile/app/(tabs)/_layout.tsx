import { SymbolView } from "expo-symbols";
import { Tabs } from "expo-router";
import { Pressable } from "react-native";

import { useAuth } from "@/lib/auth";

export default function TabLayout() {
  const { org, signOut } = useAuth();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: "#0f172a",
        headerStyle: { backgroundColor: "#fff" },
        headerTitleStyle: { fontWeight: "600" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: org?.name ?? "Summary",
          tabBarLabel: "Summary",
          tabBarIcon: ({ color }) => (
            <SymbolView
              name={{ ios: "chart.bar", android: "bar_chart", web: "bar_chart" }}
              tintColor={color}
              size={24}
            />
          ),
          headerRight: () => (
            <Pressable onPress={() => signOut()} style={{ marginRight: 16 }}>
              <SymbolView
                name={{ ios: "rectangle.portrait.and.arrow.right", android: "logout", web: "logout" }}
                size={22}
                tintColor="#64748b"
              />
            </Pressable>
          ),
        }}
      />
      <Tabs.Screen
        name="customers"
        options={{
          title: "Customers",
          tabBarIcon: ({ color }) => (
            <SymbolView
              name={{ ios: "person.2", android: "group", web: "group" }}
              tintColor={color}
              size={24}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="receipts"
        options={{
          title: "Receipts",
          tabBarIcon: ({ color }) => (
            <SymbolView
              name={{ ios: "arrow.down.circle", android: "south", web: "south" }}
              tintColor={color}
              size={24}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="payments"
        options={{
          title: "Payments",
          tabBarIcon: ({ color }) => (
            <SymbolView
              name={{ ios: "arrow.up.circle", android: "north", web: "north" }}
              tintColor={color}
              size={24}
            />
          ),
        }}
      />
    </Tabs>
  );
}

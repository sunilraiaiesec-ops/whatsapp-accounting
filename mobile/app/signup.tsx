import { Link, router } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function SignupScreen() {
  const { signUp } = useAuth();
  const [name, setName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit() {
    setError(null);
    setPending(true);
    try {
      await signUp({
        name: name.trim(),
        orgName: orgName.trim(),
        email: email.trim(),
        password,
        baseCurrency: "XAF",
      });
      router.replace("/(tabs)");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create account");
    } finally {
      setPending(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.card}>
          <Text style={styles.brand}>Bantoo Books</Text>
          <Text style={styles.title}>Create your company</Text>
          <Text style={styles.subtitle}>A fresh set of books in seconds.</Text>

          <TextInput
            style={styles.input}
            placeholder="Your name"
            value={name}
            onChangeText={setName}
          />
          <TextInput
            style={styles.input}
            placeholder="Company name"
            value={orgName}
            onChangeText={setOrgName}
          />
          <TextInput
            style={styles.input}
            placeholder="Email"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            style={styles.input}
            placeholder="Password (min 8 characters)"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            style={[styles.button, pending && styles.buttonDisabled]}
            onPress={onSubmit}
            disabled={pending}
          >
            {pending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Create company</Text>
            )}
          </Pressable>

          <Text style={styles.footer}>
            Already have an account?{" "}
            <Link href="/login" style={styles.link}>
              Sign in
            </Link>
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f8fafc" },
  scroll: { flexGrow: 1, justifyContent: "center", padding: 24 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 24,
  },
  brand: {
    fontSize: 12,
    fontWeight: "600",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  title: { marginTop: 8, fontSize: 24, fontWeight: "700", color: "#0f172a" },
  subtitle: { marginTop: 4, marginBottom: 20, fontSize: 14, color: "#64748b" },
  input: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 12,
    fontSize: 16,
  },
  button: {
    marginTop: 4,
    backgroundColor: "#0f172a",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  error: { color: "#dc2626", marginBottom: 8, fontSize: 14 },
  footer: { marginTop: 20, textAlign: "center", color: "#64748b", fontSize: 14 },
  link: { color: "#0f172a", fontWeight: "600" },
});

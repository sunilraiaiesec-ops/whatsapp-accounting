import * as SecureStore from "expo-secure-store";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { login as apiLogin, signup as apiSignup, type AuthResponse } from "@/lib/api";

const TOKEN_KEY = "bantoobooks_token";
const USER_KEY = "bantoobooks_user";
const ORG_KEY = "bantoobooks_org";

type User = AuthResponse["user"];
type Org = AuthResponse["org"];

type AuthContextValue = {
  token: string | null;
  user: User | null;
  org: Org | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: {
    name: string;
    orgName: string;
    email: string;
    password: string;
    baseCurrency?: string;
  }) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function persistSession(data: AuthResponse) {
  await SecureStore.setItemAsync(TOKEN_KEY, data.token);
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(data.user));
  await SecureStore.setItemAsync(ORG_KEY, JSON.stringify(data.org));
}

async function clearSession() {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(USER_KEY);
  await SecureStore.deleteItemAsync(ORG_KEY);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [org, setOrg] = useState<Org | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const storedToken = await SecureStore.getItemAsync(TOKEN_KEY);
        const storedUser = await SecureStore.getItemAsync(USER_KEY);
        const storedOrg = await SecureStore.getItemAsync(ORG_KEY);
        if (storedToken && storedUser && storedOrg) {
          setToken(storedToken);
          setUser(JSON.parse(storedUser) as User);
          setOrg(JSON.parse(storedOrg) as Org);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const applySession = useCallback(async (data: AuthResponse) => {
    await persistSession(data);
    setToken(data.token);
    setUser(data.user);
    setOrg(data.org);
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const data = await apiLogin(email, password);
      await applySession(data);
    },
    [applySession],
  );

  const signUp = useCallback(
    async (input: {
      name: string;
      orgName: string;
      email: string;
      password: string;
      baseCurrency?: string;
    }) => {
      const data = await apiSignup(input);
      await applySession(data);
    },
    [applySession],
  );

  const signOut = useCallback(async () => {
    await clearSession();
    setToken(null);
    setUser(null);
    setOrg(null);
  }, []);

  const value = useMemo(
    () => ({ token, user, org, loading, signIn, signUp, signOut }),
    [token, user, org, loading, signIn, signUp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

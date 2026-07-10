import { Suspense } from "react";
import LoginForm from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="p-8 text-center text-sm text-slate-500">Loading…</main>}>
      <LoginForm />
    </Suspense>
  );
}

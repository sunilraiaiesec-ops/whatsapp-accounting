import { redirect } from "next/navigation";
import { getSessionUsername } from "@/lib/auth";

export default async function HomePage() {
  const user = await getSessionUsername();
  redirect(user ? "/quiz" : "/login");
}

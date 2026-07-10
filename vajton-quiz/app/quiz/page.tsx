import { redirect } from "next/navigation";
import { getSessionUsername } from "@/lib/auth";
import QuizRunner from "@/components/QuizRunner";

export default async function QuizPage() {
  const username = await getSessionUsername();
  if (!username) redirect("/login");
  return <QuizRunner username={username} />;
}

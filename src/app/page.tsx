import { redirect } from "next/navigation";
import { configured, configuration } from "@/server/auth";
import { Setup } from "@/components/setup";
export const dynamic = "force-dynamic";
export default function Page() {
  if (!configured()) return <Setup checks={configuration()} />;
  redirect("/app");
}

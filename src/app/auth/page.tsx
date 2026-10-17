import { AuthForm } from "@/components/auth-form";
import { Setup } from "@/components/setup";
import { configured, configuration } from "@/server/auth";
export const dynamic = "force-dynamic";
export default function Page() {
  return configured() ? <AuthForm /> : <Setup checks={configuration()} />;
}

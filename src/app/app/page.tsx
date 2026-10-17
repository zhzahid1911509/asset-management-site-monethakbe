import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth, configured, configuration } from "@/server/auth";
import { Setup } from "@/components/setup";
import { Application } from "@/components/application";
export const dynamic = "force-dynamic";
export default async function Page() {
  if (!configured()) return <Setup checks={configuration()} />;
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user.emailVerified) redirect("/auth");
  return (
    <Application
      user={{ name: session.user.name, email: session.user.email }}
    />
  );
}

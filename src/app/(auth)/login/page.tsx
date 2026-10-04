import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export const dynamic = "force-dynamic";

/** Reads the query on the server so the client form needs no search-params hook (avoids a streamed Suspense boundary). */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; suspended?: string }> }) {
  const { next, suspended } = await searchParams;
  return <LoginForm next={typeof next === "string" ? next : ""} suspended={suspended === "1"} />;
}

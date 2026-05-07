import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

// Call at the top of any server component or route handler that requires auth.
// Redirects to /sign-in if the user is not authenticated.
export async function requireAuth() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  return userId;
}

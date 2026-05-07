"use client";

import Link from "next/link";
import { Authenticated, Unauthenticated, AuthLoading, useQuery } from "convex/react";
import { UserButton } from "@clerk/nextjs";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PlusCircle, LayoutList, Plane, Search } from "lucide-react";

function AuthenticatedNav() {
  const user = useQuery(api.users.getCurrentUser);

  return (
    <div className="flex items-center gap-4">
      <Link
        href="/trips"
        className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <Plane className="h-4 w-4" />
        Trips
      </Link>
      <Link
        href="/host/properties"
        className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <LayoutList className="h-4 w-4" />
        My listings
      </Link>
      <Button size="sm" variant="outline" className="cursor-pointer" asChild>
        <Link href="/host/properties/new" className="flex items-center justify-center">
          <PlusCircle className="h-4 w-4 mr-1.5" />
          <span>Add listing</span>
        </Link>
      </Button>
      {user && (
        <span className="text-sm font-medium hidden sm:block">
          {user.name.split(" ")[0]}
        </span>
      )}
      <UserButton afterSignOutUrl="/" />
    </div>
  );
}

export function Navbar() {
  return (
    <header className="flex items-center justify-between py-4 border-b mb-8">
      <Link href="/" className="text-xl font-bold tracking-tight">
        StayFinder
      </Link>
      <Link
        href="/search"
        className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <Search className="h-4 w-4" />
        Explore
      </Link>

      <AuthLoading>
        <Skeleton className="h-9 w-48 rounded-lg" />
      </AuthLoading>

      <Authenticated>
        <AuthenticatedNav />
      </Authenticated>

      <Unauthenticated>
        <div className="flex items-center gap-3">
          <Link
            href="/sign-in"
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Sign in
          </Link>
          <Button asChild size="sm">
            <Link href="/sign-up">Sign up</Link>
          </Button>
        </div>
      </Unauthenticated>
    </header>
  );
}

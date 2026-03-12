"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  return (
    <Button
      disabled={isPending}
      onClick={async () => {
        setIsPending(true);
        const result = await authClient.signOut();
        setIsPending(false);

        if (result.error) {
          toast.error(result.error.message);
          return;
        }

        router.push("/");
        router.refresh();
      }}
      variant="outline"
    >
      {isPending ? "Signing out..." : "Sign out"}
    </Button>
  );
}

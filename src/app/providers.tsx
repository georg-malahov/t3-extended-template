"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { QuerySettingsProvider } from "@zenstackhq/tanstack-query/react";
import { ThemeProvider } from "next-themes";
import { useState } from "react";

import { Toaster } from "@/components/ui/sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 10_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <QueryClientProvider client={queryClient}>
        <QuerySettingsProvider value={{ endpoint: "/api/model" }}>
          {children}
          <Toaster />
          <ReactQueryDevtools initialIsOpen={false} />
        </QuerySettingsProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

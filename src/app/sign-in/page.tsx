import { SiteHeader } from "@/components/layout/site-header";
import { AuthCardShell } from "@/components/auth/auth-card-shell";
import { SignInForm } from "@/components/auth/sign-in-form";

export default function SignInPage() {
  return (
    <>
      <SiteHeader />
      <main className="flex min-h-[calc(100vh-73px)] items-center justify-center px-6 py-16">
        <AuthCardShell
          description="Use your email and password to access your workspace."
          title="Sign in"
        >
          <SignInForm />
        </AuthCardShell>
      </main>
    </>
  );
}

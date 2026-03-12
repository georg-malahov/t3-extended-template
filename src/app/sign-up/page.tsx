import { AuthCardShell } from "@/components/auth/auth-card-shell";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { SiteHeader } from "@/components/layout/site-header";

export default function SignUpPage() {
  return (
    <>
      <SiteHeader />
      <main className="flex min-h-[calc(100vh-73px)] items-center justify-center px-6 py-16">
        <AuthCardShell
          description="Create an account and provision your default workspace."
          title="Create account"
        >
          <SignUpForm />
        </AuthCardShell>
      </main>
    </>
  );
}

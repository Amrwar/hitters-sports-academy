import { Compass } from "lucide-react";
import { Lockup } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";

export default function NotFound() {
  return (
    <div className="bg-court flex min-h-dvh flex-col items-center justify-center px-6 text-white">
      <Lockup height={24} className="mb-10" />
      <EmptyState
        className="w-full max-w-md border-line/10 bg-surface-1/60 backdrop-blur-xl"
        icon={<Compass />}
        title="Out of bounds"
        description="That page doesn't exist or has moved. Let's get you back on court."
        action={<Button href="/app">Go to the app</Button>}
        secondaryAction={
          <Button variant="ghost" href="/">
            Home
          </Button>
        }
      />
    </div>
  );
}

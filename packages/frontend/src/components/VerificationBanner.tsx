import { useState } from "react";
import { MailWarning, X, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

export function VerificationBanner() {
    const { user, refresh } = useAuth();
    const [dismissed, setDismissed] = useState(false);
    const [sending, setSending] = useState(false);

    if (!user || user.emailVerified || dismissed) return null;

    async function resend() {
        setSending(true);
        try {
            await api.post("/api/auth/resend-verification");
            toast({
                variant: "success",
                title: "Verification email sent!",
                description: "Check your inbox (and spam folder).",
            });
        } catch (e: unknown) {
            toast({ variant: "destructive", title: (e as Error).message });
        } finally {
            setSending(false);
        }
    }

    return (
        <div className="flex items-center gap-3 bg-amber-50 border-b border-amber-200 px-4 py-2.5 text-sm">
            <MailWarning className="h-4 w-4 shrink-0 text-amber-600" />
            <p className="flex-1 text-amber-800">
                Please verify your email address. Check your inbox for the verification link.
            </p>
            <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 text-amber-700 hover:bg-amber-100 hover:text-amber-900 shrink-0"
                onClick={resend}
                disabled={sending}
            >
                <RefreshCw className={`h-3.5 w-3.5 ${sending ? "animate-spin" : ""}`} />
                {sending ? "Sending…" : "Resend"}
            </Button>
            <button
                type="button"
                onClick={() => setDismissed(true)}
                className="text-amber-500 hover:text-amber-700 shrink-0"
                aria-label="Dismiss"
            >
                <X className="h-4 w-4" />
            </button>
        </div>
    );
}

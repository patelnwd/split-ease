import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Camera } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { api } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { getInitials } from "@/lib/utils";

type ProfileData = {
    id: string;
    name: string;
    email: string;
    image: string | null;
    phone: string | null;
    currency: string;
    oauthProvider: string | null;
    hasPassword: boolean;
    createdAt: string;
};

const profileSchema = z.object({
    name: z.string().min(2),
    currency: z.string().length(3),
    phone: z.string().max(20).optional().or(z.literal("")),
});

const changePasswordSchema = z
    .object({
        currentPassword: z.string().min(1, "Required"),
        newPassword: z.string().min(6, "At least 6 characters"),
        confirmPassword: z.string().min(1, "Required"),
    })
    .refine((d) => d.newPassword === d.confirmPassword, {
        message: "Passwords do not match",
        path: ["confirmPassword"],
    });

const setPasswordSchema = z
    .object({
        newPassword: z.string().min(6, "At least 6 characters"),
        confirmPassword: z.string().min(1, "Required"),
    })
    .refine((d) => d.newPassword === d.confirmPassword, {
        message: "Passwords do not match",
        path: ["confirmPassword"],
    });

type ProfileValues = z.infer<typeof profileSchema>;
type ChangePasswordValues = z.infer<typeof changePasswordSchema>;
type SetPasswordValues = z.infer<typeof setPasswordSchema>;

const PROVIDER_LABEL: Record<string, string> = {
    google: "Google",
    github: "GitHub",
};

const PROVIDER_ICON: Record<string, string> = {
    google: "🔵",
    github: "⚫",
};

export function ProfilePage() {
    const { user, refresh } = useAuth();
    const qc = useQueryClient();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);

    const { data: profile, refetch: refetchProfile } = useQuery<ProfileData>({
        queryKey: ["profile"],
        queryFn: () => api.get("/api/profile"),
    });

    const profileForm = useForm<ProfileValues>({
        resolver: zodResolver(profileSchema),
        values: {
            name: profile?.name ?? "",
            currency: profile?.currency ?? "INR",
            phone: profile?.phone ?? "",
        },
    });

    const changePasswordForm = useForm<ChangePasswordValues>({
        resolver: zodResolver(changePasswordSchema),
        defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
    });

    const setPasswordForm = useForm<SetPasswordValues>({
        resolver: zodResolver(setPasswordSchema),
        defaultValues: { newPassword: "", confirmPassword: "" },
    });

    // ── Avatar upload ──────────────────────────────────────────────────────
    async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;

        // Instant preview
        setAvatarPreview(URL.createObjectURL(file));

        setUploading(true);
        try {
            const form = new FormData();
            form.append("file", file);
            const res = await fetch("/api/profile/avatar", {
                method: "POST",
                credentials: "include",
                body: form,
            });
            if (!res.ok) {
                const err = (await res.json()) as { error?: string };
                throw new Error(err.error ?? "Upload failed");
            }
            await refresh();
            await refetchProfile();
            toast({ variant: "success", title: "Photo updated!" });
        } catch (err: unknown) {
            setAvatarPreview(null);
            toast({ variant: "destructive", title: (err as Error).message });
        } finally {
            setUploading(false);
            e.target.value = "";
        }
    }

    // ── Profile submit ─────────────────────────────────────────────────────
    async function onProfileSubmit(data: ProfileValues) {
        try {
            await api.patch("/api/profile", { ...data, phone: data.phone || null });
            await refresh();
            qc.invalidateQueries({ queryKey: ["profile"] });
            toast({ variant: "success", title: "Profile updated!" });
        } catch {
            toast({ variant: "destructive", title: "Failed to update profile" });
        }
    }

    // ── Change password ────────────────────────────────────────────────────
    async function onChangePassword(data: ChangePasswordValues) {
        try {
            await api.post("/api/auth/change-password", {
                currentPassword: data.currentPassword,
                newPassword: data.newPassword,
            });
            toast({ variant: "success", title: "Password changed!" });
            changePasswordForm.reset();
        } catch (e: unknown) {
            toast({ variant: "destructive", title: (e as Error).message });
        }
    }

    // ── Set password (first time, OAuth users) ─────────────────────────────
    async function onSetPassword(data: SetPasswordValues) {
        try {
            await api.post("/api/auth/set-password", { password: data.newPassword });
            toast({
                variant: "success",
                title: "Password set! You can now sign in with email too.",
            });
            setPasswordForm.reset();
            await refetchProfile();
        } catch (e: unknown) {
            toast({ variant: "destructive", title: (e as Error).message });
        }
    }

    const displayImage = avatarPreview ?? profile?.image ?? user?.image ?? "";
    const hasPassword = profile?.hasPassword ?? true;
    const provider = profile?.oauthProvider;

    return (
        <div className="p-6 max-w-xl mx-auto space-y-6">
            <div>
                <h1 className="text-2xl font-bold">Profile</h1>
                <p className="text-muted-foreground">Manage your account settings</p>
            </div>

            {/* ── Account details ── */}
            <Card>
                <CardHeader className="flex flex-row items-center gap-4">
                    {/* Clickable avatar */}
                    <div className="relative group shrink-0">
                        <Avatar className="h-16 w-16">
                            <AvatarImage src={displayImage} />
                            <AvatarFallback className="bg-brand-100 text-brand-700 text-xl">
                                {getInitials(user?.name ?? "U")}
                            </AvatarFallback>
                        </Avatar>
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploading}
                            className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                            title="Change photo"
                        >
                            <Camera className="h-5 w-5 text-white" />
                        </button>
                        {uploading && (
                            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50">
                                <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            </div>
                        )}
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/gif"
                            className="hidden"
                            onChange={handleAvatarChange}
                        />
                    </div>

                    <div>
                        <CardTitle>{profile?.name}</CardTitle>
                        <CardDescription>{profile?.email}</CardDescription>
                        {provider && (
                            <p className="text-xs text-muted-foreground mt-1">
                                {PROVIDER_ICON[provider]} Connected via{" "}
                                {PROVIDER_LABEL[provider] ?? provider}
                            </p>
                        )}
                    </div>
                </CardHeader>
                <CardContent>
                    <form
                        onSubmit={profileForm.handleSubmit(onProfileSubmit)}
                        className="space-y-4"
                    >
                        <div className="space-y-1">
                            <Label>Full name</Label>
                            <Input {...profileForm.register("name")} />
                            {profileForm.formState.errors.name && (
                                <p className="text-xs text-destructive">
                                    {profileForm.formState.errors.name.message}
                                </p>
                            )}
                        </div>
                        <div className="space-y-1">
                            <Label>Default currency</Label>
                            <Input
                                placeholder="USD, INR, EUR…"
                                maxLength={3}
                                {...profileForm.register("currency")}
                            />
                            {profileForm.formState.errors.currency && (
                                <p className="text-xs text-destructive">
                                    {profileForm.formState.errors.currency.message}
                                </p>
                            )}
                        </div>
                        <div className="space-y-1">
                            <Label>
                                Phone number{" "}
                                <span className="text-muted-foreground text-xs">
                                    (for SMS notifications)
                                </span>
                            </Label>
                            <Input
                                type="tel"
                                placeholder="+1 555 000 0000"
                                {...profileForm.register("phone")}
                            />
                            {profileForm.formState.errors.phone && (
                                <p className="text-xs text-destructive">
                                    {profileForm.formState.errors.phone.message}
                                </p>
                            )}
                        </div>
                        <Button
                            type="submit"
                            variant="brand"
                            disabled={profileForm.formState.isSubmitting}
                        >
                            {profileForm.formState.isSubmitting ? "Saving…" : "Save changes"}
                        </Button>
                    </form>
                </CardContent>
            </Card>

            {/* ── Change / Set password ── */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">
                        {hasPassword ? "Change Password" : "Set Password"}
                    </CardTitle>
                    <CardDescription>
                        {hasPassword
                            ? "Enter your current password to set a new one."
                            : "Add a password so you can also sign in with email."}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {hasPassword ? (
                        <form
                            onSubmit={changePasswordForm.handleSubmit(onChangePassword)}
                            className="space-y-4"
                        >
                            <div className="space-y-1">
                                <Label>Current password</Label>
                                <Input
                                    type="password"
                                    autoComplete="current-password"
                                    {...changePasswordForm.register("currentPassword")}
                                />
                                {changePasswordForm.formState.errors.currentPassword && (
                                    <p className="text-xs text-destructive">
                                        {
                                            changePasswordForm.formState.errors.currentPassword
                                                .message
                                        }
                                    </p>
                                )}
                            </div>
                            <div className="space-y-1">
                                <Label>New password</Label>
                                <Input
                                    type="password"
                                    autoComplete="new-password"
                                    {...changePasswordForm.register("newPassword")}
                                />
                                {changePasswordForm.formState.errors.newPassword && (
                                    <p className="text-xs text-destructive">
                                        {changePasswordForm.formState.errors.newPassword.message}
                                    </p>
                                )}
                            </div>
                            <div className="space-y-1">
                                <Label>Confirm new password</Label>
                                <Input
                                    type="password"
                                    autoComplete="new-password"
                                    {...changePasswordForm.register("confirmPassword")}
                                />
                                {changePasswordForm.formState.errors.confirmPassword && (
                                    <p className="text-xs text-destructive">
                                        {
                                            changePasswordForm.formState.errors.confirmPassword
                                                .message
                                        }
                                    </p>
                                )}
                            </div>
                            <Button
                                type="submit"
                                variant="brand"
                                disabled={changePasswordForm.formState.isSubmitting}
                            >
                                {changePasswordForm.formState.isSubmitting
                                    ? "Updating…"
                                    : "Update password"}
                            </Button>
                        </form>
                    ) : (
                        <form
                            onSubmit={setPasswordForm.handleSubmit(onSetPassword)}
                            className="space-y-4"
                        >
                            <div className="space-y-1">
                                <Label>New password</Label>
                                <Input
                                    type="password"
                                    autoComplete="new-password"
                                    {...setPasswordForm.register("newPassword")}
                                />
                                {setPasswordForm.formState.errors.newPassword && (
                                    <p className="text-xs text-destructive">
                                        {setPasswordForm.formState.errors.newPassword.message}
                                    </p>
                                )}
                            </div>
                            <div className="space-y-1">
                                <Label>Confirm password</Label>
                                <Input
                                    type="password"
                                    autoComplete="new-password"
                                    {...setPasswordForm.register("confirmPassword")}
                                />
                                {setPasswordForm.formState.errors.confirmPassword && (
                                    <p className="text-xs text-destructive">
                                        {setPasswordForm.formState.errors.confirmPassword.message}
                                    </p>
                                )}
                            </div>
                            <Button
                                type="submit"
                                variant="brand"
                                disabled={setPasswordForm.formState.isSubmitting}
                            >
                                {setPasswordForm.formState.isSubmitting
                                    ? "Setting…"
                                    : "Set password"}
                            </Button>
                        </form>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

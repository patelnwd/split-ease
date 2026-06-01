import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Shield, Ban, CheckCircle2, UserCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { formatDate, getInitials } from "@/lib/utils";
import type { AdminUser } from "@/types";

const DURATION_OPTIONS = [
    { value: "1", label: "1 day" },
    { value: "3", label: "3 days" },
    { value: "7", label: "7 days" },
    { value: "14", label: "14 days" },
    { value: "30", label: "30 days" },
    { value: "90", label: "90 days" },
    { value: "365", label: "1 year" },
    { value: "0", label: "Permanent" },
];

function BanDialog({ user, onDone }: { user: AdminUser; onDone: () => void }) {
    const [open, setOpen] = useState(false);
    const [duration, setDuration] = useState("7");
    const [reason, setReason] = useState("");
    const [saving, setSaving] = useState(false);

    async function handleBan() {
        setSaving(true);
        try {
            const body: { days?: number; reason?: string } = {};
            if (duration !== "0") body.days = Number(duration);
            if (reason.trim()) body.reason = reason.trim();
            await api.post(`/api/admin/users/${user.id}/ban`, body);
            toast({ variant: "success", title: `${user.name} has been banned.` });
            setOpen(false);
            onDone();
        } catch (e: unknown) {
            toast({ variant: "destructive", title: (e as Error).message });
        } finally {
            setSaving(false);
        }
    }

    return (
        <>
            <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/5"
                onClick={() => {
                    setDuration("7");
                    setReason("");
                    setOpen(true);
                }}
            >
                <Ban className="h-3.5 w-3.5" /> Ban
            </Button>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Ban {user.name}</DialogTitle>
                        <DialogDescription>
                            The user will be unable to log in for the selected period.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-1">
                            <Label>Duration</Label>
                            <Select value={duration} onValueChange={setDuration}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {DURATION_OPTIONS.map((o) => (
                                        <SelectItem key={o.value} value={o.value}>
                                            {o.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1">
                            <Label>
                                Reason{" "}
                                <span className="text-muted-foreground text-xs">
                                    (shown to user)
                                </span>
                            </Label>
                            <Input
                                placeholder="Spam, abuse, policy violation…"
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                maxLength={200}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setOpen(false)}>
                            Cancel
                        </Button>
                        <Button variant="destructive" onClick={handleBan} disabled={saving}>
                            {saving ? "Banning…" : "Confirm ban"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

function BanStatus({ user }: { user: AdminUser }) {
    if (!user.isBanned)
        return (
            <Badge variant="secondary" className="text-green-700 bg-green-100">
                Active
            </Badge>
        );
    return (
        <span className="text-xs text-destructive font-medium">
            {user.isPermanentBan
                ? "Banned permanently"
                : `Banned until ${formatDate(user.bannedUntil!)}`}
            {user.banReason && (
                <span className="block text-muted-foreground">{user.banReason}</span>
            )}
        </span>
    );
}

export function AdminPage() {
    const qc = useQueryClient();

    const { data: users = [], isLoading } = useQuery<AdminUser[]>({
        queryKey: ["admin-users"],
        queryFn: () => api.get("/api/admin/users"),
    });

    const refresh = () => qc.invalidateQueries({ queryKey: ["admin-users"] });

    async function unban(userId: string, name: string) {
        try {
            await api.post(`/api/admin/users/${userId}/unban`);
            toast({ variant: "success", title: `${name}'s ban has been lifted.` });
            refresh();
        } catch (e: unknown) {
            toast({ variant: "destructive", title: (e as Error).message });
        }
    }

    async function toggleAdmin(userId: string, currentIsAdmin: boolean) {
        try {
            await api.patch(`/api/admin/users/${userId}`, { isAdmin: !currentIsAdmin });
            toast({ variant: "success", title: `Admin status updated.` });
            refresh();
        } catch (e: unknown) {
            toast({ variant: "destructive", title: (e as Error).message });
        }
    }

    return (
        <div className="p-6 max-w-4xl mx-auto space-y-6">
            <div className="flex items-center gap-3">
                <Shield className="h-6 w-6 text-brand-600" />
                <div>
                    <h1 className="text-2xl font-bold">Admin Panel</h1>
                    <p className="text-muted-foreground">Manage users, ban/unban accounts</p>
                </div>
            </div>

            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-base">
                        All Users{" "}
                        <span className="ml-2 text-sm font-normal text-muted-foreground">
                            ({users.length})
                        </span>
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    {isLoading && (
                        <div className="space-y-2 p-4">
                            {[1, 2, 3].map((i) => (
                                <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />
                            ))}
                        </div>
                    )}

                    <div className="divide-y">
                        {users.map((u) => (
                            <div key={u.id} className="flex items-center gap-3 px-4 py-3">
                                <Avatar className="h-9 w-9 shrink-0">
                                    <AvatarImage src={u.image ?? ""} />
                                    <AvatarFallback className="text-xs bg-brand-100 text-brand-700">
                                        {getInitials(u.name)}
                                    </AvatarFallback>
                                </Avatar>

                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-medium text-sm truncate">
                                            {u.name}
                                        </span>
                                        {u.isAdmin && (
                                            <Badge
                                                variant="outline"
                                                className="text-brand-700 border-brand-300 text-[10px] py-0 px-1.5"
                                            >
                                                Admin
                                            </Badge>
                                        )}
                                        {!u.emailVerified && (
                                            <Badge
                                                variant="outline"
                                                className="text-amber-600 border-amber-300 text-[10px] py-0 px-1.5"
                                            >
                                                Unverified
                                            </Badge>
                                        )}
                                    </div>
                                    <p className="text-xs text-muted-foreground truncate">
                                        {u.email}
                                    </p>
                                </div>

                                <div className="shrink-0 text-right mr-3">
                                    <BanStatus user={u} />
                                    <p className="text-[10px] text-muted-foreground mt-0.5">
                                        Joined {formatDate(u.createdAt)}
                                    </p>
                                </div>

                                <div className="flex gap-1.5 shrink-0">
                                    {u.isBanned ? (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="gap-1.5 text-green-700 border-green-300 hover:bg-green-50"
                                            onClick={() => unban(u.id, u.name)}
                                        >
                                            <CheckCircle2 className="h-3.5 w-3.5" /> Unban
                                        </Button>
                                    ) : (
                                        <BanDialog user={u} onDone={refresh} />
                                    )}
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="gap-1.5 text-muted-foreground"
                                        onClick={() => toggleAdmin(u.id, u.isAdmin)}
                                        title={u.isAdmin ? "Remove admin" : "Make admin"}
                                    >
                                        <UserCog className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

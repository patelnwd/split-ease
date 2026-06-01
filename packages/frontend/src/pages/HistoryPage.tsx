import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Clock, ShieldCheck } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api";
import { formatDate, getInitials } from "@/lib/utils";
import type { ActivityItem, AccessLogItem } from "@/types";

const ACTIVITY_ICONS: Record<string, string> = {
    EXPENSE_ADDED: "💰",
    EXPENSE_UPDATED: "✏️",
    EXPENSE_DELETED: "🗑️",
    SETTLEMENT_ADDED: "✅",
    SETTLEMENT_DELETED: "↩️",
    GROUP_CREATED: "👥",
    GROUP_UPDATED: "🔧",
    MEMBER_ADDED: "➕",
    MEMBER_REMOVED: "➖",
    FRIEND_ADDED: "🤝",
    FRIEND_REMOVED: "👋",
    PROFILE_UPDATED: "👤",
};

const ACTIVITY_LABELS: Record<string, string> = {
    EXPENSE_ADDED: "Expense added",
    EXPENSE_UPDATED: "Expense updated",
    EXPENSE_DELETED: "Expense deleted",
    SETTLEMENT_ADDED: "Settlement",
    SETTLEMENT_DELETED: "Settlement removed",
    GROUP_CREATED: "Group created",
    GROUP_UPDATED: "Group updated",
    MEMBER_ADDED: "Member added",
    MEMBER_REMOVED: "Member removed",
    FRIEND_ADDED: "Friend added",
    FRIEND_REMOVED: "Friend removed",
    PROFILE_UPDATED: "Profile updated",
};

const ALL_TYPES = Object.keys(ACTIVITY_LABELS);

function statusColor(code: number) {
    if (code < 300) return "bg-green-100 text-green-700";
    if (code < 400) return "bg-blue-100 text-blue-700";
    if (code < 500) return "bg-yellow-100 text-yellow-700";
    return "bg-red-100 text-red-700";
}

function methodColor(m: string) {
    if (m === "GET") return "bg-sky-100 text-sky-700";
    if (m === "POST") return "bg-emerald-100 text-emerald-700";
    if (m === "PATCH") return "bg-amber-100 text-amber-700";
    if (m === "DELETE") return "bg-red-100 text-red-700";
    return "bg-muted text-muted-foreground";
}

function AuditTrail() {
    const [typeFilter, setTypeFilter] = useState("ALL");

    const { data: activities, isLoading } = useQuery<ActivityItem[]>({
        queryKey: ["activity", "all"],
        queryFn: () => api.get("/api/activity?limit=100"),
    });

    const filtered =
        typeFilter === "ALL" ? activities : activities?.filter((a) => a.type === typeFilter);

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                    {filtered?.length ?? 0} events from you and your friends
                </p>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger className="w-48">
                        <SelectValue placeholder="All types" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="ALL">All types</SelectItem>
                        {ALL_TYPES.map((t) => (
                            <SelectItem key={t} value={t}>
                                {ACTIVITY_ICONS[t]} {ACTIVITY_LABELS[t]}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {isLoading && (
                <div className="space-y-3">
                    {[1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />
                    ))}
                </div>
            )}

            {!isLoading && !filtered?.length && (
                <Card>
                    <CardContent className="py-12 text-center text-muted-foreground">
                        No activity yet.
                    </CardContent>
                </Card>
            )}

            <div className="space-y-0 divide-y">
                {filtered?.map((a) => (
                    <div key={a.id} className="flex items-start gap-3 py-3">
                        <div className="h-9 w-9 shrink-0 flex items-center justify-center rounded-full bg-muted text-base">
                            {ACTIVITY_ICONS[a.type] ?? "📌"}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-start gap-2">
                                <Avatar className="h-5 w-5 mt-0.5 shrink-0">
                                    <AvatarImage src={a.user.image ?? ""} />
                                    <AvatarFallback className="text-[9px]">
                                        {getInitials(a.user.name)}
                                    </AvatarFallback>
                                </Avatar>
                                <p className="text-sm leading-snug">
                                    <span className="font-medium">{a.user.name}</span>{" "}
                                    {a.description}
                                </p>
                            </div>
                            <div className="ml-7 mt-1 flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">
                                    {formatDate(a.createdAt)}
                                </span>
                                <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4">
                                    {ACTIVITY_LABELS[a.type] ?? a.type}
                                </Badge>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function AccessLogs() {
    const { data: logs, isLoading } = useQuery<AccessLogItem[]>({
        queryKey: ["access-logs"],
        queryFn: () => api.get("/api/access-logs?limit=100"),
    });

    return (
        <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
                {logs?.length ?? 0} requests recorded for your session
            </p>

            {isLoading && (
                <div className="space-y-2">
                    {[1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className="h-10 rounded-lg bg-muted animate-pulse" />
                    ))}
                </div>
            )}

            {!isLoading && !logs?.length && (
                <Card>
                    <CardContent className="py-12 text-center text-muted-foreground">
                        No access logs yet.
                    </CardContent>
                </Card>
            )}

            <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
                            <th className="px-3 py-2">Method</th>
                            <th className="px-3 py-2">Path</th>
                            <th className="px-3 py-2">Status</th>
                            <th className="px-3 py-2">Duration</th>
                            <th className="px-3 py-2">IP</th>
                            <th className="px-3 py-2">Time</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {logs?.map((log) => (
                            <tr key={log.id} className="hover:bg-muted/30 transition-colors">
                                <td className="px-3 py-2">
                                    <span
                                        className={`rounded px-1.5 py-0.5 text-xs font-mono font-medium ${methodColor(log.method)}`}
                                    >
                                        {log.method}
                                    </span>
                                </td>
                                <td className="px-3 py-2 font-mono text-xs max-w-[200px] truncate">
                                    {log.path}
                                </td>
                                <td className="px-3 py-2">
                                    <span
                                        className={`rounded px-1.5 py-0.5 text-xs font-medium ${statusColor(log.statusCode)}`}
                                    >
                                        {log.statusCode}
                                    </span>
                                </td>
                                <td className="px-3 py-2 text-xs text-muted-foreground">
                                    {log.duration}ms
                                </td>
                                <td className="px-3 py-2 text-xs text-muted-foreground font-mono">
                                    {log.ip ?? "—"}
                                </td>
                                <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                                    {formatDate(log.createdAt)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

type Tab = "audit" | "access";

export function HistoryPage() {
    const [tab, setTab] = useState<Tab>("audit");

    return (
        <div className="p-6 max-w-4xl mx-auto space-y-6">
            <div>
                <h1 className="text-2xl font-bold">History</h1>
                <p className="text-muted-foreground">
                    Audit trail and access logs for your account
                </p>
            </div>

            <div className="flex gap-1 rounded-lg bg-muted p-1 w-fit">
                <button
                    onClick={() => setTab("audit")}
                    className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${tab === "audit" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                    <ShieldCheck className="h-4 w-4" /> Audit Trail
                </button>
                <button
                    onClick={() => setTab("access")}
                    className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${tab === "access" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                    <Clock className="h-4 w-4" /> Access Logs
                </button>
            </div>

            {tab === "audit" && <AuditTrail />}
            {tab === "access" && <AccessLogs />}
        </div>
    );
}

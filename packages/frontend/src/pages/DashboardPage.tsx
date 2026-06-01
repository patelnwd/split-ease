import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SettleUpDialog } from "@/components/settlements/SettleUpDialog";
import { AddExpenseDialog } from "@/components/expenses/AddExpenseDialog";
import { api } from "@/lib/api";
import { formatCurrency, getInitials, groupCategoryIcon } from "@/lib/utils";
import type { DashboardSummary, GroupSummary } from "@/types";

export function DashboardPage() {
    const { user, refresh } = useAuth();
    const qc = useQueryClient();
    const [searchParams, setSearchParams] = useSearchParams();

    // Fired when the email-verification link redirects back here
    useEffect(() => {
        if (searchParams.get("verified") === "true") {
            toast({
                variant: "success",
                title: "Email verified!",
                description: "Your account is now fully verified.",
            });
            void refresh(); // re-fetch /me so the banner disappears
            setSearchParams({}, { replace: true }); // clean up the URL
        }
    }, []);

    const { data: balanceSummary } = useQuery<DashboardSummary>({
        queryKey: ["balances"],
        queryFn: () => api.get("/api/balances"),
    });

    const { data: groups } = useQuery<GroupSummary[]>({
        queryKey: ["groups"],
        queryFn: () => api.get("/api/groups"),
    });

    const invalidate = () => qc.invalidateQueries();

    return (
        <div className="p-6 max-w-4xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Dashboard</h1>
                    <p className="text-muted-foreground">Hello, {user?.name?.split(" ")[0]} 👋</p>
                </div>
                <AddExpenseDialog onAdded={invalidate} />
            </div>

            <div className="grid grid-cols-3 gap-4">
                {[
                    {
                        icon: TrendingUp,
                        label: "You are owed",
                        value: balanceSummary?.totalOwed ?? 0,
                        color: "text-green-600",
                        iconColor: "text-green-500",
                    },
                    {
                        icon: TrendingDown,
                        label: "You owe",
                        value: balanceSummary?.totalOwing ?? 0,
                        color: "text-red-500",
                        iconColor: "text-red-500",
                    },
                    {
                        icon: Minus,
                        label: "Net balance",
                        value: Math.abs(balanceSummary?.netBalance ?? 0),
                        color:
                            (balanceSummary?.netBalance ?? 0) >= 0
                                ? "text-green-600"
                                : "text-red-500",
                        iconColor: "",
                    },
                ].map(({ icon: Icon, label, value, color, iconColor }) => (
                    <Card key={label}>
                        <CardHeader className="pb-1">
                            <CardTitle
                                className={`text-sm font-medium text-muted-foreground flex items-center gap-1`}
                            >
                                <Icon className={`h-4 w-4 ${iconColor}`} /> {label}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className={`text-2xl font-bold ${color}`}>{formatCurrency(value, user?.currency ?? "INR")}</p>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Balances with friends</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {!balanceSummary?.balances?.length && (
                            <p className="text-sm text-muted-foreground text-center py-4">
                                All settled up! 🎉
                            </p>
                        )}
                        {balanceSummary?.balances?.map((b) => (
                            <div key={b.userId} className="flex items-center gap-3">
                                <Avatar className="h-8 w-8">
                                    <AvatarImage src={b.image ?? ""} />
                                    <AvatarFallback className="text-xs">
                                        {getInitials(b.name)}
                                    </AvatarFallback>
                                </Avatar>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate">{b.name}</p>
                                    <p
                                        className={`text-xs ${b.amount > 0 ? "text-green-600" : "text-red-500"}`}
                                    >
                                        {b.amount > 0
                                            ? `owes you ${formatCurrency(b.amount, user?.currency ?? "INR")}`
                                            : `you owe ${formatCurrency(Math.abs(b.amount), user?.currency ?? "INR")}`}
                                    </p>
                                </div>
                                {b.amount < 0 && (
                                    <SettleUpDialog
                                        toUserId={b.userId}
                                        toUserName={b.name}
                                        toUserImage={b.image}
                                        defaultAmount={b.amount}
                                        onSettled={invalidate}
                                    />
                                )}
                            </div>
                        ))}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Your groups</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {!groups?.length && (
                            <p className="text-sm text-muted-foreground text-center py-4">
                                No groups yet. Create one!
                            </p>
                        )}
                        {groups?.map((g) => (
                            <Link
                                key={g.id}
                                to={`/groups/${g.id}`}
                                className="flex items-center gap-3 hover:bg-muted rounded-lg p-2 -mx-2 transition-colors"
                            >
                                <div className="h-9 w-9 rounded-full bg-brand-100 flex items-center justify-center text-lg shrink-0">
                                    {groupCategoryIcon(g.category)}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate">{g.name}</p>
                                    <p className="text-xs text-muted-foreground">
                                        {g.memberCount} members
                                    </p>
                                </div>
                                <p
                                    className={`text-sm font-medium ${g.myBalance > 0 ? "text-green-600" : g.myBalance < 0 ? "text-red-500" : "text-muted-foreground"}`}
                                >
                                    {(() => {
                                        const cur = user?.currency ?? "INR";
                                        if (g.myBalance > 0) return `+${formatCurrency(g.myBalance, cur)}`;
                                        if (g.myBalance < 0) return formatCurrency(g.myBalance, cur);
                                        return "settled";
                                    })()}
                                </p>
                            </Link>
                        ))}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

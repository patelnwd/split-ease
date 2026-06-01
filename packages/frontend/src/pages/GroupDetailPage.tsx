import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Users, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { AddExpenseDialog } from "@/components/expenses/AddExpenseDialog";
import { ExpenseItem } from "@/components/expenses/ExpenseItem";
import { SettleUpDialog } from "@/components/settlements/SettleUpDialog";
import { api } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { formatCurrency, formatDate, getInitials, groupCategoryIcon } from "@/lib/utils";
import type { GroupDetail } from "@/types";

export function GroupDetailPage() {
    const { id } = useParams<{ id: string }>();
    const { user } = useAuth();
    const navigate = useNavigate();
    const qc = useQueryClient();

    const { data: group, isLoading } = useQuery<GroupDetail>({
        queryKey: ["group", id],
        queryFn: () => api.get(`/api/groups/${id}`),
    });

    const invalidate = () => {
        qc.invalidateQueries({ queryKey: ["group", id] });
        qc.invalidateQueries({ queryKey: ["groups"] });
        qc.invalidateQueries({ queryKey: ["balances"] });
    };

    async function deleteGroup() {
        if (!confirm(`Delete "${group?.name}"? This cannot be undone.`)) return;
        try {
            await api.delete(`/api/groups/${id}`);
            toast({ title: "Group deleted" });
            navigate("/groups");
        } catch {
            toast({ variant: "destructive", title: "Failed to delete group" });
        }
    }

    if (isLoading)
        return <div className="p-6 text-muted-foreground animate-pulse">Loading group…</div>;
    if (!group) return <div className="p-6 text-muted-foreground">Group not found.</div>;

    const isAdmin = group.members.find((m) => m.id === user?.id)?.role === "ADMIN";

    return (
        <div className="p-6 max-w-4xl mx-auto space-y-6">
            <div className="flex items-center gap-3">
                <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="flex-1 flex items-center gap-3">
                    <span className="text-2xl">{groupCategoryIcon(group.category)}</span>
                    <div>
                        <h1 className="text-2xl font-bold">{group.name}</h1>
                        {group.description && (
                            <p className="text-muted-foreground text-sm">{group.description}</p>
                        )}
                    </div>
                </div>
                <div className="flex gap-2">
                    <AddExpenseDialog groupId={id} members={group.members} onAdded={invalidate} />
                    {isAdmin && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={deleteGroup}
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2 space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">
                                Expenses ({group.expenses.length})
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {!group.expenses.length && (
                                <p className="text-sm text-muted-foreground text-center py-6">
                                    No expenses yet. Add one!
                                </p>
                            )}
                            <div className="divide-y">
                                {group.expenses.map((expense) => (
                                    <ExpenseItem
                                        key={expense.id}
                                        expense={expense}
                                        members={group.members}
                                        onDeleted={invalidate}
                                        onUpdated={invalidate}
                                    />
                                ))}
                            </div>
                        </CardContent>
                    </Card>

                    {group.settlements.length > 0 && (
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">Settlements</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                {group.settlements.map((s) => (
                                    <div
                                        key={s.id}
                                        className="flex items-center gap-2 text-sm py-1"
                                    >
                                        <Avatar className="h-6 w-6">
                                            <AvatarImage src={s.fromUser.image ?? ""} />
                                            <AvatarFallback className="text-xs">
                                                {getInitials(s.fromUser.name)}
                                            </AvatarFallback>
                                        </Avatar>
                                        <span className="text-muted-foreground flex-1">
                                            <span className="font-medium text-foreground">
                                                {s.fromUser.name}
                                            </span>{" "}
                                            paid{" "}
                                            <span className="font-medium text-green-600">
                                                {formatCurrency(s.amount)}
                                            </span>{" "}
                                            to{" "}
                                            <span className="font-medium text-foreground">
                                                {s.toUser.name}
                                            </span>
                                        </span>
                                        <span className="text-xs text-muted-foreground">
                                            {formatDate(s.date)}
                                        </span>
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                    )}
                </div>

                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base flex items-center gap-2">
                                <Users className="h-4 w-4" /> Members
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            {group.members.map((m) => (
                                <div key={m.id} className="flex items-center gap-2">
                                    <Avatar className="h-8 w-8">
                                        <AvatarImage src={m.image ?? ""} />
                                        <AvatarFallback className="text-xs">
                                            {getInitials(m.name)}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium truncate">{m.name}</p>
                                        <p className="text-xs text-muted-foreground truncate">
                                            {m.email}
                                        </p>
                                    </div>
                                    {m.role === "ADMIN" && (
                                        <Badge variant="secondary" className="text-xs">
                                            Admin
                                        </Badge>
                                    )}
                                </div>
                            ))}
                        </CardContent>
                    </Card>

                    {group.simplifiedDebts.length > 0 ? (
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">Who owes whom</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {group.simplifiedDebts.map((d, i) => (
                                    <div key={i}>
                                        <div className="flex items-center justify-between text-sm">
                                            <span>
                                                <span className="font-medium">
                                                    {d.fromUserName}
                                                </span>
                                                <span className="text-muted-foreground"> → </span>
                                                <span className="font-medium">{d.toUserName}</span>
                                            </span>
                                            <span className="font-semibold text-red-500">
                                                {formatCurrency(d.amount)}
                                            </span>
                                        </div>
                                        {d.fromUserId === user?.id && (
                                            <div className="mt-1">
                                                <SettleUpDialog
                                                    toUserId={d.toUserId}
                                                    toUserName={d.toUserName}
                                                    defaultAmount={-d.amount}
                                                    groupId={id}
                                                    onSettled={invalidate}
                                                />
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                    ) : group.expenses.length > 0 ? (
                        <Card>
                            <CardContent className="py-6 text-center text-sm text-green-600 font-medium">
                                🎉 All settled up!
                            </CardContent>
                        </Card>
                    ) : null}
                </div>
            </div>
        </div>
    );
}

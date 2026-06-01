import { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Users, Trash2, UserPlus, X, Search } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { AddExpenseDialog } from "@/components/expenses/AddExpenseDialog";
import { ExpenseItem } from "@/components/expenses/ExpenseItem";
import { SettleUpDialog } from "@/components/settlements/SettleUpDialog";
import { api } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { formatCurrency, formatDate, getInitials, groupCategoryIcon } from "@/lib/utils";
import type { GroupDetail, UserSummary } from "@/types";

export function GroupDetailPage() {
    const { id } = useParams<{ id: string }>();
    const { user } = useAuth();
    const navigate = useNavigate();
    const qc = useQueryClient();

    const [showAddMember, setShowAddMember] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<UserSummary[]>([]);
    const [searching, setSearching] = useState(false);
    const [addingId, setAddingId] = useState<string | null>(null);
    const [removingId, setRemovingId] = useState<string | null>(null);
    const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

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

    function onSearchChange(q: string) {
        setSearchQuery(q);
        if (searchTimeout.current) clearTimeout(searchTimeout.current);
        if (q.trim().length < 2) { setSearchResults([]); return; }
        searchTimeout.current = setTimeout(async () => {
            setSearching(true);
            try {
                const results = await api.get<UserSummary[]>(`/api/users/search?q=${encodeURIComponent(q)}`);
                const memberIds = new Set(group?.members.map((m) => m.id) ?? []);
                setSearchResults(results.filter((r) => !memberIds.has(r.id)));
            } catch {
                setSearchResults([]);
            } finally {
                setSearching(false);
            }
        }, 300);
    }

    async function addMember(userId: string) {
        setAddingId(userId);
        try {
            await api.post(`/api/groups/${id}/members`, { userId });
            toast({ variant: "success", title: "Member added" });
            setSearchQuery("");
            setSearchResults([]);
            setShowAddMember(false);
            invalidate();
        } catch (e: unknown) {
            toast({ variant: "destructive", title: (e as Error).message });
        } finally {
            setAddingId(null);
        }
    }

    async function removeMember(memberId: string, memberName: string) {
        const isSelf = memberId === user?.id;
        if (!confirm(isSelf ? "Leave this group?" : `Remove ${memberName} from the group?`)) return;
        setRemovingId(memberId);
        try {
            await api.delete(`/api/groups/${id}/members?userId=${memberId}`);
            toast({ variant: "success", title: isSelf ? "You left the group" : `${memberName} removed` });
            if (isSelf) navigate("/groups");
            else invalidate();
        } catch (e: unknown) {
            const msg = (e as Error).message;
            const isUnsettled = msg.includes("Settle up first");
            toast({
                variant: "destructive",
                title: isUnsettled ? "Outstanding balance" : "Could not remove member",
                description: msg,
            });
        } finally {
            setRemovingId(null);
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
                    {/* ── Members card ── */}
                    <Card>
                        <CardHeader className="pb-2">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-base flex items-center gap-2">
                                    <Users className="h-4 w-4" /> Members ({group.members.length})
                                </CardTitle>
                                {isAdmin && (
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                        onClick={() => {
                                            setShowAddMember((v) => !v);
                                            setSearchQuery("");
                                            setSearchResults([]);
                                        }}
                                        title={showAddMember ? "Cancel" : "Add member"}
                                    >
                                        {showAddMember ? (
                                            <X className="h-4 w-4" />
                                        ) : (
                                            <UserPlus className="h-4 w-4" />
                                        )}
                                    </Button>
                                )}
                            </div>

                            {/* Add-member search */}
                            {showAddMember && (
                                <div className="pt-2 space-y-2">
                                    <div className="relative">
                                        <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                                        <Input
                                            className="pl-7 h-8 text-sm"
                                            placeholder="Search by name or email…"
                                            value={searchQuery}
                                            onChange={(e) => onSearchChange(e.target.value)}
                                            autoFocus
                                        />
                                    </div>
                                    {searching && (
                                        <p className="text-xs text-muted-foreground pl-1">
                                            Searching…
                                        </p>
                                    )}
                                    {!searching && searchResults.length > 0 && (
                                        <div className="border rounded-md divide-y">
                                            {searchResults.map((r) => (
                                                <button
                                                    key={r.id}
                                                    type="button"
                                                    disabled={addingId === r.id}
                                                    onClick={() => addMember(r.id)}
                                                    className="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-muted transition-colors text-sm disabled:opacity-50"
                                                >
                                                    <Avatar className="h-6 w-6 shrink-0">
                                                        <AvatarImage src={r.image ?? ""} />
                                                        <AvatarFallback className="text-xs">
                                                            {getInitials(r.name)}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                    <div className="min-w-0">
                                                        <p className="font-medium truncate">
                                                            {r.name}
                                                        </p>
                                                        <p className="text-xs text-muted-foreground truncate">
                                                            {r.email}
                                                        </p>
                                                    </div>
                                                    <span className="ml-auto text-xs text-brand-600 shrink-0">
                                                        {addingId === r.id ? "Adding…" : "Add"}
                                                    </span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                    {!searching &&
                                        searchQuery.trim().length >= 2 &&
                                        searchResults.length === 0 && (
                                            <p className="text-xs text-muted-foreground pl-1">
                                                No users found.
                                            </p>
                                        )}
                                </div>
                            )}
                        </CardHeader>

                        <CardContent className="space-y-1 pt-0">
                            {group.members.map((m) => {
                                const canRemove =
                                    isAdmin || m.id === user?.id;
                                const isOnlyAdmin =
                                    m.role === "ADMIN" &&
                                    group.members.filter((x) => x.role === "ADMIN").length === 1;
                                return (
                                    <div key={m.id} className="flex items-center gap-2 py-1 group/member">
                                        <Avatar className="h-8 w-8 shrink-0">
                                            <AvatarImage src={m.image ?? ""} />
                                            <AvatarFallback className="text-xs">
                                                {getInitials(m.name)}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium truncate">
                                                {m.name}
                                                {m.id === user?.id && (
                                                    <span className="text-muted-foreground font-normal">
                                                        {" "}(you)
                                                    </span>
                                                )}
                                            </p>
                                            <p className="text-xs text-muted-foreground truncate">
                                                {m.email}
                                            </p>
                                        </div>
                                        {m.role === "ADMIN" && (
                                            <Badge variant="secondary" className="text-xs shrink-0">
                                                Admin
                                            </Badge>
                                        )}
                                        {canRemove && !isOnlyAdmin && (
                                            <button
                                                type="button"
                                                disabled={removingId === m.id}
                                                onClick={() => removeMember(m.id, m.name)}
                                                className="ml-1 opacity-0 group-hover/member:opacity-100 transition-opacity text-muted-foreground hover:text-destructive disabled:opacity-40"
                                                title={m.id === user?.id ? "Leave group" : "Remove member"}
                                            >
                                                <X className="h-3.5 w-3.5" />
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </CardContent>
                    </Card>

                    {(() => {
                        if (group.simplifiedDebts.length > 0) {
                            return (
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="text-base">Who owes whom</CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-3">
                                        {group.simplifiedDebts.map((d) => (
                                            <div key={`${d.fromUserId}-${d.toUserId}`}>
                                                <div className="flex items-center justify-between text-sm">
                                                    <span>
                                                        <span className="font-medium">
                                                            {d.fromUserName}
                                                        </span>
                                                        <span className="text-muted-foreground">
                                                            {" "}→{" "}
                                                        </span>
                                                        <span className="font-medium">
                                                            {d.toUserName}
                                                        </span>
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
                            );
                        }
                        if (group.expenses.length > 0) {
                            return (
                                <Card>
                                    <CardContent className="py-6 text-center text-sm text-green-600 font-medium">
                                        🎉 All settled up!
                                    </CardContent>
                                </Card>
                            );
                        }
                        return null;
                    })()}
                </div>
            </div>
        </div>
    );
}

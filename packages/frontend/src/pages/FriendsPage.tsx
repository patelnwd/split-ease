import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UserPlus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SettleUpDialog } from "@/components/settlements/SettleUpDialog";
import { AddExpenseDialog } from "@/components/expenses/AddExpenseDialog";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { formatCurrency, getInitials } from "@/lib/utils";
import type { Friend, UserSummary } from "@/types";

export function FriendsPage() {
    const qc = useQueryClient();
    const [addOpen, setAddOpen] = useState(false);
    const [searchQ, setSearchQ] = useState("");
    const [searchResults, setSearchResults] = useState<UserSummary[]>([]);

    const { data: friends, isLoading } = useQuery<Friend[]>({
        queryKey: ["friends"],
        queryFn: () => api.get("/api/friends"),
    });

    async function searchUsers(q: string) {
        setSearchQ(q);
        if (q.length < 2) {
            setSearchResults([]);
            return;
        }
        try {
            const data = await api.get<UserSummary[]>(
                `/api/users/search?q=${encodeURIComponent(q)}`,
            );
            const friendIds = new Set(friends?.map((f) => f.id));
            setSearchResults(data.filter((u) => !friendIds.has(u.id)));
        } catch {
            setSearchResults([]);
        }
    }

    async function addFriend(userId: string) {
        try {
            await api.post("/api/friends", { userId });
            toast({ variant: "success", title: "Friend added!" });
            qc.invalidateQueries({ queryKey: ["friends"] });
            setAddOpen(false);
            setSearchQ("");
            setSearchResults([]);
        } catch {
            toast({ variant: "destructive", title: "Failed to add friend" });
        }
    }

    const invalidate = () => {
        qc.invalidateQueries({ queryKey: ["friends"] });
        qc.invalidateQueries({ queryKey: ["balances"] });
    };

    return (
        <div className="p-6 max-w-2xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Friends</h1>
                    <p className="text-muted-foreground">Track balances with friends</p>
                </div>
                <Dialog open={addOpen} onOpenChange={setAddOpen}>
                    <DialogTrigger asChild>
                        <Button variant="brand" className="gap-2">
                            <UserPlus className="h-4 w-4" /> Add Friend
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-sm">
                        <DialogHeader>
                            <DialogTitle>Add a Friend</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-3">
                            <div className="relative">
                                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    className="pl-9"
                                    placeholder="Search by name or email…"
                                    value={searchQ}
                                    onChange={(e) => searchUsers(e.target.value)}
                                />
                            </div>
                            {searchResults.map((u) => (
                                <div
                                    key={u.id}
                                    className="flex items-center gap-3 rounded-lg border p-3"
                                >
                                    <Avatar className="h-9 w-9">
                                        <AvatarFallback>{getInitials(u.name)}</AvatarFallback>
                                    </Avatar>
                                    <div className="flex-1">
                                        <p className="text-sm font-medium">{u.name}</p>
                                        <p className="text-xs text-muted-foreground">{u.email}</p>
                                    </div>
                                    <Button
                                        size="sm"
                                        variant="brand"
                                        onClick={() => addFriend(u.id)}
                                    >
                                        Add
                                    </Button>
                                </div>
                            ))}
                            {searchQ.length >= 2 && !searchResults.length && (
                                <p className="text-sm text-muted-foreground text-center py-2">
                                    No users found
                                </p>
                            )}
                        </div>
                    </DialogContent>
                </Dialog>
            </div>

            {isLoading && (
                <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="h-20 rounded-lg bg-muted animate-pulse" />
                    ))}
                </div>
            )}
            {!isLoading && !friends?.length && (
                <Card>
                    <CardContent className="flex flex-col items-center gap-3 py-12">
                        <p className="text-muted-foreground">
                            No friends yet — add someone to start splitting!
                        </p>
                    </CardContent>
                </Card>
            )}

            <div className="space-y-3">
                {friends?.map((f) => (
                    <Card key={f.id}>
                        <CardContent className="flex items-center gap-4 p-4">
                            <Avatar className="h-11 w-11">
                                <AvatarImage src={f.image ?? ""} />
                                <AvatarFallback className="bg-brand-100 text-brand-700">
                                    {getInitials(f.name)}
                                </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                                <p className="font-medium">{f.name}</p>
                                <p className="text-sm text-muted-foreground truncate">{f.email}</p>
                                {f.balance !== 0 ? (
                                    <p
                                        className={`text-sm font-medium mt-0.5 ${f.balance > 0 ? "text-green-600" : "text-red-500"}`}
                                    >
                                        {f.balance > 0
                                            ? `${f.name.split(" ")[0]} owes you ${formatCurrency(f.balance)}`
                                            : `You owe ${f.name.split(" ")[0]} ${formatCurrency(Math.abs(f.balance))}`}
                                    </p>
                                ) : (
                                    <p className="text-sm text-muted-foreground mt-0.5">
                                        All settled up ✓
                                    </p>
                                )}
                            </div>
                            <div className="flex gap-2">
                                {f.balance < 0 && (
                                    <SettleUpDialog
                                        toUserId={f.id}
                                        toUserName={f.name}
                                        toUserImage={f.image}
                                        defaultAmount={f.balance}
                                        onSettled={invalidate}
                                    />
                                )}
                                <AddExpenseDialog
                                    members={[
                                        {
                                            id: f.id,
                                            name: f.name,
                                            email: f.email,
                                            image: f.image,
                                            role: "MEMBER",
                                        },
                                    ]}
                                    onAdded={invalidate}
                                    trigger={
                                        <Button size="sm" variant="outline">
                                            Add expense
                                        </Button>
                                    }
                                />
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
}

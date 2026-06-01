import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Users } from "lucide-react";
import { CreateGroupDialog } from "@/components/groups/CreateGroupDialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { formatCurrency, groupCategoryIcon } from "@/lib/utils";
import type { GroupSummary } from "@/types";

export function GroupsPage() {
    const qc = useQueryClient();
    const { data: groups, isLoading } = useQuery<GroupSummary[]>({
        queryKey: ["groups"],
        queryFn: () => api.get("/api/groups"),
    });

    return (
        <div className="p-6 max-w-4xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Groups</h1>
                    <p className="text-muted-foreground">Manage your shared expense groups</p>
                </div>
                <CreateGroupDialog
                    onCreated={() => qc.invalidateQueries({ queryKey: ["groups"] })}
                />
            </div>

            {isLoading && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="h-32 rounded-lg bg-muted animate-pulse" />
                    ))}
                </div>
            )}

            {!isLoading && !groups?.length && (
                <Card>
                    <CardContent className="flex flex-col items-center gap-3 py-12">
                        <Users className="h-12 w-12 text-muted-foreground" />
                        <p className="text-muted-foreground">No groups yet</p>
                        <CreateGroupDialog
                            onCreated={() => qc.invalidateQueries({ queryKey: ["groups"] })}
                        />
                    </CardContent>
                </Card>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {groups?.map((g) => (
                    <Link key={g.id} to={`/groups/${g.id}`}>
                        <Card className="hover:shadow-md transition-shadow cursor-pointer">
                            <CardContent className="p-5">
                                <div className="flex items-start gap-3">
                                    <div className="h-10 w-10 rounded-xl bg-brand-100 flex items-center justify-center text-xl shrink-0">
                                        {groupCategoryIcon(g.category)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-start justify-between gap-2">
                                            <h3 className="font-semibold truncate">{g.name}</h3>
                                            <Badge variant="outline" className="text-xs shrink-0">
                                                {g.category}
                                            </Badge>
                                        </div>
                                        {g.description && (
                                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                                                {g.description}
                                            </p>
                                        )}
                                        <div className="flex items-center justify-between mt-3">
                                            <span className="text-xs text-muted-foreground">
                                                {g.memberCount} members
                                            </span>
                                            <span
                                                className={`text-sm font-semibold ${g.myBalance > 0 ? "text-green-600" : g.myBalance < 0 ? "text-red-500" : "text-muted-foreground"}`}
                                            >
                                                {g.myBalance > 0
                                                    ? `+${formatCurrency(g.myBalance)}`
                                                    : g.myBalance < 0
                                                      ? formatCurrency(g.myBalance)
                                                      : "All settled"}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </Link>
                ))}
            </div>
        </div>
    );
}

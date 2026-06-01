import { useQuery } from "@tanstack/react-query";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/lib/api";
import { formatDate, getInitials } from "@/lib/utils";
import type { ActivityItem } from "@/types";

const activityIcon: Record<string, string> = {
    EXPENSE_ADDED: "💰",
    EXPENSE_UPDATED: "✏️",
    EXPENSE_DELETED: "🗑️",
    SETTLEMENT_ADDED: "✅",
    GROUP_CREATED: "👥",
    MEMBER_ADDED: "➕",
    MEMBER_REMOVED: "➖",
};

export function ActivityPage() {
    const { data: activities, isLoading } = useQuery<ActivityItem[]>({
        queryKey: ["activity"],
        queryFn: () => api.get("/api/activity"),
    });

    return (
        <div className="p-6 max-w-2xl mx-auto space-y-6">
            <div>
                <h1 className="text-2xl font-bold">Activity</h1>
                <p className="text-muted-foreground">Recent actions from you and your friends</p>
            </div>

            {isLoading && (
                <div className="space-y-3">
                    {[1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />
                    ))}
                </div>
            )}

            {!isLoading && !activities?.length && (
                <Card>
                    <CardContent className="py-12 text-center text-muted-foreground">
                        No activity yet. Add some expenses!
                    </CardContent>
                </Card>
            )}

            <div className="space-y-1">
                {activities?.map((a) => (
                    <div
                        key={a.id}
                        className="flex items-start gap-3 py-3 border-b last:border-b-0"
                    >
                        <div className="h-9 w-9 shrink-0 flex items-center justify-center rounded-full bg-muted text-base">
                            {activityIcon[a.type] ?? "📌"}
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
                            <p className="text-xs text-muted-foreground mt-1 ml-7">
                                {formatDate(a.createdAt)}
                            </p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

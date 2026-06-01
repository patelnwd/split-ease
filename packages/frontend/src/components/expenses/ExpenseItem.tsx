import { Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate, getInitials } from "@/lib/utils";
import { api } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { EditExpenseDialog } from "./EditExpenseDialog";
import type { ExpenseItem as Expense, GroupMember } from "@/types";

function resolveIcon(expense: Readonly<Expense>): string {
    return expense.customCategory?.icon ?? categoryIcon(expense.category);
}

type Props = {
    expense: Expense;
    members?: GroupMember[];
    onDeleted?: () => void;
    onUpdated?: () => void;
};

export function ExpenseItem({ expense, members, onDeleted, onUpdated }: Props) {
    const { user } = useAuth();
    const isPayer = expense.paidBy.id === user?.id;
    const myParticipant = expense.participants.find((p) => p.userId === user?.id);
    const myShare = myParticipant?.amount ?? 0;

    async function deleteExpense() {
        if (!confirm("Delete this expense?")) return;
        try {
            await api.delete(`/api/expenses/${expense.id}`);
            toast({ title: "Expense deleted" });
            onDeleted?.();
        } catch {
            toast({ variant: "destructive", title: "Failed to delete expense" });
        }
    }

    return (
        <div className="flex items-start gap-3 py-4">
            <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg"
                style={
                    expense.customCategory
                        ? {
                              background: expense.customCategory.color + "22",
                              color: expense.customCategory.color,
                          }
                        : { background: "hsl(var(--muted))" }
                }
            >
                {resolveIcon(expense)}
            </div>
            <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                    <div>
                        <p className="font-medium">{expense.description}</p>
                        <p className="text-xs text-muted-foreground">
                            {formatDate(expense.date)} · {expense.paidBy.name} paid
                            {expense.customCategory && (
                                <span> · {expense.customCategory.name}</span>
                            )}
                        </p>
                    </div>
                    <div className="text-right">
                        <p className="font-semibold">
                            {formatCurrency(expense.amount, expense.currency)}
                        </p>
                        {myParticipant && (
                            <p className={`text-xs ${isPayer ? "text-green-600" : "text-red-500"}`}>
                                {isPayer
                                    ? `you lent ${formatCurrency(expense.amount - myShare, expense.currency)}`
                                    : `you owe ${formatCurrency(myShare, expense.currency)}`}
                            </p>
                        )}
                    </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                    {expense.participants.map((p) => (
                        <div
                            key={p.userId}
                            className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs"
                        >
                            <Avatar className="h-4 w-4">
                                <AvatarImage src={p.user.image ?? ""} />
                                <AvatarFallback className="text-[8px]">
                                    {getInitials(p.user.name)}
                                </AvatarFallback>
                            </Avatar>
                            <span>{p.user.name.split(" ")[0]}</span>
                            <span className="text-muted-foreground">
                                {formatCurrency(p.amount, expense.currency)}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
            {isPayer && (
                <div className="flex shrink-0 gap-0.5">
                    {onUpdated && (
                        <EditExpenseDialog
                            expense={expense}
                            members={members}
                            onUpdated={onUpdated}
                        />
                    )}
                    {onDeleted && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={deleteExpense}
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    )}
                </div>
            )}
        </div>
    );
}

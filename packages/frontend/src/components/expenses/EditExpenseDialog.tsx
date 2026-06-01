import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
    DialogTrigger,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { getInitials } from "@/lib/utils";
import { api } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import type { ExpenseItem as Expense, GroupMember, CustomCategory } from "@/types";

const BUILT_IN_CATEGORIES = [
    { value: "GENERAL", label: "📦 General" },
    { value: "FOOD", label: "🍔 Food" },
    { value: "TRANSPORT", label: "🚗 Transport" },
    { value: "ACCOMMODATION", label: "🏨 Accommodation" },
    { value: "ENTERTAINMENT", label: "🎬 Entertainment" },
    { value: "SHOPPING", label: "🛍️ Shopping" },
    { value: "UTILITIES", label: "💡 Utilities" },
    { value: "HEALTHCARE", label: "💊 Healthcare" },
    { value: "OTHER", label: "📌 Other" },
];

const schema = z.object({
    description: z.string().min(1, "Description required"),
    amount: z.coerce.number().positive("Must be positive"),
    category: z.string().default("GENERAL"),
    splitType: z.enum(["EQUAL", "EXACT", "PERCENTAGE", "SHARES"]),
    date: z.string(),
    notes: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

type Props = {
    expense: Expense;
    members?: GroupMember[];
    onUpdated: () => void;
};

export function EditExpenseDialog({ expense, members = [], onUpdated }: Props) {
    const [open, setOpen] = useState(false);
    const [participantIds, setParticipantIds] = useState<string[]>([]);
    const [exactAmounts, setExactAmounts] = useState<Record<string, string>>({});

    const allMembers: GroupMember[] =
        members.length > 0
            ? members
            : expense.participants.map((p) => ({ ...p.user, role: "MEMBER" }));

    const { data: customCategories = [] } = useQuery<CustomCategory[]>({
        queryKey: ["categories"],
        queryFn: () => api.get("/api/categories"),
        enabled: open,
    });

    // Initial category value: use customCategoryId if set, else the enum value
    const initialCategory = expense.customCategoryId ?? expense.category;

    const {
        register,
        handleSubmit,
        watch,
        setValue,
        reset,
        formState: { errors, isSubmitting },
    } = useForm<FormValues>({
        resolver: zodResolver(schema),
        defaultValues: {
            description: expense.description,
            amount: expense.amount,
            category: initialCategory,
            splitType: expense.splitType as FormValues["splitType"],
            date: expense.date.split("T")[0],
            notes: expense.notes ?? "",
        },
    });

    const splitType = watch("splitType");
    const amount = watch("amount");
    const category = watch("category");

    useEffect(() => {
        if (open) {
            setParticipantIds(expense.participants.map((p) => p.userId));
            const initAmounts: Record<string, string> = {};
            for (const p of expense.participants) {
                if (expense.splitType === "EXACT") initAmounts[p.userId] = String(p.amount);
                if (expense.splitType === "PERCENTAGE")
                    initAmounts[p.userId] = String(p.percentage ?? "");
                if (expense.splitType === "SHARES") initAmounts[p.userId] = String(p.shares ?? "1");
            }
            setExactAmounts(initAmounts);
        }
    }, [open]);

    async function onSubmit(data: FormValues) {
        const participants = participantIds.map((userId) => {
            if (splitType === "EXACT")
                return { userId, amount: parseFloat(exactAmounts[userId] ?? "0") };
            if (splitType === "PERCENTAGE")
                return { userId, percentage: parseFloat(exactAmounts[userId] ?? "0") };
            if (splitType === "SHARES")
                return { userId, shares: parseInt(exactAmounts[userId] ?? "1") };
            return { userId };
        });

        const isCustom = customCategories.some((c) => c.id === data.category);
        const payload = {
            ...data,
            category: isCustom ? "OTHER" : data.category,
            customCategoryId: isCustom ? data.category : null,
            participants,
        };

        try {
            await api.patch(`/api/expenses/${expense.id}`, payload);
            toast({ variant: "success", title: "Expense updated!" });
            reset();
            setOpen(false);
            onUpdated();
        } catch (e: unknown) {
            toast({ variant: "destructive", title: (e as Error).message });
        }
    }

    const selectedCustomCat = customCategories.find((c) => c.id === category);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-brand-600"
                >
                    <Pencil className="h-4 w-4" />
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Edit Expense</DialogTitle>
                    <DialogDescription>Update the details of this expense.</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="col-span-2 space-y-1">
                            <Label>Description *</Label>
                            <Input
                                placeholder="Dinner, taxi, groceries…"
                                {...register("description")}
                            />
                            {errors.description && (
                                <p className="text-xs text-destructive">
                                    {errors.description.message}
                                </p>
                            )}
                        </div>
                        <div className="space-y-1">
                            <Label>Amount *</Label>
                            <Input
                                type="number"
                                step="0.01"
                                min="0.01"
                                placeholder="0.00"
                                {...register("amount")}
                            />
                            {errors.amount && (
                                <p className="text-xs text-destructive">{errors.amount.message}</p>
                            )}
                        </div>
                        <div className="space-y-1">
                            <Label>Date</Label>
                            <Input type="date" {...register("date")} />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <Label>Category</Label>
                            <Select value={category} onValueChange={(v) => setValue("category", v)}>
                                <SelectTrigger>
                                    <SelectValue>
                                        {selectedCustomCat ? (
                                            <span>
                                                {selectedCustomCat.icon} {selectedCustomCat.name}
                                            </span>
                                        ) : (
                                            (BUILT_IN_CATEGORIES.find((c) => c.value === category)
                                                ?.label ?? "📦 General")
                                        )}
                                    </SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                    {BUILT_IN_CATEGORIES.map((c) => (
                                        <SelectItem key={c.value} value={c.value}>
                                            {c.label}
                                        </SelectItem>
                                    ))}
                                    {customCategories.length > 0 && (
                                        <>
                                            <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground border-t mt-1">
                                                My Categories
                                            </div>
                                            {customCategories.map((c) => (
                                                <SelectItem key={c.id} value={c.id}>
                                                    {c.icon} {c.name}
                                                </SelectItem>
                                            ))}
                                        </>
                                    )}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1">
                            <Label>Split type</Label>
                            <Select
                                defaultValue={expense.splitType}
                                onValueChange={(v) =>
                                    setValue("splitType", v as FormValues["splitType"])
                                }
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="EQUAL">Equal</SelectItem>
                                    <SelectItem value="EXACT">Exact amounts</SelectItem>
                                    <SelectItem value="PERCENTAGE">By percentage</SelectItem>
                                    <SelectItem value="SHARES">By shares</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>Split between</Label>
                        <div className="space-y-2">
                            {allMembers.map((m) => {
                                const isSelected = participantIds.includes(m.id);
                                return (
                                    <div key={m.id} className="flex items-center gap-3">
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setParticipantIds((prev) =>
                                                    isSelected
                                                        ? prev.filter((id) => id !== m.id)
                                                        : [...prev, m.id],
                                                )
                                            }
                                            className={`flex items-center gap-2 flex-1 rounded-lg border p-2 text-sm transition-colors ${isSelected ? "border-brand-400 bg-brand-50" : "border-transparent bg-muted"}`}
                                        >
                                            <Avatar className="h-6 w-6">
                                                <AvatarFallback className="text-xs">
                                                    {getInitials(m.name)}
                                                </AvatarFallback>
                                            </Avatar>
                                            <span>{m.name}</span>
                                            {isSelected && splitType === "EQUAL" && (
                                                <span className="ml-auto text-xs text-muted-foreground">
                                                    $
                                                    {(
                                                        (amount || 0) /
                                                        Math.max(participantIds.length, 1)
                                                    ).toFixed(2)}
                                                </span>
                                            )}
                                        </button>
                                        {isSelected && splitType !== "EQUAL" && (
                                            <Input
                                                className="w-24"
                                                type="number"
                                                step="0.01"
                                                min="0"
                                                placeholder={splitType === "SHARES" ? "1" : "0"}
                                                value={exactAmounts[m.id] ?? ""}
                                                onChange={(e) =>
                                                    setExactAmounts((prev) => ({
                                                        ...prev,
                                                        [m.id]: e.target.value,
                                                    }))
                                                }
                                            />
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="space-y-1">
                        <Label>Notes (optional)</Label>
                        <Input placeholder="Add a note…" {...register("notes")} />
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            variant="brand"
                            disabled={isSubmitting || participantIds.length === 0}
                        >
                            {isSubmitting ? "Saving…" : "Save Changes"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

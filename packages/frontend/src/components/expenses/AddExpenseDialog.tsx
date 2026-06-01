import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
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
import { formatCurrency, getInitials } from "@/lib/utils";
import { api } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import type { GroupMember, CustomCategory } from "@/types";

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
    paidById: z.string(),
    date: z.string(),
    notes: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

type Props = {
    groupId?: string;
    members?: GroupMember[];
    onAdded: () => void;
    trigger?: React.ReactNode;
};

export function AddExpenseDialog({ groupId, members = [], onAdded, trigger }: Props) {
    const { user } = useAuth();
    const [open, setOpen] = useState(false);
    const [participantIds, setParticipantIds] = useState<string[]>([]);
    const [exactAmounts, setExactAmounts] = useState<Record<string, string>>({});

    const allMembers =
        members.length > 0
            ? members
            : user
              ? [
                    {
                        id: user.id,
                        name: user.name,
                        email: user.email,
                        image: user.image,
                        role: "MEMBER",
                    },
                ]
              : [];

    const { data: customCategories = [] } = useQuery<CustomCategory[]>({
        queryKey: ["categories"],
        queryFn: () => api.get("/api/categories"),
        enabled: open,
    });

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
            category: "GENERAL",
            splitType: "EQUAL",
            paidById: user?.id ?? "",
            date: new Date().toISOString().split("T")[0],
        },
    });

    const splitType = watch("splitType");
    const amount = watch("amount");
    const category = watch("category");

    useEffect(() => {
        if (open && user) {
            setParticipantIds(allMembers.map((m) => m.id));
            setValue("paidById", user.id);
        }
    }, [open, user]);

    async function onSubmit(data: FormValues) {
        if (splitType === "EXACT") {
            const sum = participantIds.reduce(
                (s, id) => s + parseFloat(exactAmounts[id] ?? "0"),
                0,
            );
            if (Math.abs(sum - data.amount) > 0.01) {
                toast({
                    variant: "destructive",
                    title: `Exact amounts must sum to ${formatCurrency(data.amount, user?.currency ?? "INR")} (currently ${formatCurrency(sum, user?.currency ?? "INR")})`,
                });
                return;
            }
        }

        if (splitType === "PERCENTAGE") {
            const sum = participantIds.reduce(
                (s, id) => s + parseFloat(exactAmounts[id] ?? "0"),
                0,
            );
            if (Math.abs(sum - 100) > 0.01) {
                toast({
                    variant: "destructive",
                    title: `Percentages must sum to 100% (currently ${sum.toFixed(1)}%)`,
                });
                return;
            }
        }

        const participants = participantIds.map((userId) => {
            if (splitType === "EXACT")
                return { userId, amount: parseFloat(exactAmounts[userId] ?? "0") };
            if (splitType === "PERCENTAGE")
                return { userId, percentage: parseFloat(exactAmounts[userId] ?? "0") };
            if (splitType === "SHARES")
                return { userId, shares: parseInt(exactAmounts[userId] ?? "1") };
            return { userId };
        });

        // Determine if the selected category is a custom one
        const isCustom = customCategories.some((c) => c.id === data.category);
        const payload = {
            ...data,
            category: isCustom ? "OTHER" : data.category,
            customCategoryId: isCustom ? data.category : null,
            groupId,
            participants,
        };

        try {
            await api.post("/api/expenses", payload);
            toast({ variant: "success", title: "Expense added!" });
            reset();
            setOpen(false);
            onAdded();
        } catch (e: unknown) {
            toast({ variant: "destructive", title: (e as Error).message });
        }
    }

    const selectedCustomCat = customCategories.find((c) => c.id === category);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {trigger ?? (
                    <Button variant="brand" className="gap-2">
                        <Plus className="h-4 w-4" /> Add Expense
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Add Expense</DialogTitle>
                    <DialogDescription>Record a shared expense and split it.</DialogDescription>
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
                                defaultValue="EQUAL"
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

                    <div className="space-y-1">
                        <Label>Paid by</Label>
                        <Select
                            defaultValue={user?.id}
                            onValueChange={(v) => setValue("paidById", v)}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {allMembers.map((m) => (
                                    <SelectItem key={m.id} value={m.id}>
                                        {m.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {allMembers.length > 0 && (
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
                                                        {formatCurrency(
                                                            (amount || 0) /
                                                                Math.max(participantIds.length, 1),
                                                            user?.currency ?? "INR",
                                                        )}
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
                    )}

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
                            {isSubmitting ? "Saving…" : "Add Expense"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

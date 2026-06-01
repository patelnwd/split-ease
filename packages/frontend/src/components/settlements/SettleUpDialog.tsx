import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatCurrency, getInitials } from "@/lib/utils";
import { api } from "@/lib/api";
import { toast } from "@/hooks/use-toast";

const schema = z.object({
    amount: z.coerce.number().positive("Amount must be positive"),
    notes: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

type Props = {
    toUserId: string;
    toUserName: string;
    toUserImage?: string | null;
    defaultAmount?: number;
    groupId?: string;
    onSettled: () => void;
};

export function SettleUpDialog({
    toUserId,
    toUserName,
    toUserImage,
    defaultAmount,
    groupId,
    onSettled,
}: Props) {
    const [open, setOpen] = useState(false);
    const {
        register,
        handleSubmit,
        reset,
        formState: { errors, isSubmitting },
    } = useForm<FormValues>({
        resolver: zodResolver(schema),
        defaultValues: { amount: defaultAmount ? Math.abs(defaultAmount) : undefined },
    });

    async function onSubmit(data: FormValues) {
        try {
            await api.post("/api/settlements", {
                amount: data.amount,
                toUserId,
                groupId,
                notes: data.notes,
            });
            toast({ variant: "success", title: "Settlement recorded!" });
            reset();
            setOpen(false);
            onSettled();
        } catch {
            toast({ variant: "destructive", title: "Failed to record settlement" });
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button
                    size="sm"
                    variant="outline"
                    className="text-brand-600 border-brand-300 hover:bg-brand-50"
                >
                    Settle up
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle>Settle Up</DialogTitle>
                    <DialogDescription>Record a payment to settle a balance.</DialogDescription>
                </DialogHeader>
                <div className="flex items-center justify-center gap-4 py-2">
                    <div className="flex flex-col items-center gap-1">
                        <Avatar className="h-10 w-10">
                            <AvatarFallback className="bg-brand-100 text-brand-700">
                                You
                            </AvatarFallback>
                        </Avatar>
                        <span className="text-xs text-muted-foreground">You</span>
                    </div>
                    <ArrowRight className="h-5 w-5 text-brand-600" />
                    <div className="flex flex-col items-center gap-1">
                        <Avatar className="h-10 w-10">
                            <AvatarImage src={toUserImage ?? ""} />
                            <AvatarFallback>{getInitials(toUserName)}</AvatarFallback>
                        </Avatar>
                        <span className="text-xs text-muted-foreground">{toUserName}</span>
                    </div>
                </div>
                {defaultAmount && (
                    <p className="text-center text-sm text-muted-foreground">
                        You owe {formatCurrency(Math.abs(defaultAmount))}
                    </p>
                )}
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                    <div className="space-y-1">
                        <Label>Amount</Label>
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
                        <Label>Note (optional)</Label>
                        <Input placeholder="Paid via UPI, cash…" {...register("notes")} />
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" variant="brand" disabled={isSubmitting}>
                            {isSubmitting ? "Recording…" : "Record Payment"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

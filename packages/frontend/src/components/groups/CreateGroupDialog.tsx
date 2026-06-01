import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Search, X } from "lucide-react";
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

const schema = z.object({
    name: z.string().min(1, "Name is required").max(100),
    description: z.string().max(500).optional(),
    category: z.enum(["HOME", "TRIP", "COUPLE", "WORK", "OTHER"]),
});
type FormValues = z.infer<typeof schema>;
type User = { id: string; name: string; email: string };

export function CreateGroupDialog({ onCreated }: { onCreated: () => void }) {
    const [open, setOpen] = useState(false);
    const [members, setMembers] = useState<User[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<User[]>([]);

    const {
        register,
        handleSubmit,
        setValue,
        reset,
        formState: { errors, isSubmitting },
    } = useForm<FormValues>({
        resolver: zodResolver(schema),
        defaultValues: { category: "OTHER" },
    });

    async function searchUsers(q: string) {
        setSearchQuery(q);
        if (q.length < 2) {
            setSearchResults([]);
            return;
        }
        try {
            const data = await api.get<User[]>(`/api/users/search?q=${encodeURIComponent(q)}`);
            setSearchResults(data.filter((u) => !members.find((m) => m.id === u.id)));
        } catch {
            setSearchResults([]);
        }
    }

    function addMember(user: User) {
        setMembers((prev) => [...prev, user]);
        setSearchResults([]);
        setSearchQuery("");
    }

    async function onSubmit(data: FormValues) {
        try {
            await api.post("/api/groups", { ...data, memberIds: members.map((m) => m.id) });
            toast({ variant: "success", title: "Group created!" });
            reset();
            setMembers([]);
            setOpen(false);
            onCreated();
        } catch (e: unknown) {
            toast({ variant: "destructive", title: (e as Error).message });
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="brand" className="gap-2">
                    <Plus className="h-4 w-4" /> New Group
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Create Group</DialogTitle>
                    <DialogDescription>
                        Start tracking shared expenses with a group.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                    <div className="space-y-1">
                        <Label>Group name *</Label>
                        <Input placeholder="Goa Trip, Flat expenses…" {...register("name")} />
                        {errors.name && (
                            <p className="text-xs text-destructive">{errors.name.message}</p>
                        )}
                    </div>
                    <div className="space-y-1">
                        <Label>Category</Label>
                        <Select
                            defaultValue="OTHER"
                            onValueChange={(v) => setValue("category", v as FormValues["category"])}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="HOME">🏠 Home</SelectItem>
                                <SelectItem value="TRIP">✈️ Trip</SelectItem>
                                <SelectItem value="COUPLE">💑 Couple</SelectItem>
                                <SelectItem value="WORK">💼 Work</SelectItem>
                                <SelectItem value="OTHER">👥 Other</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1">
                        <Label>Description (optional)</Label>
                        <Input placeholder="What's this group for?" {...register("description")} />
                    </div>
                    <div className="space-y-2">
                        <Label>Add members</Label>
                        <div className="relative">
                            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                className="pl-9"
                                placeholder="Search by name or email…"
                                value={searchQuery}
                                onChange={(e) => searchUsers(e.target.value)}
                            />
                        </div>
                        {searchResults.length > 0 && (
                            <div className="rounded-md border bg-popover shadow-md">
                                {searchResults.map((u) => (
                                    <button
                                        key={u.id}
                                        type="button"
                                        className="flex w-full items-center gap-3 px-3 py-2 hover:bg-accent"
                                        onClick={() => addMember(u)}
                                    >
                                        <Avatar className="h-7 w-7">
                                            <AvatarFallback className="text-xs">
                                                {getInitials(u.name)}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div className="text-left">
                                            <p className="text-sm font-medium">{u.name}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {u.email}
                                            </p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                        {members.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                                {members.map((m) => (
                                    <div
                                        key={m.id}
                                        className="flex items-center gap-1 rounded-full bg-brand-50 px-3 py-1 text-xs text-brand-700"
                                    >
                                        {m.name}
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setMembers((prev) =>
                                                    prev.filter((x) => x.id !== m.id),
                                                )
                                            }
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" variant="brand" disabled={isSubmitting}>
                            {isSubmitting ? "Creating…" : "Create Group"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

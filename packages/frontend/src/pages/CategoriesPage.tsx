import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2, Plus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import type { CustomCategory } from "@/types";

// ── Emoji picker data ──────────────────────────────────────────────────────
const EMOJI_GROUPS = [
    {
        label: "Food & Drink",
        emojis: ["🍔", "🍕", "🍣", "🍜", "🥗", "🍱", "☕", "🍺", "🍦", "🛒", "🥘", "🍝"],
    },
    {
        label: "Transport",
        emojis: ["🚗", "✈️", "🚌", "🚂", "🛵", "🚲", "🛳️", "🚁", "🚕", "⛽", "🅿️", "🛫"],
    },
    {
        label: "Home & Travel",
        emojis: ["🏠", "🏨", "🏕️", "🛋️", "🏖️", "🏔️", "🗺️", "🔑", "🏡", "⛺", "🗼", "🌍"],
    },
    {
        label: "Entertainment",
        emojis: ["🎬", "🎵", "🎮", "🎭", "🏋️", "⚽", "🎪", "🎡", "🎲", "🎸", "🎟️", "🎯"],
    },
    {
        label: "Shopping",
        emojis: ["🛍️", "👗", "👟", "💄", "💍", "🎁", "🧴", "👔", "🕶️", "👜", "🧢", "💅"],
    },
    {
        label: "Bills",
        emojis: ["💡", "💧", "🔌", "📱", "💻", "📺", "🔧", "🧾", "📡", "🖨️", "☎️", "🔒"],
    },
    {
        label: "Health",
        emojis: ["💊", "🏥", "🧬", "🩺", "🧘", "🚑", "🩻", "🥼", "🩹", "🧪", "🏃", "🧠"],
    },
    {
        label: "Work & Study",
        emojis: ["💼", "📚", "🎓", "🏢", "📊", "🖥️", "✏️", "📋", "🗂️", "🤝", "📎", "🔬"],
    },
    {
        label: "Other",
        emojis: ["📌", "💰", "🎉", "🌟", "❤️", "🔥", "💡", "🎀", "🌈", "🪴", "🎂", "🐾"],
    },
];

const COLORS = [
    "#6366f1",
    "#8b5cf6",
    "#ec4899",
    "#ef4444",
    "#f97316",
    "#eab308",
    "#22c55e",
    "#06b6d4",
    "#3b82f6",
    "#64748b",
];

// ── Emoji Picker ───────────────────────────────────────────────────────────
function EmojiPicker({ value, onChange }: { value: string; onChange: (e: string) => void }) {
    return (
        <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
            {EMOJI_GROUPS.map((g) => (
                <div key={g.label}>
                    <p className="text-xs font-medium text-muted-foreground mb-1">{g.label}</p>
                    <div className="flex flex-wrap gap-1">
                        {g.emojis.map((e) => (
                            <button
                                key={e}
                                type="button"
                                onClick={() => onChange(e)}
                                className={`text-lg p-1 rounded hover:bg-muted transition-colors ${value === e ? "bg-brand-100 ring-2 ring-brand-400" : ""}`}
                            >
                                {e}
                            </button>
                        ))}
                    </div>
                </div>
            ))}
            <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Custom emoji</p>
                <Input
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder="Paste any emoji…"
                    className="w-32 text-lg text-center"
                    maxLength={8}
                />
            </div>
        </div>
    );
}

// ── Color Picker ───────────────────────────────────────────────────────────
function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
    return (
        <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => (
                <button
                    key={c}
                    type="button"
                    onClick={() => onChange(c)}
                    className={`h-7 w-7 rounded-full transition-transform hover:scale-110 ${value === c ? "ring-2 ring-offset-2 ring-foreground" : ""}`}
                    style={{ background: c }}
                    title={c}
                />
            ))}
            <input
                type="color"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="h-7 w-7 rounded-full cursor-pointer border-0 p-0"
                title="Custom color"
            />
        </div>
    );
}

// ── Category Form Dialog ───────────────────────────────────────────────────
function CategoryDialog({
    mode,
    initial,
    onDone,
    trigger,
}: {
    mode: "create" | "edit";
    initial?: CustomCategory;
    onDone: () => void;
    trigger: React.ReactNode;
}) {
    const [open, setOpen] = useState(false);
    const [name, setName] = useState(initial?.name ?? "");
    const [icon, setIcon] = useState(initial?.icon ?? "📌");
    const [color, setColor] = useState(initial?.color ?? "#6366f1");
    const [saving, setSaving] = useState(false);

    async function handleSave() {
        if (!name.trim()) {
            toast({ variant: "destructive", title: "Name is required" });
            return;
        }
        setSaving(true);
        try {
            if (mode === "create") {
                await api.post("/api/categories", { name: name.trim(), icon, color });
                toast({ variant: "success", title: "Category created!" });
            } else {
                await api.patch(`/api/categories/${initial!.id}`, {
                    name: name.trim(),
                    icon,
                    color,
                });
                toast({ variant: "success", title: "Category updated!" });
            }
            setOpen(false);
            onDone();
        } catch (e: unknown) {
            toast({ variant: "destructive", title: (e as Error).message });
        } finally {
            setSaving(false);
        }
    }

    function handleOpen(v: boolean) {
        if (v) {
            setName(initial?.name ?? "");
            setIcon(initial?.icon ?? "📌");
            setColor(initial?.color ?? "#6366f1");
        }
        setOpen(v);
    }

    return (
        <Dialog open={open} onOpenChange={handleOpen}>
            <DialogTrigger asChild>{trigger}</DialogTrigger>
            <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>
                        {mode === "create" ? "New Category" : "Edit Category"}
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    {/* Preview */}
                    <div className="flex items-center gap-3 p-3 rounded-lg border">
                        <span className="text-3xl">{icon}</span>
                        <div>
                            <p className="font-medium">{name || "Category name"}</p>
                            <div
                                className="h-2 w-16 rounded-full mt-1"
                                style={{ background: color }}
                            />
                        </div>
                    </div>

                    <div className="space-y-1">
                        <Label>Name *</Label>
                        <Input
                            placeholder="e.g. Coffee, Gym, Pet care…"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            maxLength={40}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>Icon</Label>
                        <EmojiPicker value={icon} onChange={setIcon} />
                    </div>

                    <div className="space-y-2">
                        <Label>Color</Label>
                        <ColorPicker value={color} onChange={setColor} />
                    </div>
                </div>

                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                        Cancel
                    </Button>
                    <Button type="button" variant="brand" onClick={handleSave} disabled={saving}>
                        {saving ? "Saving…" : mode === "create" ? "Create" : "Save"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ── Built-in categories preview ────────────────────────────────────────────
const BUILT_IN = [
    { icon: "📦", name: "General" },
    { icon: "🍔", name: "Food" },
    { icon: "🚗", name: "Transport" },
    { icon: "🏨", name: "Accommodation" },
    { icon: "🎬", name: "Entertainment" },
    { icon: "🛍️", name: "Shopping" },
    { icon: "💡", name: "Utilities" },
    { icon: "💊", name: "Healthcare" },
    { icon: "📌", name: "Other" },
];

// ── Page ───────────────────────────────────────────────────────────────────
export function CategoriesPage() {
    const qc = useQueryClient();

    const { data: categories = [], isLoading } = useQuery<CustomCategory[]>({
        queryKey: ["categories"],
        queryFn: () => api.get("/api/categories"),
    });

    const refresh = () => qc.invalidateQueries({ queryKey: ["categories"] });

    async function deleteCategory(id: string) {
        if (!confirm("Delete this category? Expenses using it will fall back to 'Other'.")) return;
        try {
            await api.delete(`/api/categories/${id}`);
            toast({ title: "Category deleted" });
            refresh();
        } catch {
            toast({ variant: "destructive", title: "Failed to delete category" });
        }
    }

    return (
        <div className="p-6 max-w-2xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Categories</h1>
                    <p className="text-muted-foreground">
                        Organise expenses with custom categories and icons
                    </p>
                </div>
                <CategoryDialog
                    mode="create"
                    onDone={refresh}
                    trigger={
                        <Button variant="brand" className="gap-2">
                            <Plus className="h-4 w-4" /> New Category
                        </Button>
                    }
                />
            </div>

            {/* Built-in */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-sm text-muted-foreground font-medium uppercase tracking-wide">
                        Built-in
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                        {BUILT_IN.map((c) => (
                            <div
                                key={c.name}
                                className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm"
                            >
                                <span className="text-xl">{c.icon}</span>
                                <span className="truncate">{c.name}</span>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>

            {/* Custom */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-sm text-muted-foreground font-medium uppercase tracking-wide">
                        Custom ({categories.length})
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {isLoading && (
                        <div className="space-y-2">
                            {[1, 2, 3].map((i) => (
                                <div key={i} className="h-12 rounded-lg bg-muted animate-pulse" />
                            ))}
                        </div>
                    )}

                    {!isLoading && categories.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-8">
                            No custom categories yet. Create one to start organising your expenses!
                        </p>
                    )}

                    <div className="space-y-2">
                        {categories.map((cat) => (
                            <div
                                key={cat.id}
                                className="flex items-center gap-3 rounded-lg border px-3 py-2"
                            >
                                <span
                                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xl"
                                    style={{ background: cat.color + "22", color: cat.color }}
                                >
                                    {cat.icon}
                                </span>
                                <div className="flex-1 min-w-0">
                                    <p className="font-medium truncate">{cat.name}</p>
                                </div>
                                <div className="flex gap-1 shrink-0">
                                    <CategoryDialog
                                        mode="edit"
                                        initial={cat}
                                        onDone={refresh}
                                        trigger={
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-muted-foreground hover:text-brand-600"
                                            >
                                                <Pencil className="h-3.5 w-3.5" />
                                            </Button>
                                        }
                                    />
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                        onClick={() => deleteCategory(cat.id)}
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

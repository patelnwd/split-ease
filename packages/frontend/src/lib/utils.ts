import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, currency = "INR"): string {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        minimumFractionDigits: 2,
    }).format(amount);
}

export function formatDate(date: string | Date): string {
    return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
    }).format(new Date(date));
}

export function getInitials(name: string): string {
    return name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);
}

export function categoryIcon(category: string): string {
    const icons: Record<string, string> = {
        FOOD: "🍔",
        TRANSPORT: "🚗",
        ACCOMMODATION: "🏨",
        ENTERTAINMENT: "🎬",
        SHOPPING: "🛍️",
        UTILITIES: "💡",
        HEALTHCARE: "💊",
        GENERAL: "📦",
        OTHER: "📌",
    };
    return icons[category] ?? "📌";
}

export function groupCategoryIcon(category: string): string {
    const icons: Record<string, string> = {
        HOME: "🏠",
        TRIP: "✈️",
        COUPLE: "💑",
        WORK: "💼",
        OTHER: "👥",
    };
    return icons[category] ?? "👥";
}

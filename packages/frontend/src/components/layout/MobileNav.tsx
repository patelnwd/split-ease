import { NavLink } from "react-router-dom";
import { LayoutDashboard, Users, UserCircle2, Activity, Tag, History, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

const BASE_ITEMS = [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/groups", label: "Groups", icon: Users },
    { to: "/friends", label: "Friends", icon: UserCircle2 },
    { to: "/activity", label: "Activity", icon: Activity },
    { to: "/categories", label: "Categories", icon: Tag },
    { to: "/history", label: "History", icon: History },
];

export function MobileNav() {
    const { user } = useAuth();

    const navItems = user?.isAdmin
        ? [...BASE_ITEMS, { to: "/admin", label: "Admin", icon: Shield }]
        : BASE_ITEMS;

    return (
        <nav className="fixed bottom-0 left-0 right-0 z-40 border-t bg-card md:hidden">
            <div className="flex overflow-x-auto">
                {navItems.map(({ to, label, icon: Icon }) => (
                    <NavLink
                        key={to}
                        to={to}
                        className={({ isActive }) =>
                            cn(
                                "flex flex-1 flex-col items-center gap-1 py-3 text-xs font-medium transition-colors shrink-0 min-w-[56px]",
                                isActive ? "text-brand-600" : "text-muted-foreground",
                            )
                        }
                    >
                        <Icon className="h-5 w-5" />
                        {label}
                    </NavLink>
                ))}
            </div>
        </nav>
    );
}

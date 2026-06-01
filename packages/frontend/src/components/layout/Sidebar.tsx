import { NavLink } from "react-router-dom";
import {
    LayoutDashboard,
    Users,
    UserCircle2,
    Activity,
    History,
    Tag,
    Shield,
    LogOut,
    Settings,
    Receipt,
} from "lucide-react";
import { cn, getInitials } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";

const navItems = [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/groups", label: "Groups", icon: Users },
    { to: "/friends", label: "Friends", icon: UserCircle2 },
    { to: "/activity", label: "Activity", icon: Activity },
    { to: "/categories", label: "Categories", icon: Tag },
    { to: "/history", label: "History", icon: History },
];

export function Sidebar() {
    const { user, logout } = useAuth();

    return (
        <aside className="flex h-screen w-64 flex-col border-r bg-card">
            <div className="flex h-16 items-center gap-2 border-b px-6">
                <Receipt className="h-6 w-6 text-brand-600" />
                <span className="text-xl font-bold text-brand-600">SplitEase</span>
            </div>

            <nav className="flex-1 space-y-1 p-4">
                {navItems.map(({ to, label, icon: Icon }) => (
                    <NavLink
                        key={to}
                        to={to}
                        className={({ isActive }) =>
                            cn(
                                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                                isActive
                                    ? "bg-brand-50 text-brand-700"
                                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                            )
                        }
                    >
                        <Icon className="h-4 w-4" />
                        {label}
                    </NavLink>
                ))}
                {user?.isAdmin && (
                    <NavLink
                        to="/admin"
                        className={({ isActive }) =>
                            cn(
                                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                                isActive
                                    ? "bg-brand-50 text-brand-700"
                                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                            )
                        }
                    >
                        <Shield className="h-4 w-4" />
                        Admin
                    </NavLink>
                )}
            </nav>

            <div className="border-t p-4">
                <div className="flex items-center gap-3 mb-3">
                    <Avatar className="h-8 w-8">
                        <AvatarImage src={user?.image ?? ""} />
                        <AvatarFallback className="bg-brand-100 text-brand-700 text-xs">
                            {getInitials(user?.name ?? "U")}
                        </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 overflow-hidden">
                        <p className="truncate text-sm font-medium">{user?.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <NavLink to="/profile" className="flex-1">
                        <Button variant="ghost" size="sm" className="w-full justify-start gap-2">
                            <Settings className="h-4 w-4" /> Profile
                        </Button>
                    </NavLink>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground"
                        onClick={logout}
                    >
                        <LogOut className="h-4 w-4" />
                    </Button>
                </div>
            </div>
        </aside>
    );
}

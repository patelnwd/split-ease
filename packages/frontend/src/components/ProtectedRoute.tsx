import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

function Spinner() {
    return (
        <div className="flex h-screen items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
        </div>
    );
}

export function ProtectedRoute() {
    const { user, isLoading } = useAuth();
    if (isLoading) return <Spinner />;
    return user ? <Outlet /> : <Navigate to="/login" replace />;
}

export function AdminRoute() {
    const { user, isLoading } = useAuth();
    if (isLoading) return <Spinner />;
    if (!user) return <Navigate to="/login" replace />;
    if (!user.isAdmin) return <Navigate to="/dashboard" replace />;
    return <Outlet />;
}

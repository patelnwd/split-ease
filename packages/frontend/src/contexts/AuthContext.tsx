import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import type { AuthUser } from "@/types";

type AuthContextType = {
    user: AuthUser | null;
    isLoading: boolean;
    login: (email: string, password: string) => Promise<void>;
    register: (name: string, email: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
    refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<AuthUser | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const navigate = useNavigate();

    async function fetchMe() {
        try {
            const me = await api.get<AuthUser>("/api/auth/me");
            setUser(me);
        } catch {
            setUser(null);
        } finally {
            setIsLoading(false);
        }
    }

    useEffect(() => {
        fetchMe();
    }, []);

    async function login(email: string, password: string) {
        const me = await api.post<AuthUser>("/api/auth/login", { email, password });
        setUser(me);
        navigate("/dashboard");
    }

    async function register(name: string, email: string, password: string) {
        const me = await api.post<AuthUser>("/api/auth/register", { name, email, password });
        setUser(me);
        navigate("/dashboard");
    }

    async function logout() {
        await api.post("/api/auth/logout");
        setUser(null);
        navigate("/login");
    }

    return (
        <AuthContext.Provider
            value={{ user, isLoading, login, register, logout, refresh: fetchMe }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
    return ctx;
}

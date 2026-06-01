import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { MobileNav } from "./MobileNav";
import { VerificationBanner } from "@/components/VerificationBanner";

export function DashboardLayout() {
    return (
        <div className="flex h-screen overflow-hidden">
            <div className="hidden md:flex">
                <Sidebar />
            </div>
            <div className="flex flex-1 flex-col overflow-hidden">
                <VerificationBanner />
                <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
                    <Outlet />
                </main>
            </div>
            <MobileNav />
        </div>
    );
}

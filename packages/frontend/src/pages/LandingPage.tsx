import { Link } from "react-router-dom";
import { Receipt, Users, TrendingDown, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";

export function LandingPage() {
    return (
        <div className="min-h-screen bg-gradient-to-br from-brand-50 via-white to-green-50">
            <header className="flex items-center justify-between px-6 py-4 max-w-6xl mx-auto">
                <div className="flex items-center gap-2">
                    <Receipt className="h-7 w-7 text-brand-600" />
                    <span className="text-xl font-bold text-brand-700">SplitEase</span>
                </div>
                <div className="flex gap-3">
                    <Button variant="ghost" asChild>
                        <Link to="/login">Sign in</Link>
                    </Button>
                    <Button variant="brand" asChild>
                        <Link to="/register">Get started free</Link>
                    </Button>
                </div>
            </header>

            <main className="max-w-4xl mx-auto px-6 py-20 text-center">
                <div className="inline-flex items-center gap-2 rounded-full bg-brand-100 px-4 py-1.5 text-sm text-brand-700 font-medium mb-6">
                    ✨ 100% Open Source · Free Forever
                </div>
                <h1 className="text-5xl font-bold tracking-tight text-gray-900 mb-6">
                    Split expenses,
                    <br />
                    <span className="text-brand-600">not friendships</span>
                </h1>
                <p className="text-lg text-muted-foreground mb-10 max-w-xl mx-auto">
                    Track who paid what, split bills in seconds, and settle up effortlessly. The
                    open-source alternative to Splitwise.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                    <Button variant="brand" size="lg" asChild>
                        <Link to="/register">Start splitting for free →</Link>
                    </Button>
                    <Button variant="outline" size="lg" asChild>
                        <Link to="/login">Sign in</Link>
                    </Button>
                </div>

                <div className="mt-20 grid grid-cols-1 sm:grid-cols-3 gap-8">
                    {[
                        {
                            icon: Users,
                            title: "Groups & Friends",
                            desc: "Create groups for trips, homes, or any shared expenses.",
                        },
                        {
                            icon: Receipt,
                            title: "Smart Splitting",
                            desc: "Split equally, by exact amounts, percentages, or custom shares.",
                        },
                        {
                            icon: TrendingDown,
                            title: "Simplified Debts",
                            desc: "See net balances at a glance. Minimize transactions automatically.",
                        },
                    ].map(({ icon: Icon, title, desc }) => (
                        <div key={title} className="rounded-xl border bg-card p-6 text-left">
                            <Icon className="h-8 w-8 text-brand-600 mb-3" />
                            <h3 className="font-semibold text-lg mb-2">{title}</h3>
                            <p className="text-sm text-muted-foreground">{desc}</p>
                        </div>
                    ))}
                </div>

                <div className="mt-16 rounded-2xl bg-brand-600 px-8 py-10 text-white">
                    <Shield className="h-8 w-8 mx-auto mb-4 opacity-80" />
                    <h2 className="text-2xl font-bold mb-2">Self-hostable & Open Source</h2>
                    <p className="opacity-90 mb-6">
                        React + Fastify + PostgreSQL. Deploy anywhere for free.
                    </p>
                </div>
            </main>

            <footer className="text-center py-8 text-sm text-muted-foreground border-t">
                SplitEase · Open Source · MIT License
            </footer>
        </div>
    );
}

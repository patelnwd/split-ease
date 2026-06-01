import { FastifyInstance, FastifyRequest } from "fastify";
import { eq, or } from "drizzle-orm";
import { db } from "../db/index.js";
import { expenses, expenseParticipants, settlements } from "../db/schema.js";
import { calculateUserBalances } from "../lib/balance.js";

export default async function balanceRoutes(server: FastifyInstance) {
    server.get("/", { preHandler: [server.authenticate] }, async (req: FastifyRequest) => {
        const userId = req.user.id;

        const participantExpenseIds = db
            .select({ expenseId: expenseParticipants.expenseId })
            .from(expenseParticipants)
            .where(eq(expenseParticipants.userId, userId));

        const [allExpenses, allSettlements] = await Promise.all([
            db.query.expenses.findMany({
                where: (e, { or, eq, inArray }) =>
                    or(eq(e.paidById, userId), inArray(e.id, participantExpenseIds)),
                with: { participants: true, paidBy: true },
            }),
            db.query.settlements.findMany({
                where: (s, { or, eq }) => or(eq(s.fromUserId, userId), eq(s.toUserId, userId)),
                with: { fromUser: true, toUser: true },
            }),
        ]);

        const balances = calculateUserBalances(allExpenses, allSettlements, userId);
        const totalOwed = balances.filter((b) => b.amount > 0).reduce((s, b) => s + b.amount, 0);
        const totalOwing = balances
            .filter((b) => b.amount < 0)
            .reduce((s, b) => s + Math.abs(b.amount), 0);

        return {
            balances,
            totalOwed: Math.round(totalOwed * 100) / 100,
            totalOwing: Math.round(totalOwing * 100) / 100,
            netBalance: Math.round((totalOwed - totalOwing) * 100) / 100,
        };
    });
}

import type { User, Expense, ExpenseParticipant, Settlement } from "../db/schema.js";

type ExpenseWithDetails = Expense & {
    participants: ExpenseParticipant[];
    paidBy: User;
};

type SettlementWithUsers = Settlement & {
    fromUser: User;
    toUser: User;
};

export type Balance = {
    userId: string;
    name: string;
    email: string;
    image: string | null;
    amount: number; // positive = they owe you, negative = you owe them
};

export type SimplifiedDebt = {
    fromUserId: string;
    fromUserName: string;
    toUserId: string;
    toUserName: string;
    amount: number;
};

export function calculateUserBalances(
    expenses: ExpenseWithDetails[],
    settlements: SettlementWithUsers[],
    currentUserId: string,
): Balance[] {
    const netMap = new Map<string, { user: User; amount: number }>();

    for (const expense of expenses) {
        const { paidById, paidBy, participants } = expense;
        for (const participant of participants) {
            if (participant.userId === paidById) continue;

            if (paidById === currentUserId) {
                const entry = netMap.get(participant.userId) ?? { user: paidBy, amount: 0 };
                entry.amount += participant.amount;
                netMap.set(participant.userId, entry);
            } else if (participant.userId === currentUserId) {
                const entry = netMap.get(paidById) ?? { user: paidBy, amount: 0 };
                entry.amount -= participant.amount;
                netMap.set(paidById, entry);
            }
        }
    }

    for (const s of settlements) {
        if (s.fromUserId === currentUserId) {
            const entry = netMap.get(s.toUserId) ?? { user: s.toUser, amount: 0 };
            entry.amount += s.amount;
            netMap.set(s.toUserId, entry);
        } else if (s.toUserId === currentUserId) {
            const entry = netMap.get(s.fromUserId) ?? { user: s.fromUser, amount: 0 };
            entry.amount -= s.amount;
            netMap.set(s.fromUserId, entry);
        }
    }

    return Array.from(netMap.entries())
        .filter(([, v]) => Math.abs(v.amount) > 0.001)
        .map(([userId, { user, amount }]) => ({
            userId,
            name: user.name,
            email: user.email,
            image: user.image,
            amount: Math.round(amount * 100) / 100,
        }));
}

export function simplifyDebts(
    expenses: ExpenseWithDetails[],
    settlements: SettlementWithUsers[],
    members: User[],
): SimplifiedDebt[] {
    const netMap = new Map<string, number>(members.map((m) => [m.id, 0]));

    for (const expense of expenses) {
        for (const p of expense.participants) {
            if (p.userId === expense.paidById) continue;
            netMap.set(expense.paidById, (netMap.get(expense.paidById) ?? 0) + p.amount);
            netMap.set(p.userId, (netMap.get(p.userId) ?? 0) - p.amount);
        }
    }

    for (const s of settlements) {
        netMap.set(s.toUserId, (netMap.get(s.toUserId) ?? 0) - s.amount);
        netMap.set(s.fromUserId, (netMap.get(s.fromUserId) ?? 0) + s.amount);
    }

    const creditors = members
        .filter((m) => (netMap.get(m.id) ?? 0) > 0.001)
        .map((m) => ({ user: m, amount: netMap.get(m.id)! }));

    const debtors = members
        .filter((m) => (netMap.get(m.id) ?? 0) < -0.001)
        .map((m) => ({ user: m, amount: -netMap.get(m.id)! }));

    const result: SimplifiedDebt[] = [];
    let ci = 0,
        di = 0;

    while (ci < creditors.length && di < debtors.length) {
        const credit = creditors[ci];
        const debt = debtors[di];
        const amount = Math.min(credit.amount, debt.amount);

        result.push({
            fromUserId: debt.user.id,
            fromUserName: debt.user.name,
            toUserId: credit.user.id,
            toUserName: credit.user.name,
            amount: Math.round(amount * 100) / 100,
        });

        credit.amount -= amount;
        debt.amount -= amount;
        if (credit.amount < 0.001) ci++;
        if (debt.amount < 0.001) di++;
    }

    return result;
}

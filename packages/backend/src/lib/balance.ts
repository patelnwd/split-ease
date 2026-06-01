import type { User, Expense, ExpenseParticipant, Settlement } from "../db/schema.js";

type UserInfo = Pick<User, "id" | "name" | "email" | "image">;

type ExpenseParticipantWithUser = ExpenseParticipant & { user: UserInfo };

type ExpenseWithDetails = Expense & {
    participants: ExpenseParticipantWithUser[];
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
    const netMap = new Map<string, { user: UserInfo; amount: number }>();

    for (const expense of expenses) {
        const { paidById, paidBy, participants } = expense;
        for (const participant of participants) {
            if (participant.userId === paidById) continue;

            if (paidById === currentUserId) {
                // Current user paid — participant owes us; store participant's own user info
                const entry = netMap.get(participant.userId) ?? { user: participant.user, amount: 0 };
                entry.amount += participant.amount;
                netMap.set(participant.userId, entry);
            } else if (participant.userId === currentUserId) {
                // Current user owes the payer
                const entry = netMap.get(paidById) ?? { user: paidBy, amount: 0 };
                entry.amount -= participant.amount;
                netMap.set(paidById, entry);
            }
        }
    }

    for (const s of settlements) {
        if (s.fromUserId === currentUserId) {
            // We paid them — reduces what we owe (increases their entry toward positive)
            const entry = netMap.get(s.toUserId) ?? { user: s.toUser, amount: 0 };
            entry.amount += s.amount;
            netMap.set(s.toUserId, entry);
        } else if (s.toUserId === currentUserId) {
            // They paid us — reduces what they owe
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

type Ledger = { netMap: Map<string, number>; userInfo: Map<string, UserInfo> };

function buildLedger(expenses: ExpenseWithDetails[], settlements: SettlementWithUsers[]): Ledger {
    const netMap = new Map<string, number>();
    const userInfo = new Map<string, UserInfo>();

    for (const expense of expenses) {
        userInfo.set(expense.paidById, expense.paidBy);
        for (const p of expense.participants) {
            userInfo.set(p.userId, p.user);
            if (p.userId === expense.paidById) continue;
            netMap.set(expense.paidById, (netMap.get(expense.paidById) ?? 0) + p.amount);
            netMap.set(p.userId, (netMap.get(p.userId) ?? 0) - p.amount);
        }
    }

    for (const s of settlements) {
        userInfo.set(s.toUserId, s.toUser);
        userInfo.set(s.fromUserId, s.fromUser);
        netMap.set(s.toUserId, (netMap.get(s.toUserId) ?? 0) - s.amount);
        netMap.set(s.fromUserId, (netMap.get(s.fromUserId) ?? 0) + s.amount);
    }

    return { netMap, userInfo };
}

type Party = { user: UserInfo; amount: number };

function splitIntoParties(netMap: Map<string, number>, userInfo: Map<string, UserInfo>) {
    const creditors: Party[] = [];
    const debtors: Party[] = [];
    for (const [uid, amount] of netMap) {
        const u = userInfo.get(uid);
        if (!u) continue;
        if (amount > 0.001) creditors.push({ user: u, amount });
        else if (amount < -0.001) debtors.push({ user: u, amount: -amount });
    }
    return { creditors, debtors };
}

function greedySettle(creditors: Party[], debtors: Party[]): SimplifiedDebt[] {
    const result: SimplifiedDebt[] = [];
    let ci = 0;
    let di = 0;
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

// Derives all participants from expense/settlement data so that removed members
// with outstanding balances are still included in the result.
export function simplifyDebts(
    expenses: ExpenseWithDetails[],
    settlements: SettlementWithUsers[],
): SimplifiedDebt[] {
    const { netMap, userInfo } = buildLedger(expenses, settlements);
    const { creditors, debtors } = splitIntoParties(netMap, userInfo);
    return greedySettle(creditors, debtors);
}

export type UserSummary = { id: string; name: string; email: string; image: string | null };

export type AuthUser = UserSummary & {
    currency: string;
    emailVerified: boolean;
    isAdmin: boolean;
};

export type AdminUser = {
    id: string;
    name: string;
    email: string;
    image: string | null;
    isAdmin: boolean;
    emailVerified: boolean;
    bannedUntil: string | null;
    banReason: string | null;
    isBanned: boolean;
    isPermanentBan: boolean;
    createdAt: string;
};

export type GroupSummary = {
    id: string;
    name: string;
    description: string | null;
    category: string;
    image: string | null;
    createdAt: string;
    memberCount: number;
    myBalance: number;
};

export type GroupMember = UserSummary & { role: string };

export type ExpenseParticipant = {
    userId: string;
    user: UserSummary;
    amount: number;
    percentage: number | null;
    shares: number | null;
    settled: boolean;
};

export type CustomCategory = {
    id: string;
    name: string;
    icon: string;
    color: string;
    createdAt: string;
};

export type ExpenseItem = {
    id: string;
    description: string;
    amount: number;
    currency: string;
    date: string;
    category: string;
    splitType: string;
    notes: string | null;
    groupId: string | null;
    paidBy: UserSummary;
    participants: ExpenseParticipant[];
    customCategoryId: string | null;
    customCategory: CustomCategory | null;
    myShare: number;
    createdAt: string;
};

export type SettlementItem = {
    id: string;
    amount: number;
    currency: string;
    date: string;
    notes: string | null;
    fromUser: UserSummary;
    toUser: UserSummary;
    groupId: string | null;
};

export type SimplifiedDebt = {
    fromUserId: string;
    fromUserName: string;
    toUserId: string;
    toUserName: string;
    amount: number;
};

export type GroupDetail = {
    id: string;
    name: string;
    description: string | null;
    category: string;
    image: string | null;
    createdById: string;
    createdAt: string;
    members: GroupMember[];
    expenses: ExpenseItem[];
    settlements: SettlementItem[];
    simplifiedDebts: SimplifiedDebt[];
};

export type Balance = {
    userId: string;
    name: string;
    email: string;
    image: string | null;
    amount: number;
};

export type DashboardSummary = {
    balances: Balance[];
    totalOwed: number;
    totalOwing: number;
    netBalance: number;
};

export type ActivityItem = {
    id: string;
    type: string;
    description: string;
    createdAt: string;
    user: UserSummary;
    expense: ExpenseItem | null;
    settlement: SettlementItem | null;
};

export type Friend = UserSummary & { balance: number };

export type AccessLogItem = {
    id: string;
    method: string;
    path: string;
    statusCode: number;
    duration: number;
    ip: string | null;
    userAgent: string | null;
    createdAt: string;
};

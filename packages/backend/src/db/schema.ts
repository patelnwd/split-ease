import {
    pgTable,
    pgEnum,
    text,
    timestamp,
    doublePrecision,
    boolean,
    integer,
    uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

const genId = () => crypto.randomUUID();

// ── Enums ──────────────────────────────────────────────────────────────────
export const groupCategoryEnum = pgEnum("group_category", [
    "HOME",
    "TRIP",
    "COUPLE",
    "WORK",
    "OTHER",
]);
export const memberRoleEnum = pgEnum("member_role", ["ADMIN", "MEMBER"]);
export const splitTypeEnum = pgEnum("split_type", ["EQUAL", "EXACT", "PERCENTAGE", "SHARES"]);
export const expenseCategoryEnum = pgEnum("expense_category", [
    "GENERAL",
    "FOOD",
    "TRANSPORT",
    "ACCOMMODATION",
    "ENTERTAINMENT",
    "SHOPPING",
    "UTILITIES",
    "HEALTHCARE",
    "OTHER",
]);
export const activityTypeEnum = pgEnum("activity_type", [
    "EXPENSE_ADDED",
    "EXPENSE_UPDATED",
    "EXPENSE_DELETED",
    "SETTLEMENT_ADDED",
    "SETTLEMENT_DELETED",
    "GROUP_CREATED",
    "GROUP_UPDATED",
    "MEMBER_ADDED",
    "MEMBER_REMOVED",
    "FRIEND_ADDED",
    "FRIEND_REMOVED",
    "PROFILE_UPDATED",
]);

// ── Tables ─────────────────────────────────────────────────────────────────
export const users = pgTable("users", {
    id: text("id").primaryKey().$defaultFn(genId),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    password: text("password"), // null for OAuth-only accounts
    emailVerified: boolean("email_verified").notNull().default(false),
    isAdmin: boolean("is_admin").notNull().default(false),
    bannedUntil: timestamp("banned_until"), // null=active; future date=banned; 2099=permanent
    banReason: text("ban_reason"),
    image: text("image"),
    phone: text("phone"),
    currency: text("currency").notNull().default("INR"),
    oauthProvider: text("oauth_provider"), // "google" | "github" | null
    oauthId: text("oauth_id"), // provider's user ID
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const groups = pgTable("groups", {
    id: text("id").primaryKey().$defaultFn(genId),
    name: text("name").notNull(),
    description: text("description"),
    image: text("image"),
    category: groupCategoryEnum("category").notNull().default("OTHER"),
    createdById: text("created_by_id")
        .notNull()
        .references(() => users.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const groupMembers = pgTable(
    "group_members",
    {
        id: text("id").primaryKey().$defaultFn(genId),
        groupId: text("group_id")
            .notNull()
            .references(() => groups.id, { onDelete: "cascade" }),
        userId: text("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        role: memberRoleEnum("role").notNull().default("MEMBER"),
        joinedAt: timestamp("joined_at").defaultNow().notNull(),
    },
    (t) => ({ groupUserUniq: uniqueIndex("gm_group_user_uniq").on(t.groupId, t.userId) }),
);

export const customCategories = pgTable("custom_categories", {
    id: text("id").primaryKey().$defaultFn(genId),
    name: text("name").notNull(),
    icon: text("icon").notNull().default("📌"),
    color: text("color").notNull().default("#6366f1"),
    userId: text("user_id")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const expenses = pgTable("expenses", {
    id: text("id").primaryKey().$defaultFn(genId),
    description: text("description").notNull(),
    amount: doublePrecision("amount").notNull(),
    currency: text("currency").notNull().default("INR"),
    date: timestamp("date").defaultNow().notNull(),
    category: expenseCategoryEnum("category").notNull().default("GENERAL"),
    customCategoryId: text("custom_category_id").references(() => customCategories.id, {
        onDelete: "set null",
    }),
    splitType: splitTypeEnum("split_type").notNull().default("EQUAL"),
    notes: text("notes"),
    groupId: text("group_id").references(() => groups.id, { onDelete: "set null" }),
    paidById: text("paid_by_id")
        .notNull()
        .references(() => users.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const expenseParticipants = pgTable(
    "expense_participants",
    {
        id: text("id").primaryKey().$defaultFn(genId),
        expenseId: text("expense_id")
            .notNull()
            .references(() => expenses.id, { onDelete: "cascade" }),
        userId: text("user_id")
            .notNull()
            .references(() => users.id),
        amount: doublePrecision("amount").notNull(),
        percentage: doublePrecision("percentage"),
        shares: integer("shares"),
        settled: boolean("settled").notNull().default(false),
    },
    (t) => ({ expenseUserUniq: uniqueIndex("ep_expense_user_uniq").on(t.expenseId, t.userId) }),
);

export const settlements = pgTable("settlements", {
    id: text("id").primaryKey().$defaultFn(genId),
    amount: doublePrecision("amount").notNull(),
    currency: text("currency").notNull().default("INR"),
    date: timestamp("date").defaultNow().notNull(),
    notes: text("notes"),
    fromUserId: text("from_user_id")
        .notNull()
        .references(() => users.id),
    toUserId: text("to_user_id")
        .notNull()
        .references(() => users.id),
    groupId: text("group_id").references(() => groups.id),
});

export const friendships = pgTable(
    "friendships",
    {
        id: text("id").primaryKey().$defaultFn(genId),
        user1Id: text("user1_id")
            .notNull()
            .references(() => users.id),
        user2Id: text("user2_id")
            .notNull()
            .references(() => users.id),
        createdAt: timestamp("created_at").defaultNow().notNull(),
    },
    (t) => ({ user1User2Uniq: uniqueIndex("fs_user1_user2_uniq").on(t.user1Id, t.user2Id) }),
);

export const activities = pgTable("activities", {
    id: text("id").primaryKey().$defaultFn(genId),
    type: activityTypeEnum("type").notNull(),
    description: text("description").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    userId: text("user_id")
        .notNull()
        .references(() => users.id),
    expenseId: text("expense_id").references(() => expenses.id, { onDelete: "set null" }),
    settlementId: text("settlement_id").references(() => settlements.id, { onDelete: "set null" }),
});

export const accessLogs = pgTable("access_logs", {
    id: text("id").primaryKey().$defaultFn(genId),
    method: text("method").notNull(),
    path: text("path").notNull(),
    statusCode: integer("status_code").notNull(),
    duration: integer("duration").notNull(),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── Relations ──────────────────────────────────────────────────────────────
export const usersRelations = relations(users, ({ many }) => ({
    groupMembers: many(groupMembers),
    expensesPaid: many(expenses, { relationName: "expensesPaid" }),
    expenseParticipants: many(expenseParticipants),
    settlementsFrom: many(settlements, { relationName: "settlementsFrom" }),
    settlementsTo: many(settlements, { relationName: "settlementsTo" }),
    friendships1: many(friendships, { relationName: "friendUser1" }),
    friendships2: many(friendships, { relationName: "friendUser2" }),
    activities: many(activities),
    accessLogs: many(accessLogs),
    groupsCreated: many(groups),
    customCategories: many(customCategories),
}));

export const customCategoriesRelations = relations(customCategories, ({ one, many }) => ({
    user: one(users, { fields: [customCategories.userId], references: [users.id] }),
    expenses: many(expenses),
}));

export const groupsRelations = relations(groups, ({ one, many }) => ({
    createdBy: one(users, { fields: [groups.createdById], references: [users.id] }),
    members: many(groupMembers),
    expenses: many(expenses),
    settlements: many(settlements),
}));

export const groupMembersRelations = relations(groupMembers, ({ one }) => ({
    group: one(groups, { fields: [groupMembers.groupId], references: [groups.id] }),
    user: one(users, { fields: [groupMembers.userId], references: [users.id] }),
}));

export const expensesRelations = relations(expenses, ({ one, many }) => ({
    group: one(groups, { fields: [expenses.groupId], references: [groups.id] }),
    paidBy: one(users, {
        fields: [expenses.paidById],
        references: [users.id],
        relationName: "expensesPaid",
    }),
    customCategory: one(customCategories, {
        fields: [expenses.customCategoryId],
        references: [customCategories.id],
    }),
    participants: many(expenseParticipants),
    activities: many(activities),
}));

export const expenseParticipantsRelations = relations(expenseParticipants, ({ one }) => ({
    expense: one(expenses, { fields: [expenseParticipants.expenseId], references: [expenses.id] }),
    user: one(users, { fields: [expenseParticipants.userId], references: [users.id] }),
}));

export const settlementsRelations = relations(settlements, ({ one, many }) => ({
    fromUser: one(users, {
        fields: [settlements.fromUserId],
        references: [users.id],
        relationName: "settlementsFrom",
    }),
    toUser: one(users, {
        fields: [settlements.toUserId],
        references: [users.id],
        relationName: "settlementsTo",
    }),
    group: one(groups, { fields: [settlements.groupId], references: [groups.id] }),
    activities: many(activities),
}));

export const friendshipsRelations = relations(friendships, ({ one }) => ({
    user1: one(users, {
        fields: [friendships.user1Id],
        references: [users.id],
        relationName: "friendUser1",
    }),
    user2: one(users, {
        fields: [friendships.user2Id],
        references: [users.id],
        relationName: "friendUser2",
    }),
}));

export const activitiesRelations = relations(activities, ({ one }) => ({
    user: one(users, { fields: [activities.userId], references: [users.id] }),
    expense: one(expenses, { fields: [activities.expenseId], references: [expenses.id] }),
    settlement: one(settlements, {
        fields: [activities.settlementId],
        references: [settlements.id],
    }),
}));

export const accessLogsRelations = relations(accessLogs, ({ one }) => ({
    user: one(users, { fields: [accessLogs.userId], references: [users.id] }),
}));

// ── Inferred types (used across the app) ──────────────────────────────────
export type User = typeof users.$inferSelect;
export type Group = typeof groups.$inferSelect;
export type GroupMember = typeof groupMembers.$inferSelect;
export type Expense = typeof expenses.$inferSelect;
export type ExpenseParticipant = typeof expenseParticipants.$inferSelect;
export type Settlement = typeof settlements.$inferSelect;
export type Friendship = typeof friendships.$inferSelect;
export type Activity = typeof activities.$inferSelect;
export type AccessLog = typeof accessLogs.$inferSelect;
export type CustomCategory = typeof customCategories.$inferSelect;

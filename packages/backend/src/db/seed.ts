import "dotenv/config";
import bcrypt from "bcryptjs";
import { fileURLToPath } from "url";
import { db } from "./index.js";
import {
    users,
    groups,
    groupMembers,
    expenses,
    expenseParticipants,
    friendships,
    activities,
} from "./schema.js";

export async function seed() {
    const password = await bcrypt.hash("password123", 12);

    const [alice, bob, carol] = await db
        .insert(users)
        .values([
            {
                name: "Alice Johnson",
                email: "alice@example.com",
                password,
                currency: "INR",
                emailVerified: true,
                isAdmin: true,
            },
            {
                name: "Bob Smith",
                email: "bob@example.com",
                password,
                currency: "INR",
                emailVerified: true,
            },
            {
                name: "Carol White",
                email: "carol@example.com",
                password,
                currency: "INR",
                emailVerified: true,
            },
        ])
        .onConflictDoNothing()
        .returning();

    if (!alice || !bob || !carol) return; // already seeded

    const [group] = await db
        .insert(groups)
        .values({
            name: "Weekend Trip to Goa",
            description: "Splitting expenses for our Goa trip",
            category: "TRIP",
            createdById: alice.id,
        })
        .returning();

    await db.insert(groupMembers).values([
        { groupId: group.id, userId: alice.id, role: "ADMIN" },
        { groupId: group.id, userId: bob.id, role: "MEMBER" },
        { groupId: group.id, userId: carol.id, role: "MEMBER" },
    ]);

    const [expense] = await db
        .insert(expenses)
        .values({
            description: "Hotel booking",
            amount: 9000,
            category: "ACCOMMODATION",
            splitType: "EQUAL",
            groupId: group.id,
            paidById: alice.id,
        })
        .returning();

    await db.insert(expenseParticipants).values([
        { expenseId: expense.id, userId: alice.id, amount: 3000 },
        { expenseId: expense.id, userId: bob.id, amount: 3000 },
        { expenseId: expense.id, userId: carol.id, amount: 3000 },
    ]);

    await db
        .insert(friendships)
        .values([
            { user1Id: alice.id, user2Id: bob.id },
            { user1Id: alice.id, user2Id: carol.id },
            { user1Id: bob.id, user2Id: carol.id },
        ])
        .onConflictDoNothing();

    await db.insert(activities).values({
        type: "EXPENSE_ADDED",
        description: `Alice added "Hotel booking" ($9000.00) in "Weekend Trip to Goa"`,
        userId: alice.id,
        expenseId: expense.id,
    });
}

// Allow running directly: tsx src/db/seed.ts
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    seed()
        .then(() => {
            console.log("✓ Seed complete. Login: alice@example.com / password123");
            process.exit(0);
        })
        .catch((err) => {
            console.error(err);
            process.exit(1);
        });
}

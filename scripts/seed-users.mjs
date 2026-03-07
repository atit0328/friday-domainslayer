/**
 * Seed initial users: 1 superadmin + 3 admins
 * Run: node scripts/seed-users.mjs
 */
import dotenv from "dotenv";
dotenv.config();

import bcrypt from "bcryptjs";
import mysql from "mysql2/promise";

const USERS = [
  { email: "sartids1984@gmail.com", name: "Superadmin", password: "44161216a", role: "superadmin" },
  { email: "kkk1@gmail.com", name: "Admin 1", password: "44161216a", role: "admin" },
  { email: "kkk2@gmail.com", name: "Admin 2", password: "44161216a", role: "admin" },
  { email: "kkk3@gmail.com", name: "Admin 3", password: "44161216a", role: "admin" },
];

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }

  const connection = await mysql.createConnection(dbUrl);

  for (const user of USERS) {
    const passwordHash = await bcrypt.hash(user.password, 12);
    const openId = `local_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

    // Check if email already exists
    const [existing] = await connection.execute(
      "SELECT id, role FROM users WHERE email = ?",
      [user.email]
    );

    if (existing.length > 0) {
      // Update existing user's role and password
      await connection.execute(
        "UPDATE users SET role = ?, passwordHash = ?, name = ? WHERE email = ?",
        [user.role, passwordHash, user.name, user.email]
      );
      console.log(`✓ Updated existing user: ${user.email} → role=${user.role}`);
    } else {
      // Insert new user
      await connection.execute(
        `INSERT INTO users (openId, email, name, passwordHash, loginMethod, role, lastSignedIn, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, 'local', ?, NOW(), NOW(), NOW())`,
        [openId, user.email, user.name, passwordHash, user.role]
      );
      console.log(`✓ Created new user: ${user.email} → role=${user.role}`);
    }
  }

  await connection.end();
  console.log("\n✅ All 4 users seeded successfully!");
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});

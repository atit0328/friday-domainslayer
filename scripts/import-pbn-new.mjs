/**
 * Import PBN sites from Google Sheets CSV into the database
 * CSV Columns: ลำดับ, Expire, BANDED, แก้แบน, Sitename, (isBlog flag), URL Backend, USER, PASS,
 *              WordPress AI Automation, Theme, DR, DA, PA, SS, อายุ, หมายเหตุ,
 *              ชื่อ Hosting, Hosting, Mail, Pass, Domain, Mail, Pass, cpanel, User, Pass
 */

import mysql from "mysql2/promise";
import { readFileSync } from "fs";
import { config } from "dotenv";

config();

const CSV_PATH = "/home/ubuntu/Downloads/pbn.csv";
const OWNER_USER_ID = 2; // อาทวย Gaming (admin)

function parseCSV(text) {
  const lines = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      lines.push(current);
      current = "";
    } else if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      lines.push(current);
      current = "";
      // Mark row boundary
      lines.push("__ROW__");
    } else {
      current += ch;
    }
  }
  if (current) lines.push(current);

  // Split into rows
  const rows = [];
  let row = [];
  for (const cell of lines) {
    if (cell === "__ROW__") {
      if (row.length > 0) rows.push(row);
      row = [];
    } else {
      row.push(cell.trim());
    }
  }
  if (row.length > 0) rows.push(row);

  return rows;
}

function parseDate(dateStr) {
  if (!dateStr || dateStr.trim() === "") return null;
  // Format: DD-Mon-YY or D-Mon-YY (e.g., "24-Jan-26", "9-May-26")
  const months = {
    Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
    Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
  };
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  const day = parts[0].padStart(2, "0");
  const month = months[parts[1]] || "01";
  let year = parts[2];
  if (year.length === 2) year = parseInt(year) > 50 ? `19${year}` : `20${year}`;
  return `${year}-${month}-${day}`;
}

async function main() {
  const csvText = readFileSync(CSV_PATH, "utf-8");
  const rows = parseCSV(csvText);

  // Skip header row
  const header = rows[0];
  console.log("Header columns:", header.length, header.slice(0, 10));

  const dataRows = rows.slice(1);
  console.log(`Total data rows: ${dataRows.length}`);

  const conn = await mysql.createConnection(process.env.DATABASE_URL);

  // Track main sites for parent-child relationships
  const mainSiteMap = new Map(); // domain -> inserted id
  let imported = 0;
  let skipped = 0;
  let blogCount = 0;
  let lastMainNumber = null;

  for (const row of dataRows) {
    // Column mapping:
    // 0: ลำดับ, 1: Expire, 2: BANDED, 3: แก้แบน, 4: Sitename, 5: (isBlog TRUE/FALSE),
    // 6: URL Backend, 7: USER, 8: PASS, 9: WP AI Automation, 10: Theme,
    // 11: DR, 12: DA, 13: PA, 14: SS, 15: อายุ, 16: หมายเหตุ,
    // 17: ชื่อ Hosting, 18: Hosting, 19: Mail, 20: Pass, 21: Domain, 22: Mail, 23: Pass,
    // 24: cpanel, 25: User, 26: Pass

    const sitename = (row[4] || "").trim();
    if (!sitename || sitename === "" || sitename === "รีไดเรค vintagegardensweddings" || sitename === "Salepage") {
      // Skip special rows (redirects, sale pages at the bottom)
      if (sitename === "รีไดเรค vintagegardensweddings" || sitename === "Salepage") {
        // These are special sites at the bottom - still import them
      } else {
        skipped++;
        continue;
      }
    }

    // Skip empty rows
    if (!sitename) {
      skipped++;
      continue;
    }

    const rowNumber = row[0] ? parseInt(row[0]) : null;
    const isBlogFlag = (row[5] || "").toUpperCase() === "FALSE"; // FALSE means it's a blog subdomain
    const isMainSite = rowNumber !== null && !isNaN(rowNumber);
    const isBlog = !isMainSite || isBlogFlag;

    if (isMainSite) lastMainNumber = rowNumber;

    const expire = parseDate(row[1] || "");
    const banned = (row[2] || "").trim() || null;
    const wpBackendUrl = (row[6] || "").trim();
    const username = (row[7] || "").trim();
    const password = (row[8] || "").trim();
    const wpAutomationKey = (row[9] || "").trim() || null;
    const theme = (row[10] || "").trim() || null;
    const dr = row[11] ? parseInt(row[11]) || null : null;
    const da = row[12] ? parseInt(row[12]) || null : null;
    const pa = row[13] ? parseInt(row[13]) || null : null;
    const ss = row[14] ? parseInt(row[14]) || null : null;
    const domainAge = (row[15] || "").trim() || null;
    const notes = (row[16] || "").trim() || null;
    const hostingName = (row[17] || "").trim() || null;
    const hostingProvider = (row[18] || "").trim() || null;
    const hostingEmail = (row[19] || "").trim() || null;
    const hostingPass = (row[20] || "").trim() || null;
    const domainRegistrar = (row[21] || "").trim() || null;
    const registrarEmail = (row[22] || "").trim() || null;
    const registrarPass = (row[23] || "").trim() || null;
    const cpanelUrl = (row[24] || "").trim() || null;
    const cpanelUser = (row[25] || "").trim() || null;
    const cpanelPass = (row[26] || "").trim() || null;

    // Build the URL
    let siteUrl = `https://${sitename}`;

    // Skip if no username or password
    if (!username && !password) {
      console.log(`  SKIP (no creds): ${sitename}`);
      skipped++;
      continue;
    }

    // Determine parent site ID for blogs
    let parentSiteId = null;
    if (isBlog && !isMainSite) {
      // Find the parent domain (strip blog. or log. prefix)
      const parentDomain = sitename.replace(/^(blog\.|log\.)/, "");
      parentSiteId = mainSiteMap.get(parentDomain) || null;
    }

    try {
      const [result] = await conn.execute(
        `INSERT INTO pbn_sites (userId, name, url, username, appPassword, pbnStatus, da, dr, pa, spamScore, 
         domainAge, expireDate, theme, hostingProvider, hostingName, cpanelUrl, cpanelUser, cpanelPass,
         domainRegistrar, registrarEmail, registrarPass, hostingEmail, hostingPass, wpAutomationKey,
         isBlog, parentSiteId, banned, notes)
         VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          OWNER_USER_ID, sitename, siteUrl, username, password,
          da, dr, pa, ss, domainAge, expire, theme, hostingProvider, hostingName,
          cpanelUrl, cpanelUser, cpanelPass, domainRegistrar, registrarEmail, registrarPass,
          hostingEmail, hostingPass, wpAutomationKey,
          isBlog && !isMainSite ? 1 : 0, parentSiteId, banned, notes,
        ]
      );

      const insertedId = result.insertId;

      // Track main sites for parent-child mapping
      if (isMainSite) {
        mainSiteMap.set(sitename, insertedId);
      }

      if (isBlog && !isMainSite) {
        blogCount++;
        console.log(`  BLOG: ${sitename} (parent: ${parentSiteId || "unknown"})`);
      } else {
        console.log(`  MAIN #${rowNumber || "?"}: ${sitename} (id=${insertedId})`);
      }

      imported++;
    } catch (err) {
      console.error(`  ERROR importing ${sitename}:`, err.message);
      skipped++;
    }
  }

  // Now update parent IDs for blogs that were inserted before their parent
  console.log("\n--- Updating parent site IDs for blogs ---");
  const [allSites] = await conn.execute("SELECT id, name, isBlog, parentSiteId FROM pbn_sites WHERE isBlog = 1 AND parentSiteId IS NULL");
  for (const site of allSites) {
    const parentDomain = site.name.replace(/^(blog\.|log\.)/, "");
    const [parents] = await conn.execute("SELECT id FROM pbn_sites WHERE name = ? AND isBlog = 0 LIMIT 1", [parentDomain]);
    if (parents.length > 0) {
      await conn.execute("UPDATE pbn_sites SET parentSiteId = ? WHERE id = ?", [parents[0].id, site.id]);
      console.log(`  Updated ${site.name} -> parent ${parentDomain} (id=${parents[0].id})`);
    }
  }

  // Also handle the special entries at the bottom (redirects, sale pages)
  console.log("\n--- Summary ---");
  console.log(`Imported: ${imported} (${imported - blogCount} main + ${blogCount} blogs)`);
  console.log(`Skipped: ${skipped}`);

  const [finalCount] = await conn.execute("SELECT COUNT(*) as cnt FROM pbn_sites");
  console.log(`Total in DB: ${finalCount[0].cnt}`);

  await conn.end();
}

main().catch(console.error);

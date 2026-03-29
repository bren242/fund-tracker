import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getClientKeyFromRequest } from "@/lib/clientKey";
import { fundsPath, logoUploadDir } from "@/lib/clientPaths";

const SUPER_ADMIN_PASSWORD = "super2026";

function isSuperAdmin(req: NextRequest, clientKey: string): boolean {
  const password = req.headers.get("x-admin-password") || "";
  if (password === SUPER_ADMIN_PASSWORD) return true;
  // Also check stored super admin password from client's funds.json
  try {
    const data = JSON.parse(fs.readFileSync(fundsPath(clientKey), "utf-8"));
    if (data.superAdminPassword && password === data.superAdminPassword) return true;
  } catch { /* ignore */ }
  return false;
}

const ALLOWED_TYPES: Record<string, string> = {
  "image/png": ".png",
  "image/svg+xml": ".svg",
};

/**
 * POST — Upload a logo file. Super admin only.
 * Expects multipart form data with:
 *   - file: the image file (PNG or SVG)
 *   - field: "logoLight" or "logoDark"
 * Query: ?client=xxx
 * Returns: { path: "/branding/{clientKey}/logoLight.png" }
 */
export async function POST(req: NextRequest) {
  const clientKey = getClientKeyFromRequest(req.url);

  if (!isSuperAdmin(req, clientKey)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const field = formData.get("field") as string | null;

  if (!file || !field) {
    return NextResponse.json({ error: "Missing file or field" }, { status: 400 });
  }

  if (field !== "logoLight" && field !== "logoDark") {
    return NextResponse.json({ error: "Invalid field" }, { status: 400 });
  }

  const ext = ALLOWED_TYPES[file.type];
  if (!ext) {
    return NextResponse.json({ error: "Only PNG and SVG files are allowed" }, { status: 400 });
  }

  const uploadDir = logoUploadDir(clientKey);

  // Save file as logoLight.png or logoDark.svg etc.
  const filename = `${field}${ext}`;
  const filePath = path.join(uploadDir, filename);

  // Remove any existing logo for this field (different extension)
  for (const existingExt of Object.values(ALLOWED_TYPES)) {
    const existing = path.join(uploadDir, `${field}${existingExt}`);
    if (fs.existsSync(existing)) {
      fs.unlinkSync(existing);
    }
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(filePath, buffer);

  const publicPath = `/branding/${clientKey}/${filename}`;
  return NextResponse.json({ path: publicPath });
}

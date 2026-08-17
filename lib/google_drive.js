import { google } from "googleapis";
import { Readable } from "node:stream";

function privateKey() {
  return String(process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
}

function oauthAuth() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return null;
  const auth = new google.auth.OAuth2(clientId, clientSecret);
  auth.setCredentials({ refresh_token: refreshToken });
  return auth;
}

function serviceAccountAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = privateKey();
  if (!email || !key) return null;
  return new google.auth.JWT({ email, key, scopes: ["https://www.googleapis.com/auth/drive.file"] });
}

function driveClient() {
  const auth = oauthAuth() || serviceAccountAuth();
  if (!auth) throw new Error("Google Drive auth missing: configure OAuth or Service Account credentials");
  return google.drive({ version: "v3", auth });
}

export async function uploadToDrive({ buffer, name, mimeType }) {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!folderId) throw new Error("GOOGLE_DRIVE_FOLDER_ID is required");
  const drive = driveClient();
  const response = await drive.files.create({ requestBody: { name, parents: [folderId] }, media: { mimeType: mimeType || "application/octet-stream", body: Readable.from(buffer) }, fields: "id,name,mimeType,webViewLink", supportsAllDrives: true });
  return response.data;
}

export async function downloadDriveFile(fileId) {
  const drive = driveClient();
  const meta = await drive.files.get({ fileId, fields: "id,name,mimeType", supportsAllDrives: true });
  const response = await drive.files.get({ fileId: meta.data.id, alt: "media", supportsAllDrives: true }, { responseType: "arraybuffer" });
  return { buffer: Buffer.from(response.data), name: meta.data.name, mimeType: meta.data.mimeType };
}

export async function getDriveThumbnail(fileId) {
  const drive = driveClient();
  const meta = await drive.files.get({ fileId, fields: "thumbnailLink", supportsAllDrives: true });
  if (!meta.data.thumbnailLink) throw new Error("Drive thumbnail unavailable");
  const url = meta.data.thumbnailLink.replace(/=s\d+$/, "=s2000");
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Drive thumbnail failed: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

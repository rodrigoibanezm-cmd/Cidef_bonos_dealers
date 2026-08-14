import { google } from "googleapis";
import { Readable } from "node:stream";

function privateKey() {
  return String(process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
}

function driveClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = privateKey();
  if (!email) throw new Error("GOOGLE_SERVICE_ACCOUNT_EMAIL is required");
  if (!key) throw new Error("GOOGLE_PRIVATE_KEY is required");

  const auth = new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/drive.file"],
  });

  return google.drive({ version: "v3", auth });
}

export async function uploadToDrive({ buffer, name, mimeType }) {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!folderId) throw new Error("GOOGLE_DRIVE_FOLDER_ID is required");

  const drive = driveClient();
  const response = await drive.files.create({
    requestBody: {
      name,
      parents: [folderId],
    },
    media: {
      mimeType: mimeType || "application/octet-stream",
      body: Readable.from(buffer),
    },
    fields: "id,name,mimeType,webViewLink",
  });

  return response.data;
}

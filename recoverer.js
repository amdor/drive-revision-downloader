const fs = require("fs").promises;
const path = require("path");
const process = require("process");
const { authenticate } = require("@google-cloud/local-auth");
const { google } = require("googleapis");

// If modifying these scopes, delete token.json.
const SCOPES = ["https://www.googleapis.com/auth/drive"];
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = path.join(process.cwd(), "token.json");
const CREDENTIALS_PATH = path.join(process.cwd(), "credentials.json");

const PICTURES_FOLDER = "1X9YxmaM1eFim921bN_8BbJbheQP99eMu";

/**
 * Reads previously authorized credentials from the save file.
 *
 * @return {Promise<OAuth2Client|null>}
 */
async function loadSavedCredentialsIfExist() {
	try {
		const content = await fs.readFile(TOKEN_PATH);
		const credentials = JSON.parse(content);
		return google.auth.fromJSON(credentials);
	} catch (err) {
		return null;
	}
}

/**
 * Serializes credentials to a file comptible with GoogleAUth.fromJSON.
 *
 * @param {OAuth2Client} client
 * @return {Promise<void>}
 */
async function saveCredentials(client) {
	const content = await fs.readFile(CREDENTIALS_PATH);
	const keys = JSON.parse(content);
	const key = keys.installed || keys.web;
	const payload = JSON.stringify({
		type: "authorized_user",
		client_id: key.client_id,
		client_secret: key.client_secret,
		refresh_token: client.credentials.refresh_token,
	});
	await fs.writeFile(TOKEN_PATH, payload);
}

/**
 * Load or request or authorization to call APIs.
 *
 */
async function authorize() {
	let client = await loadSavedCredentialsIfExist();
	if (client) {
		return client;
	}
	client = await authenticate({
		scopes: SCOPES,
		keyfilePath: CREDENTIALS_PATH,
	});
	if (client.credentials) {
		await saveCredentials(client);
	}
	return client;
}

const TARGET_FOLDER = "10anu-USkcZwx9heqUm-IYOkRjNNYsnUh";
let foldersToCheck = [TARGET_FOLDER];
const allFoldersFound = [TARGET_FOLDER];
const allFilesFound = [];
let drive;

async function listFolders(target, nextPageToken) {
	const res = await drive.files.list({
		fields: "nextPageToken, files(id, name)",
		pageSize: 3,
		q: `'${target}' in parents and mimeType = 'application/vnd.google-apps.folder'`,
		...(nextPageToken && { pageToken: nextPageToken }),
	});

	const folders = res.data.files;
	if (folders.length === 0) {
		console.log("No folders found.");
		return;
	}

	console.log("Folders:");
	foldersToCheck.push(
		...folders.map(folder => {
			console.log(`${folder.name}`);
			allFoldersFound.push(folder.id);
			return folder.id;
		})
	);

	if (res.data.nextPageToken) {
		listFolders(target, res.data.nextPageToken);
		return;
	}
	while (foldersToCheck.length !== 0) {
		listFolders(foldersToCheck.shift());
	}
}

async function listFiles(target, nextPageToken) {
	const res = await drive.files.list({
		fields: "nextPageToken, files(id, name)",
		pageSize: 15,
		q: `'${target}' in parents and (mimeType contains 'image/' or mimeType contains 'video/')`,
		...(nextPageToken && { pageToken: nextPageToken }),
	});

	const files = res.data.files;
	if (files.length === 0) {
		console.log("No files found.");
		return;
	}

	console.log("Files:");
	files.forEach(file => {
		console.log(`${file.name}`);
		allFilesFound.push({ id: file.id, name: `${target}/${file.name}` });
	});

	if (res.data.nextPageToken) {
		listFiles(target, res.data.nextPageToken);
		return;
	}
	while (foldersToCheck.length !== 0) {
		listFiles(foldersToCheck.shift());
	}
}

async function getOldestRevision({ id: fileId, name: fileName }, nextPageToken) {
	const res = await drive.revisions.list({
		fileId: fileId,
		pageSize: 10,
		...(nextPageToken && { pageToken: nextPageToken }),
	});
	const revisions = res.data.revisions;
	if (revisions.length === 0) {
		console.log("No revisions found?");
		return;
	}

	console.log(`Revisions for ${fileName}:`);
	revisions.forEach(rev => {
		console.log(`${rev.modifiedTime}`);
	});

	if (res.data.nextPageToken) {
		getOldestRevision(target, res.data.nextPageToken);
		return;
	}

	const oldestRevId = res.data.revisions[res.data.revisions.length - 1].id;
	const binFileResponse = await drive.revisions.get({
		fileId: fileId,
		revisionId: oldestRevId,
	});
	await fs.writeFile(fileName, binFileResponse.data);
}

authorize()
	.then(async authClient => {
		drive = google.drive({ version: "v3", auth: authClient });
		// await listFolders(authClient, foldersToCheck.shift());
		foldersToCheck = []; // allFoldersFound;
		await listFiles("1VoOxjStf8_R8ILuz4snNjLbVlYFIKHh2");
		getOldestRevision(allFilesFound[0]);
		// await listFiles(authClient, foldersToCheck.shift())
	})
	.catch(console.error);

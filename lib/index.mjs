import { basename, join } from "node:path";
import { promises } from "node:fs";
import { settingsNamespace } from "@deepseek-ai/dsh-settings";
import z from "schemastery";
//#region src/index.ts
/**
* dsh-openspec-suite 宿主半。
*
* 挂在 `/openspec/api/*` 下的 OpenSpec 管理 API（仅限 loopback 的信任
* 栅栏）：文件夹扫描、工作区导入、按项目统计提案进度。
*/
/** 插件标识，用于 cordis.yml 的行。 */
const name = "dsh-openspec-suite";
/** 挂载前需要的服务。 */
const inject = [
	"webServer",
	"sessions",
	"workspaceRegistry"
];
/** 信任栅栏：只允许 loopback 浏览器来源。 */
function isTrustedApiRequest(hostHeader) {
	if (hostHeader === void 0) return false;
	const hostname = hostHeader.split(":")[0].toLowerCase();
	return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
}
const MAX_SCAN_DEPTH = 4;
const SKIP_DIRS = /* @__PURE__ */ new Set([
	"node_modules",
	".git",
	"dist",
	"build",
	".venv",
	"venv",
	"__pycache__",
	"target",
	"openspec"
]);
/** 判断 `dir` 是否含有带 `changes/` 子目录的 `openspec/` 目录。 */
async function isOpenspecProject(dir) {
	try {
		return (await promises.stat(join(dir, "openspec", "changes"))).isDirectory();
	} catch {
		return false;
	}
}
/**
* 枚举 `rootDir` 下最多 `maxDepth` 层的候选目录。
* 使用递归 readdir（只返回名字）再对每个候选用 stat() 复核，
* 因此从不信任 Dirent 的类型字段（在 Electron 宿主里
* `entry.isDirectory()` 已被证明不可靠）。
*/
async function listSubdirectories(rootDir, maxDepth, signal) {
	const results = [];
	const queue = [{
		dir: rootDir,
		depth: 0
	}];
	while (queue.length > 0) {
		if (signal?.aborted) break;
		const { dir, depth } = queue.shift();
		if (depth >= maxDepth) continue;
		let names;
		try {
			names = await promises.readdir(dir);
		} catch {
			continue;
		}
		for (const name of names) {
			if (signal?.aborted) break;
			if (SKIP_DIRS.has(name) || name.startsWith(".")) continue;
			const child = join(dir, name);
			let stat;
			try {
				stat = await promises.stat(child);
			} catch {
				continue;
			}
			if (!stat.isDirectory()) continue;
			results.push(child);
			queue.push({
				dir: child,
				depth: depth + 1
			});
		}
	}
	return results;
}
/**
* 扫描 `rootDir`（含其自身）最多 `maxDepth` 层，找出所有包含
* `openspec/changes/` 的目录。
*/
async function scanOpenspecProjects(rootDir, signal, maxDepth = MAX_SCAN_DEPTH) {
	const found = [];
	const rootName = basename(rootDir) || rootDir;
	if (await isOpenspecProject(rootDir)) found.push({
		path: rootDir,
		name: rootName,
		root: true
	});
	for (const child of await listSubdirectories(rootDir, maxDepth, signal)) if (await isOpenspecProject(child)) found.push({
		path: child,
		name: basename(child),
		root: child === rootDir
	});
	return found;
}
/** 读取文件 stat 摘要；文件不可读时返回 undefined。 */
async function statFile(file) {
	try {
		const stat = await promises.stat(file);
		if (!stat.isFile()) return void 0;
		return {
			bytes: stat.size,
			mtime: stat.mtime.toISOString()
		};
	} catch {
		return;
	}
}
/** 解析 tasks.md 的复选框进度。 */
function parseTasks(content) {
	let done = 0;
	let total = 0;
	for (const match of content.matchAll(/^\s*[-*]\s+\[( |x|X)\]/gm)) {
		total += 1;
		if (match[1] !== " ") done += 1;
	}
	return {
		done,
		total
	};
}
/**
* 读取项目自定义 schema（openspec/schemas 下任意子目录的 schema.yaml，
* 取第一个存在的），抽取 artifacts 列表（id + generates glob）。
* 不存在/解析失败返回 []。
*/
async function readSchemaArtifacts(projectDir) {
	let names;
	try {
		names = await promises.readdir(join(projectDir, "openspec", "schemas"));
	} catch {
		return [];
	}
	for (const schemaDirName of names.sort()) {
		let content;
		try {
			content = await promises.readFile(join(projectDir, "openspec", "schemas", schemaDirName, "schema.yaml"), "utf8");
		} catch {
			continue;
		}
		const result = [];
		let inArtifacts = false;
		let pendingId = null;
		for (const rawLine of content.split(/\r?\n/u)) {
			if (/^\S/u.test(rawLine)) inArtifacts = rawLine.trimEnd() === "artifacts:";
			if (!inArtifacts) continue;
			const idMatch = /^\s*-\s+id:\s*(\S+)\s*$/u.exec(rawLine);
			if (idMatch !== null) {
				if (pendingId !== null) result.push({
					id: pendingId,
					generates: ""
				});
				pendingId = idMatch[1];
				continue;
			}
			const genMatch = /^\s*generates:\s*['"]?([^'"\n]+?)['"]?\s*$/u.exec(rawLine);
			if (genMatch !== null && pendingId !== null) {
				result.push({
					id: pendingId,
					generates: genMatch[1].trim()
				});
				pendingId = null;
			}
		}
		if (pendingId !== null) result.push({
			id: pendingId,
			generates: ""
		});
		if (result.length > 0) return result;
	}
	return [];
}
/** 简化 glob → RegExp（支持 ** 与 *，用于匹配 generates 模式）。 */
function globToRegExp(pattern) {
	const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, "\0").replace(/\*/g, "[^/]*").replace(/\u0000/g, ".*");
	return new RegExp(`^${escaped}$`, "u");
}
/** 判断相对路径（change 目录内）是否匹配某个 generates 模式。 */
function matchesGlob(relPath, generates) {
	if (generates === "") return false;
	return globToRegExp(generates).test(relPath);
}
/**
* 递归列举 change 目录下全部产物文件（含子目录如 specs/<cap>/spec.md）。
* 隐藏文件与 node_modules 除外。
*/
async function listChangeFilesRecursively(changeDir, signal) {
	const out = [];
	const walk = async (dir, prefix) => {
		let entries;
		try {
			entries = await promises.readdir(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			if (signal?.aborted) return;
			if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
			const childPath = join(dir, entry.name);
			if (entry.isDirectory()) await walk(childPath, `${prefix}${entry.name}/`);
			else {
				const stat = await statFile(childPath);
				if (stat !== void 0) out.push({
					rel: `${prefix}${entry.name}`,
					path: childPath,
					stat
				});
			}
		}
	};
	await walk(changeDir, "");
	out.sort((a, b) => a.rel.localeCompare(b.rel));
	return out;
}
/** 读取一个 change 目录并汇总为进度摘要。 */
async function readChange(changeDir, changeName, schemaArtifacts, signal) {
	const artifacts = {
		proposal: false,
		design: false,
		specs: false,
		tasks: false
	};
	let tasksProgress = {
		done: 0,
		total: 0
	};
	const listed = await listChangeFilesRecursively(changeDir, signal);
	if (signal?.aborted) return null;
	const kindByRel = /* @__PURE__ */ new Map();
	for (const { rel } of listed) for (const artifact of schemaArtifacts) if (matchesGlob(rel, artifact.generates)) {
		kindByRel.set(rel, artifact.id);
		break;
	}
	const files = listed.map(({ rel, path, stat }) => ({
		kind: kindByRel.get(rel) ?? "file",
		label: rel,
		path,
		...stat
	}));
	for (const { rel, path } of listed) if (rel === "proposal.md") artifacts.proposal = true;
	else if (rel === "design.md" || rel === "design.html") artifacts.design = true;
	else if (rel === "tasks.md") {
		artifacts.tasks = true;
		try {
			tasksProgress = parseTasks(await promises.readFile(path, "utf8"));
		} catch {}
	} else if (rel.startsWith("specs/") && rel.endsWith(".md")) artifacts.specs = true;
	const expected = schemaArtifacts.map((artifact) => ({
		id: artifact.id,
		satisfied: listed.some(({ rel }) => matchesGlob(rel, artifact.generates))
	}));
	return {
		name: changeName,
		artifacts,
		tasks: tasksProgress,
		files,
		expected
	};
}
/** 汇总一个 openspec 项目的所有活跃（未归档）change。 */
async function readProjectChanges(projectDir, signal) {
	const changesDir = join(projectDir, "openspec", "changes");
	let entries;
	try {
		entries = await promises.readdir(changesDir, { withFileTypes: true });
	} catch {
		return [];
	}
	const schemaArtifacts = await readSchemaArtifacts(projectDir);
	const changes = [];
	for (const entry of entries) {
		if (signal?.aborted) break;
		if (!entry.isDirectory() || entry.name === "archive") continue;
		const change = await readChange(join(changesDir, entry.name), entry.name, schemaArtifacts, signal);
		if (change !== null) changes.push(change);
	}
	return changes;
}
const PREFS_NS = settingsNamespace("dsh-openspec-suite");
const PrefsSchema = z.object({
	/** 已导入的项目根目录（绝对路径），按导入顺序。 */
	projects: z.array(z.string()).default([]),
	/** 最近一次扫描的根目录，用于在导入视图中预填。 */
	lastScanRoot: z.string().default("")
});
/** 可预览的文件扩展名（产物常见类型；.html 通过 iframe 原始路由预览）。 */
const PREVIEWABLE_EXTENSIONS = /* @__PURE__ */ new Set([
	".md",
	".html",
	".htm",
	".yaml",
	".yml",
	".json",
	".txt",
	".js",
	".css"
]);
/** 判断路径是否为可预览类型。 */
function isPreviewablePath(filePath) {
	const dot = filePath.lastIndexOf(".");
	if (dot === -1) return false;
	return PREVIEWABLE_EXTENSIONS.has(filePath.slice(dot).toLowerCase());
}
/** 原始路由的 content-type。 */
function contentTypeFor(filePath) {
	const dot = filePath.lastIndexOf(".");
	const ext = dot === -1 ? "" : filePath.slice(dot).toLowerCase();
	if (ext === ".html" || ext === ".htm") return "text/html; charset=utf-8";
	if (ext === ".json") return "application/json; charset=utf-8";
	if (ext === ".yaml" || ext === ".yml") return "text/yaml; charset=utf-8";
	return "text/plain; charset=utf-8";
}
/**
* 校验一个文件是否在某个已注册工作区的 openspec/ 目录内、存在、
* 且小于 2MB。返回 stat 或 error（直接可用于 writeError）。
*/
async function checkPreviewableFile(ctx, filePath) {
	if (!ctx.workspaceRegistry.list().some((ws) => filePath.startsWith(join(ws.path, "openspec") + "/"))) return { error: {
		code: "forbidden",
		message: "path is outside any registered workspace openspec/ directory",
		status: 403
	} };
	let stat;
	try {
		stat = await promises.stat(filePath);
	} catch {
		return { error: {
			code: "not-found",
			message: "file not found",
			status: 404
		} };
	}
	if (!stat.isFile()) return { error: {
		code: "not-found",
		message: "not a file",
		status: 404
	} };
	const limit = filePath.endsWith(".js") || filePath.endsWith(".css") ? 1e7 : 2e6;
	if (stat.size > limit) return { error: {
		code: "too-large",
		message: `file larger than ${limit} bytes`,
		status: 413
	} };
	return { stat: {
		bytes: stat.size,
		mtime: stat.mtime.toISOString()
	} };
}
function writeJson(res, status, body) {
	const r = res;
	r.setHeader("content-type", "application/json");
	r.statusCode = status;
	r.end(JSON.stringify(body));
}
function writeOk(res, value) {
	writeJson(res, 200, {
		ok: true,
		value
	});
}
function writeError(res, code, message, status = 400) {
	writeJson(res, status, {
		ok: false,
		error: {
			code,
			message
		}
	});
}
/** 解析单个请求的 JSON body，带大小上限。 */
async function readJsonBody(req) {
	const chunks = [];
	let size = 0;
	for await (const chunk of req) {
		const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
		size += buf.length;
		if (size > 1e6) throw new Error("payload too large");
		chunks.push(buf);
	}
	if (chunks.length === 0) return {};
	return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
const Config = z.object({ scanDepth: z.number().step(1).min(1).max(8).default(MAX_SCAN_DEPTH) });
function apply(ctx, config) {
	ctx.inject(["settings"], (sctx) => {
		const scope = sctx.settings.register(PREFS_NS, PrefsSchema);
		const readPrefs = () => scope.get();
		const updatePrefs = async (patch) => {
			await sctx.settings.update(PREFS_NS, patch);
			return readPrefs();
		};
		const requireString = (body, key) => {
			const value = body[key];
			if (typeof value !== "string" || value.length === 0) throw new Error(`${key} must be a non-empty string`);
			return value;
		};
		ctx.effect(() => ctx.webServer.register({
			kind: "prefix",
			path: "/openspec/api",
			handler: async (req, res) => {
				if (!isTrustedApiRequest(req.headers?.host)) {
					writeError(res, "forbidden", "forbidden", 403);
					return;
				}
				const url = new URL(req.url ?? "/", "http://localhost");
				if (req.method === "GET" && url.pathname.startsWith("/openspec/api/raw/")) {
					const rest = url.pathname.slice(18);
					const slash = rest.indexOf("/");
					if (slash === -1) {
						writeError(res, "bad-request", "missing path", 400);
						return;
					}
					const wsId = decodeURIComponent(rest.slice(0, slash));
					const relPath = decodeURIComponent(rest.slice(slash + 1));
					let ws = ctx.workspaceRegistry.list().find((w) => w.id === wsId);
					if (ws === void 0) try {
						const decodedPath = Buffer.from(wsId, "base64").toString("utf8");
						ws = ctx.workspaceRegistry.list().find((w) => w.path === decodedPath);
					} catch {}
					if (ws === void 0) {
						writeError(res, "not-found", "unknown workspace", 404);
						return;
					}
					const filePath = join(ws.path, "openspec", relPath);
					if (!filePath.startsWith(join(ws.path, "openspec") + "/")) {
						writeError(res, "forbidden", "path escapes openspec/ directory", 403);
						return;
					}
					if (!isPreviewablePath(filePath)) {
						writeError(res, "forbidden", "file type not previewable", 403);
						return;
					}
					const check = await checkPreviewableFile(ctx, filePath);
					if (check.error !== void 0) {
						writeError(res, check.error.code, check.error.message, check.error.status);
						return;
					}
					const content = await promises.readFile(filePath);
					const r = res;
					r.setHeader("content-type", contentTypeFor(filePath));
					r.statusCode = 200;
					r.end(content);
					return;
				}
				const method = url.pathname.replace(/^\/openspec\/api\//u, "");
				try {
					if (method === "prefs.get") {
						writeOk(res, readPrefs());
						return;
					}
					const body = await readJsonBody(req);
					switch (method) {
						case "dir.list": {
							const path = typeof body.path === "string" && body.path !== "" ? body.path : void 0;
							const picker = ctx.get("directoryPicker");
							const capability = picker?.capability();
							if (picker === void 0 || capability === void 0 || capability.kind !== "browse") {
								writeError(res, "picker-unavailable", "directory browsing unavailable on this host", 501);
								return;
							}
							const listing = await capability.list(path);
							writeOk(res, {
								path: listing.path,
								home: listing.home,
								ancestors: listing.ancestors,
								entries: listing.entries.filter((entry) => !entry.hidden),
								truncated: listing.truncated ?? false
							});
							return;
						}
						case "pick": {
							const picker = ctx.get("directoryPicker");
							const capability = picker?.capability();
							if (picker === void 0 || capability === void 0) {
								writeError(res, "picker-unavailable", "directory picker unavailable on this host", 501);
								return;
							}
							if (capability.kind !== "native") {
								writeError(res, "pick-unsupported", "host picker is browse-only; use the in-app browser", 501);
								return;
							}
							writeOk(res, { path: await capability.pick(new AbortController().signal) ?? null });
							return;
						}
						case "diag": {
							const dir = requireString(body, "path");
							const report = { dir };
							try {
								const stat = await promises.stat(dir);
								report.stat = {
									isDirectory: stat.isDirectory(),
									mode: stat.mode
								};
							} catch (error) {
								report.statError = error instanceof Error ? error.message : String(error);
							}
							try {
								const entries = await promises.readdir(dir, { withFileTypes: true });
								report.entryCount = entries.length;
								report.firstEntries = entries.slice(0, 8).map((entry) => ({
									name: entry.name,
									isDirectory: entry.isDirectory(),
									isSymbolicLink: entry.isSymbolicLink()
								}));
								const wanted = typeof body.probeName === "string" && body.probeName !== "" ? body.probeName : void 0;
								const probe = entries.find((entry) => entry.isDirectory() && !SKIP_DIRS.has(entry.name) && (wanted === void 0 || entry.name === wanted));
								if (probe !== void 0) {
									const child = join(dir, probe.name);
									report.probe = {
										name: probe.name,
										path: child,
										isOpenspec: await isOpenspecProject(child)
									};
									try {
										const childStat = await promises.stat(child);
										report.probe.statIsDirectory = childStat.isDirectory();
									} catch (error) {
										report.probe.statError = error instanceof Error ? error.message : String(error);
									}
								}
							} catch (error) {
								report.readdirError = error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error);
							}
							try {
								const subdirs = await listSubdirectories(dir, MAX_SCAN_DEPTH);
								report.subdirCount = subdirs.length;
								report.subdirSample = subdirs.slice(0, 12);
								const matches = [];
								for (const child of subdirs) if (await isOpenspecProject(child)) matches.push(child);
								report.scanMatches = matches;
							} catch (error) {
								report.scanTraceError = error instanceof Error ? `${error.code ?? ""} ${error.message}\n${error.stack ?? ""}` : String(error);
							}
							writeOk(res, report);
							return;
						}
						case "scanAndImportAll": {
							const rootDir = requireString(body, "path");
							const rootStat = await promises.stat(rootDir).catch(() => void 0);
							if (rootStat === void 0 || !rootStat.isDirectory()) {
								writeError(res, "not-a-directory", `${rootDir} is not a readable directory`);
								return;
							}
							const projects = await scanOpenspecProjects(rootDir);
							const imported = [];
							const existing = [];
							const failed = [];
							for (const project of projects) try {
								const alreadyWorkspace = ctx.workspaceRegistry.list().some((ws) => ws.path === project.path);
								if (!alreadyWorkspace) await ctx.workspaceRegistry.create(project.path, basename(project.path) || project.path);
								const prefs = readPrefs();
								if (!prefs.projects.includes(project.path)) await updatePrefs({
									...prefs,
									projects: [...prefs.projects, project.path]
								});
								(alreadyWorkspace ? existing : imported).push(project.path);
							} catch (error) {
								failed.push({
									path: project.path,
									message: error instanceof Error ? error.message : String(error)
								});
							}
							await updatePrefs({
								...readPrefs(),
								lastScanRoot: rootDir
							});
							writeOk(res, {
								root: rootDir,
								count: projects.length,
								imported,
								existing,
								failed,
								projects
							});
							return;
						}
						case "scan": {
							const rootDir = requireString(body, "path");
							const projects = await scanOpenspecProjects(rootDir);
							await updatePrefs({
								...readPrefs(),
								lastScanRoot: rootDir
							});
							let diag;
							if (projects.length === 0) {
								diag = { node: process.version };
								try {
									const entries = await promises.readdir(rootDir, { withFileTypes: true });
									diag.entryCount = entries.length;
									diag.dirNames = entries.filter((entry) => entry.isDirectory()).slice(0, 10).map((entry) => entry.name);
									diag.readdirWorks = true;
								} catch (error) {
									diag.readdirWorks = false;
									diag.readdirError = error instanceof Error ? `${error.code ?? ""} ${error.message}` : String(error);
								}
							}
							writeOk(res, {
								root: rootDir,
								projects,
								...diag !== void 0 ? { diag } : {}
							});
							return;
						}
						case "import": {
							const rootDir = requireString(body, "path");
							const stat = await promises.stat(join(rootDir, "openspec", "changes")).catch(() => void 0);
							if (stat === void 0 || !stat.isDirectory()) {
								writeError(res, "not-openspec", `${rootDir} is not an OpenSpec project (openspec/changes missing)`);
								return;
							}
							const existing = ctx.workspaceRegistry.list().find((ws) => ws.path === rootDir);
							if (existing === void 0) await ctx.workspaceRegistry.create(rootDir, basename(rootDir) || rootDir);
							const prefs = readPrefs();
							if (!prefs.projects.includes(rootDir)) await updatePrefs({
								...prefs,
								projects: [...prefs.projects, rootDir]
							});
							writeOk(res, {
								imported: rootDir,
								workspaceExisted: existing !== void 0
							});
							return;
						}
						case "remove": {
							const rootDir = requireString(body, "path");
							const prefs = readPrefs();
							await updatePrefs({
								...prefs,
								projects: prefs.projects.filter((p) => p !== rootDir)
							});
							const ws = ctx.workspaceRegistry.list().find((w) => w.path === rootDir);
							if (ws !== void 0) await ctx.workspaceRegistry.delete(ws.id);
							writeOk(res, {
								removed: rootDir,
								workspaceDeleted: ws !== void 0
							});
							return;
						}
						case "overview": {
							const workspaces = ctx.workspaceRegistry.list();
							const all = await Promise.all(workspaces.map(async (ws) => ({
								ws,
								changes: await readProjectChanges(ws.path),
								isOpenspec: await isOpenspecProject(ws.path)
							})));
							const openspecProjects = all.filter((entry) => entry.isOpenspec).map((entry) => ({
								path: entry.ws.path,
								name: entry.ws.title || basename(entry.ws.path) || entry.ws.path,
								stillValid: entry.isOpenspec,
								changes: entry.changes
							}));
							const registryPaths = new Set(workspaces.map((ws) => ws.path));
							const prefs = readPrefs();
							const reconciled = prefs.projects.filter((p) => registryPaths.has(p));
							for (const entry of all) if (entry.isOpenspec && !reconciled.includes(entry.ws.path)) reconciled.push(entry.ws.path);
							if (reconciled.length !== prefs.projects.length || reconciled.some((p, i) => p !== prefs.projects[i])) await updatePrefs({
								...prefs,
								projects: reconciled
							});
							writeOk(res, { projects: openspecProjects });
							return;
						}
						case "file.read": {
							const filePath = requireString(body, "path");
							if (!isPreviewablePath(filePath)) {
								writeError(res, "forbidden", "file type not previewable", 403);
								return;
							}
							const check = await checkPreviewableFile(ctx, filePath);
							if (check.error !== void 0) {
								writeError(res, check.error.code, check.error.message, check.error.status);
								return;
							}
							const content = await promises.readFile(filePath, "utf8");
							writeOk(res, {
								path: filePath,
								bytes: check.stat.bytes,
								mtime: check.stat.mtime,
								content
							});
							return;
						}
						default: writeError(res, "unknown-method", `unknown method ${method}`, 404);
					}
				} catch (error) {
					writeError(res, "error", error instanceof Error ? error.message : String(error));
				}
			}
		}));
	});
}
//#endregion
export { Config, apply, inject, name, readProjectChanges, scanOpenspecProjects };

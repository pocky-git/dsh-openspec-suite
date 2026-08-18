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
/** 读取一个 change 目录并汇总为进度摘要。 */
async function readChange(changeDir, changeName, signal) {
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
	try {
		const entries = await promises.readdir(changeDir, { withFileTypes: true });
		for (const entry of entries) {
			if (signal?.aborted) return null;
			if (entry.name === "proposal.md") artifacts.proposal = true;
			else if (entry.name === "design.md") artifacts.design = true;
			else if (entry.name === "tasks.md") {
				artifacts.tasks = true;
				try {
					tasksProgress = parseTasks(await promises.readFile(join(changeDir, "tasks.md"), "utf8"));
				} catch {}
			} else if (entry.name === "specs" && entry.isDirectory()) artifacts.specs = (await promises.readdir(join(changeDir, "specs"), { withFileTypes: true })).some((candidate) => candidate.isFile() && candidate.name.endsWith(".md"));
		}
	} catch {
		return null;
	}
	return {
		name: changeName,
		artifacts,
		tasks: tasksProgress
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
	const changes = [];
	for (const entry of entries) {
		if (signal?.aborted) break;
		if (!entry.isDirectory() || entry.name === "archive") continue;
		const change = await readChange(join(changesDir, entry.name), entry.name, signal);
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
				const method = new URL(req.url ?? "/", "http://localhost").pathname.replace(/^\/openspec\/api\//u, "");
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
